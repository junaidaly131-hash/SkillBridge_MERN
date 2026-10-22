import test from 'node:test';
import assert from 'node:assert/strict';
import EmailCampaign from '../models/EmailCampaign.js';
import EmailCampaignDelivery from '../models/EmailCampaignDelivery.js';
import { AI_TUTOR_CAMPAIGN_TEMPLATE, escapeHtml, renderCampaignEmail, validateCampaignContent } from '../utils/emailCampaignTemplate.js';
import { dedupeAudience, evaluateCampaignEligibility, looksLikeEmail, normalizeEmail } from '../utils/emailCampaignEligibility.js';
import { hashUnsubscribeToken, makeUnsubscribeToken, safeTokenMatch } from '../utils/marketingUnsubscribe.js';
import { classifyCampaignSendError } from '../services/emailCampaignService.js';
import { isHardBounce, RESEND_EVENT_STATUS, shouldApplyProviderEvent } from '../utils/emailCampaignWebhook.js';
import adminEmailCampaignRouter from '../routes/adminEmailCampaign.routes.js';
import { sendMarketingEmailWithClient } from '../utils/emailService.js';
import { assertCampaignSendConfig } from '../config/emailCampaign.js';

const objectId = '507f1f77bcf86cd799439011';
const eligibleUser = (overrides = {}) => ({
  _id: objectId, name: 'Junaid Ali', email: ' JUNAID@example.com ', role: 'user', isSuspended: false,
  emailVerifiedAt: new Date(), marketingPreference: { status: 'opted_in' },
  skillsLearning: [{ name: 'React' }], skillsTeaching: [{ name: 'Node' }], ...overrides,
});

test('normalizes recipient email', () => assert.equal(normalizeEmail(' A@Example.COM '), 'a@example.com'));
test('rejects malformed recipient email', () => assert.equal(looksLikeEmail('not-an-email'), false));
test('eligible learner/teacher can be included once', () => {
  const row = evaluateCampaignEligibility(eligibleUser(), new Set());
  assert.equal(row.eligible, true); assert.equal(row.isStudent, true); assert.equal(row.isTeacher, true);
});
test('admin accounts are excluded', () => assert.equal(evaluateCampaignEligibility(eligibleUser({ role: 'admin' }), new Set()).skipReason, 'admin_account'));
test('suspended accounts are excluded', () => assert.equal(evaluateCampaignEligibility(eligibleUser({ isSuspended: true }), new Set()).skipReason, 'suspended'));
test('unverified accounts are excluded', () => assert.equal(evaluateCampaignEligibility(eligibleUser({ emailVerifiedAt: null }), new Set()).skipReason, 'email_unverified'));
test('unknown consent is excluded', () => assert.equal(evaluateCampaignEligibility(eligibleUser({ marketingPreference: { status: 'unknown' } }), new Set()).skipReason, 'consent_unknown'));
test('opted-out accounts are excluded', () => assert.equal(evaluateCampaignEligibility(eligibleUser({ marketingPreference: { status: 'opted_out' } }), new Set()).skipReason, 'opted_out'));
test('suppressed email is excluded', () => assert.equal(evaluateCampaignEligibility(eligibleUser(), new Set(['junaid@example.com'])).skipReason, 'suppressed'));
test('legacy launch audience includes users without recorded verification or consent', () => {
  const row = evaluateCampaignEligibility(
    eligibleUser({ emailVerifiedAt: null, marketingPreference: { status: 'unknown' } }),
    new Set(),
    { allowLegacyAudience: true }
  );
  assert.equal(row.eligible, true);
});
test('legacy launch audience still respects explicit opt-out and suppression', () => {
  const options = { allowLegacyAudience: true };
  assert.equal(evaluateCampaignEligibility(eligibleUser({ marketingPreference: { status: 'opted_out' } }), new Set(), options).skipReason, 'opted_out');
  assert.equal(evaluateCampaignEligibility(eligibleUser(), new Set(['junaid@example.com']), options).skipReason, 'suppressed');
});
test('audience deduplicates both user id and normalized email', () => {
  const rows = dedupeAudience([
    { userId: '1', normalizedEmail: 'A@example.com' },
    { userId: '1', normalizedEmail: 'b@example.com' },
    { userId: '2', normalizedEmail: 'a@example.com' },
    { userId: '3', normalizedEmail: 'c@example.com' },
  ]);
  assert.deepEqual(rows.map((row) => row.userId), ['1', '3']);
});
test('default AI Tutor content passes validation', () => assert.equal(validateCampaignContent(AI_TUTOR_CAMPAIGN_TEMPLATE).valid, true));
test('subject header injection is rejected', () => assert.equal(validateCampaignContent({ ...AI_TUTOR_CAMPAIGN_TEMPLATE, subject: 'Hello\nBcc: victim@example.com' }).valid, false));
test('unknown template token is rejected', () => assert.equal(validateCampaignContent({ ...AI_TUTOR_CAMPAIGN_TEMPLATE, message: 'Hi {{email}}' }).valid, false));
test('non-HTTPS CTA is rejected', () => assert.equal(validateCampaignContent({ ...AI_TUTOR_CAMPAIGN_TEMPLATE, ctaUrl: 'http://skill-bridge.me' }).valid, false));
test('unapproved CTA origin is rejected', () => assert.equal(validateCampaignContent({ ...AI_TUTOR_CAMPAIGN_TEMPLATE, ctaUrl: 'https://evil.example/phish' }).valid, false));
test('HTML renderer escapes editable content', () => {
  const rendered = renderCampaignEmail({ content: { ...AI_TUTOR_CAMPAIGN_TEMPLATE, message: '<script>alert(1)</script>' }, recipientName: '<Admin>', unsubscribeUrl: 'https://example.com/u' });
  assert.ok(!rendered.html.includes('<script>')); assert.ok(rendered.html.includes('&lt;script&gt;'));
});
test('renderer interpolates only first name', () => {
  const rendered = renderCampaignEmail({ content: AI_TUTOR_CAMPAIGN_TEMPLATE, recipientName: 'Junaid Ali', unsubscribeUrl: 'https://example.com/u' });
  assert.ok(rendered.text.includes('Hi Junaid,'));
});
test('HTML renderer uses the public SkillBridge logo and responsive branded layout', () => {
  const original = process.env.FRONTEND_URL;
  process.env.FRONTEND_URL = 'https://www.skill-bridge.me';
  try {
    const rendered = renderCampaignEmail({
      content: AI_TUTOR_CAMPAIGN_TEMPLATE,
      recipientName: 'Junaid Ali',
      unsubscribeUrl: 'https://api.skill-bridge.me/unsubscribe/token',
    });
    assert.ok(rendered.html.includes('src="https://www.skill-bridge.me/assets/logo.png"'));
    assert.ok(rendered.html.includes('alt="SkillBridge"'));
    assert.ok(rendered.html.includes('@media only screen and (max-width:620px)'));
    assert.ok(rendered.html.includes('Learn &nbsp;&bull;&nbsp; Teach &nbsp;&bull;&nbsp; Grow'));
    assert.ok(rendered.html.includes('Unsubscribe from marketing emails'));
  } finally {
    if (original === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = original;
  }
});
test('HTML escaping covers quotes and ampersands', () => assert.equal(escapeHtml('A&B"'), 'A&amp;B&quot;'));
test('unsubscribe token is deterministic and opaque', () => {
  const token = makeUnsubscribeToken(objectId, 'a-long-secret');
  assert.equal(token, makeUnsubscribeToken(objectId, 'a-long-secret'));
  assert.ok(!token.includes(objectId));
});
test('unsubscribe token comparison rejects tampering', () => {
  const token = makeUnsubscribeToken(objectId, 'a-long-secret');
  assert.equal(safeTokenMatch(token, hashUnsubscribeToken(token)), true);
  assert.equal(safeTokenMatch(`${token}x`, hashUnsubscribeToken(token)), false);
});
test('429 and provider 5xx are retryable', () => {
  assert.equal(classifyCampaignSendError({ statusCode: 429 }).kind, 'retryable');
  assert.equal(classifyCampaignSendError({ statusCode: 503 }).kind, 'retryable');
});
test('authentication/configuration failure stops a campaign', () => assert.equal(classifyCampaignSendError({ statusCode: 401 }).kind, 'configuration'));
test('campaign sending does not require webhook tracking to be configured', () => {
  const names = [
    'EMAIL_CAMPAIGN_ENABLED', 'RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET',
    'MARKETING_UNSUBSCRIBE_SECRET', 'MARKETING_FROM', 'MARKETING_FROM_NAME',
    'FRONTEND_URL', 'BACKEND_URL', 'EMAIL_CAMPAIGN_LEASE_MS',
    'EMAIL_CAMPAIGN_REQUEST_TIMEOUT_MS',
  ];
  const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    Object.assign(process.env, {
      EMAIL_CAMPAIGN_ENABLED: 'true',
      RESEND_API_KEY: 'test-key',
      MARKETING_UNSUBSCRIBE_SECRET: 'test-unsubscribe-secret',
      MARKETING_FROM: 'noreply@example.com',
      MARKETING_FROM_NAME: 'SkillBridge',
      FRONTEND_URL: 'https://example.com',
      BACKEND_URL: 'https://api.example.com',
      EMAIL_CAMPAIGN_LEASE_MS: '120000',
      EMAIL_CAMPAIGN_REQUEST_TIMEOUT_MS: '30000',
    });
    delete process.env.RESEND_WEBHOOK_SECRET;
    const config = assertCampaignSendConfig();
    assert.equal(config.webhookConfigured, false);
  } finally {
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
});
test('network outcome without HTTP status is ambiguous', () => assert.equal(classifyCampaignSendError({ code: 'ETIMEDOUT' }).kind, 'ambiguous'));
test('older webhook cannot roll delivery state backwards', () => assert.equal(shouldApplyProviderEvent({ currentAt: '2026-10-21T12:00:00Z', currentRank: 30, incomingAt: '2026-10-21T11:59:00Z', incomingRank: 60 }), false));
test('higher-ranked same-time webhook wins deterministically', () => assert.equal(shouldApplyProviderEvent({ currentAt: '2026-10-21T12:00:00Z', currentRank: 30, incomingAt: '2026-10-21T12:00:00Z', incomingRank: 50 }), true));
test('only hard/permanent bounce is suppressed', () => {
  assert.equal(isHardBounce('email.bounced', 'soft'), false);
  assert.equal(isHardBounce('email.bounced', 'permanent'), true);
  assert.equal(isHardBounce('email.failed', 'permanent'), false);
});
test('provider delivered event is distinct from accepted', () => {
  assert.equal(RESEND_EVENT_STATUS['email.sent'].status, 'accepted');
  assert.equal(RESEND_EVENT_STATUS['email.delivered'].status, 'delivered');
});
test('delivery schema enforces campaign user and email uniqueness', () => {
  const indexes = EmailCampaignDelivery.schema.indexes();
  assert.ok(indexes.some(([keys, options]) => keys.campaign === 1 && keys.user === 1 && options.unique));
  assert.ok(indexes.some(([keys, options]) => keys.campaign === 1 && keys.normalizedEmail === 1 && options.unique));
});
test('campaign state machine includes a non-send preparation state', () => {
  assert.ok(EmailCampaign.schema.path('state').enumValues.includes('preparing'));
});
test('every campaign endpoint is behind authentication and admin authorization', () => {
  assert.deepEqual(adminEmailCampaignRouter.stack.slice(0, 2).map((layer) => layer.name), ['authenticateToken', 'requireAdmin']);
});
test('mocked Resend client receives stable idempotency and one-click headers without a real send', async () => {
  let observed;
  const client = { emails: { send: async (...args) => { observed = args; return { data: { id: 'mock-message-id' }, error: null }; } } };
  const result = await sendMarketingEmailWithClient(client, {
    from: 'SkillBridge <noreply@skill-bridge.me>', to: 'member@example.com', subject: 'Update', html: '<p>Safe</p>', text: 'Safe',
    headers: { 'List-Unsubscribe': '<https://api.example/u/token>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    tags: [{ name: 'delivery_id', value: objectId }], idempotencyKey: `campaign/test/${objectId}`,
  });
  assert.equal(result.messageId, 'mock-message-id');
  assert.equal(observed[1].idempotencyKey, `campaign/test/${objectId}`);
  assert.equal(observed[0].headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.deepEqual(observed[0].tags, [{ name: 'delivery_id', value: objectId }]);
});


import test from 'node:test';
import assert from 'node:assert/strict';
import ExternalMarketingContact from '../models/ExternalMarketingContact.js';
import ExternalContactImport from '../models/ExternalContactImport.js';
import EmailCampaignDelivery from '../models/EmailCampaignDelivery.js';
import externalContactRouter from '../routes/externalMarketingContact.routes.js';
import {
  EXTERNAL_CONTACT_FIELDS,
  csvCell,
  parseCsv,
  sampleExternalContactsCsv,
  spreadsheetSafe,
  suggestHeaderMapping,
  validateHeaderMapping,
  validateMappedContact,
} from '../utils/externalContactCsv.js';
import { evaluateExternalContactEligibility, mergeAudienceByEmail } from '../utils/emailCampaignEligibility.js';
import { INTRODUCE_SKILLBRIDGE_TEMPLATE, renderCampaignEmail, validateCampaignContent } from '../utils/emailCampaignTemplate.js';
import { requireAdmin } from '../middleware/admin.js';
import User from '../models/User.js';

const mapping = Object.fromEntries(EXTERNAL_CONTACT_FIELDS.map((field) => [field, field]));
const raw = (overrides = {}) => ({
  name: 'عائشہ خان', email: ' AYESHA@example.com ', contact_type: 'student', institution: 'Example, University', city: 'Lahore', tags: 'beta;urdu', source: 'Event registration',
  permission_status: 'documented', permission_source: 'signup checkbox', permission_at: '2026-10-01T10:00:00Z', permission_reference: 'registration-123', ...overrides,
});

test('CSV parser accepts BOM, CRLF, Urdu, quoted commas, and quoted newlines', () => {
  const csv = `\uFEFFname,email,source\r\n"عائشہ، خان",a@example.com,"Line one, detail\nLine two"\r\n`;
  const parsed = parseCsv(csv);
  assert.equal(parsed.rows[0].raw.name, 'عائشہ، خان');
  assert.equal(parsed.rows[0].raw.source, 'Line one, detail\nLine two');
});

test('CSV parser rejects unterminated quoted fields', () => assert.throws(() => parseCsv('email,name\na@example.com,"broken'), /unterminated/));
test('CSV parser rejects malformed quote placement', () => assert.throws(() => parseCsv('email,name\na@example.com,"ok"junk'), /closing quote/));
test('CSV parser rejects binary control bytes', () => assert.throws(() => parseCsv('email\na@example.com\u0001'), /UTF-8 text/));
test('CSV parser enforces its row ceiling', () => assert.throws(() => parseCsv('email\na@x.com\nb@x.com', { maxRows: 1 }), /more than 1/));
test('header mapping requires email', () => assert.throws(() => validateHeaderMapping(['name'], { name: 'name' }), /required email/));
test('header suggestions recognise common aliases', () => assert.equal(suggestHeaderMapping(['full_name', 'email_address']).email, 'email_address'));

test('documented permission requires source, timestamp, and evidence', () => {
  const result = validateMappedContact(raw({ permission_source: '', permission_reference: '' }), mapping);
  assert.equal(result.value.permission.status, 'unknown');
  assert.match(result.warnings[0], /remains unknown/);
});

test('a true CSV flag alone never establishes permission', () => {
  const result = validateMappedContact(raw({ permission_status: 'true', permission_source: '', permission_at: '', permission_reference: '' }), mapping);
  assert.equal(result.value.permission.status, 'unknown');
});

test('invalid and future permission dates are rejected', () => {
  assert.ok(validateMappedContact(raw({ permission_at: 'not-a-date' }), mapping).errors.length);
  assert.ok(validateMappedContact(raw({ permission_at: '10/01/2026' }), mapping).errors.length);
  assert.ok(validateMappedContact(raw({ permission_at: '2999-01-01T00:00:00Z' }), mapping).errors.length);
});

test('mapped contact normalizes email without provider-specific rewriting', () => {
  const result = validateMappedContact(raw({ email: ' A.Yes+course@GMAIL.com ' }), mapping);
  assert.equal(result.value.normalizedEmail, 'a.yes+course@gmail.com');
});

test('external unknown permission is ineligible', () => {
  const row = evaluateExternalContactEligibility({ _id: '1', email: 'a@example.com', permission: { status: 'unknown' } });
  assert.equal(row.skipReason, 'permission_unknown');
});

test('suppression wins over documented external permission', () => {
  const row = evaluateExternalContactEligibility({ _id: '1', email: 'a@example.com', permission: { status: 'documented' } }, new Set(['a@example.com']));
  assert.equal(row.skipReason, 'suppressed');
});

test('cross-audience merge creates one recipient and any restriction wins', () => {
  const merged = mergeAudienceByEmail([
    { userId: '1', sourceKind: 'user', normalizedEmail: 'A@example.com', eligible: true },
    { externalContactId: '2', sourceKind: 'external', normalizedEmail: 'a@example.com', eligible: false, skipReason: 'unsubscribed' },
  ]);
  assert.equal(merged.length, 1); assert.equal(merged[0].eligible, false); assert.equal(merged[0].provenance.length, 2);
});

test('spreadsheet exports neutralize formula cells', () => {
  assert.equal(spreadsheetSafe('=HYPERLINK("bad")').startsWith("'="), true);
  assert.equal(csvCell('+SUM(1,2)').startsWith("\"'+"), true);
});

test('sample CSV has the documented headers', () => assert.equal(sampleExternalContactsCsv().split(/\r?\n/)[0], EXTERNAL_CONTACT_FIELDS.join(',')));

test('Introduce SkillBridge template is valid, escaped, and uses there fallback', () => {
  assert.equal(validateCampaignContent(INTRODUCE_SKILLBRIDGE_TEMPLATE).valid, true);
  const rendered = renderCampaignEmail({ content: { ...INTRODUCE_SKILLBRIDGE_TEMPLATE, message: 'Hi {{firstName}}, <script>x</script>' }, recipientName: '', unsubscribeUrl: 'https://example.com/u' });
  assert.ok(rendered.text.includes('Hi there,')); assert.ok(!rendered.html.includes('<script>')); assert.ok(rendered.html.includes('Unsubscribe'));
});

test('external contact model has unique normalized email and indexed filters', () => {
  const indexes = ExternalMarketingContact.schema.indexes();
  assert.ok(indexes.some(([keys, options]) => keys.normalizedEmail === 1 && options.unique));
  assert.ok(indexes.some(([keys]) => keys.tags === 1));
});

test('campaign delivery has source-aware partial unique indexes plus canonical email uniqueness', () => {
  const indexes = EmailCampaignDelivery.schema.indexes();
  assert.ok(indexes.some(([keys, options]) => keys.campaign === 1 && keys.externalContact === 1 && options.unique && options.partialFilterExpression));
  assert.ok(indexes.some(([keys, options]) => keys.campaign === 1 && keys.normalizedEmail === 1 && options.unique));
});

test('preview model expires abandoned rows but preserves completed history without expiry', () => {
  const indexes = ExternalContactImport.schema.indexes();
  assert.ok(indexes.some(([keys, options]) => keys.expiresAt === 1 && options.expireAfterSeconds === 0));
});

test('all external-contact management routes require authentication and admin authorization', () => {
  assert.deepEqual(externalContactRouter.stack.slice(0, 2).map((layer) => layer.name), ['authenticateToken', 'requireAdmin']);
});

test('non-admin accounts are rejected by management authorization', async () => {
  const original = User.findById;
  User.findById = () => ({ select: async () => ({ role: 'user' }) });
  let response;
  try {
    await requireAdmin({ user: { userId: 'member' } }, { status(code) { response = { code }; return { json(body) { response.body = body; } }; } }, () => { throw new Error('must not authorize'); });
  } finally { User.findById = original; }
  assert.equal(response.code, 403); assert.equal(response.body.message, 'Admin access required');
});

import cron from 'node-cron';
import crypto from 'crypto';
import EmailCampaign from '../models/EmailCampaign.js';
import EmailCampaignDelivery from '../models/EmailCampaignDelivery.js';
import MarketingSuppression from '../models/MarketingSuppression.js';
import User from '../models/User.js';
import { getEmailCampaignConfig, assertCampaignSendConfig } from '../config/emailCampaign.js';
import { sendMarketingEmail } from '../utils/emailService.js';
import { evaluateCampaignEligibility } from '../utils/emailCampaignEligibility.js';
import { makeUnsubscribeToken } from '../utils/marketingUnsubscribe.js';
import { renderCampaignEmail } from '../utils/emailCampaignTemplate.js';
import { classifyCampaignSendError, refreshCampaignCounts } from '../services/emailCampaignService.js';

const workerId = `mail-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
let running = false;

export async function claimCampaignDelivery(now = new Date()) {
  const { leaseMs, maxAttempts } = getEmailCampaignConfig();
  return EmailCampaignDelivery.findOneAndUpdate(
    {
      active: true,
      status: { $in: ['queued', 'retry_pending', 'sending'] },
      attempts: { $lt: maxAttempts },
      nextAttemptAt: { $lte: now },
      $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }],
    },
    {
      $set: { status: 'sending', leaseOwner: workerId, leaseUntil: new Date(now.getTime() + leaseMs) },
      $inc: { attempts: 1 },
    },
    { new: true, sort: { nextAttemptAt: 1, createdAt: 1 } }
  );
}

async function stopCampaignForConfiguration(delivery, message) {
  await Promise.all([
    EmailCampaign.updateOne({ _id: delivery.campaign }, { $set: { state: 'failed', lastError: message.slice(0, 500) } }),
    EmailCampaignDelivery.updateMany(
      { campaign: delivery.campaign, active: true, status: { $in: ['queued', 'retry_pending'] } },
      { $set: { status: 'failed', active: false, lastErrorCode: 'CAMPAIGN_CONFIG_MISSING', lastErrorMessage: message.slice(0, 500) } }
    ),
  ]);
}

export async function processCampaignDelivery(delivery) {
  const config = assertCampaignSendConfig();
  const [campaign, user, suppression] = await Promise.all([
    EmailCampaign.findById(delivery.campaign).lean(),
    User.findById(delivery.user).select('name email role isSuspended emailVerifiedAt marketingPreference skillsLearning skillsTeaching').lean(),
    MarketingSuppression.findOne({ normalizedEmail: delivery.normalizedEmail, active: true }).lean(),
  ]);
  if (!campaign?.frozenContent) throw Object.assign(new Error('Campaign snapshot is missing'), { code: 'CAMPAIGN_CONFIG_MISSING' });

  const eligibility = evaluateCampaignEligibility(user, new Set(suppression ? [delivery.normalizedEmail] : []));
  if (!eligibility.eligible || eligibility.normalizedEmail !== delivery.normalizedEmail) {
    delivery.status = 'skipped';
    delivery.active = false;
    delivery.skippedReason = eligibility.normalizedEmail !== delivery.normalizedEmail ? 'email_changed' : eligibility.skipReason;
    delivery.leaseUntil = null;
    delivery.leaseOwner = null;
    await delivery.save();
    await refreshCampaignCounts(delivery.campaign);
    return;
  }

  const token = makeUnsubscribeToken(delivery._id);
  const oneClickUrl = `${config.backendUrl}/api/email-preferences/unsubscribe/${token}`;
  const preferenceUrl = `${config.frontendUrl}/unsubscribe/${token}`;
  const rendered = renderCampaignEmail({ content: campaign.frozenContent, recipientName: user.name, unsubscribeUrl: preferenceUrl });
  let timeoutId;
  const sendPromise = sendMarketingEmail({
    from: campaign.senderIdentity,
    to: delivery.normalizedEmail,
    ...rendered,
    idempotencyKey: delivery.idempotencyKey,
    headers: {
      'List-Unsubscribe': `<${oneClickUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    tags: [{ name: 'delivery_id', value: String(delivery._id) }],
  });
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error('Provider outcome is unknown after the request timeout');
      error.code = 'AMBIGUOUS_TIMEOUT';
      reject(error);
    }, config.requestTimeoutMs);
  });
  let result;
  try {
    result = await Promise.race([sendPromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
  if (!result.messageId) throw Object.assign(new Error('Provider response did not include a message id'), { code: 'AMBIGUOUS_PROVIDER_RESPONSE' });

  delivery.status = 'accepted';
  delivery.active = false;
  delivery.providerMessageId = result.messageId;
  delivery.providerAcceptedAt = new Date();
  delivery.leaseUntil = null;
  delivery.leaseOwner = null;
  await delivery.save();
  await refreshCampaignCounts(delivery.campaign);
}

export async function runEmailCampaignWorkerOnce() {
  const config = getEmailCampaignConfig();
  if (!config.enabled || running) return 0;
  running = true;
  let handled = 0;
  try {
    // A process may die after claiming a row. Once its lease and retry budget
    // are both exhausted, preserve the uncertain outcome for manual review.
    const exhaustedFilter = { active: true, status: 'sending', leaseUntil: { $lte: new Date() }, attempts: { $gte: config.maxAttempts } };
    const exhaustedCampaigns = await EmailCampaignDelivery.distinct('campaign', exhaustedFilter);
    await EmailCampaignDelivery.updateMany(
      exhaustedFilter,
      { $set: { status: 'unknown', active: false, leaseUntil: null, leaseOwner: null, lastErrorCode: 'LEASE_EXHAUSTED', lastErrorMessage: 'Worker stopped before confirming the provider outcome.' } }
    );
    await Promise.all(exhaustedCampaigns.map((campaignId) => refreshCampaignCounts(campaignId)));
    for (let index = 0; index < config.concurrency; index += 1) {
      const delivery = await claimCampaignDelivery();
      if (!delivery) break;
      handled += 1;
      await EmailCampaign.updateOne(
        { _id: delivery.campaign, startedAt: null },
        { $set: { state: 'sending', startedAt: new Date() } }
      );
      try {
        await processCampaignDelivery(delivery);
      } catch (error) {
        const kind = classifyCampaignSendError(error);
        const message = String(error.message || 'Campaign delivery failed').slice(0, 500);
        delivery.leaseUntil = null;
        delivery.leaseOwner = null;
        delivery.lastErrorCode = String(error.code || error.statusCode || 'SEND_FAILED').slice(0, 100);
        delivery.lastErrorMessage = message;

        if (kind.kind === 'configuration') {
          delivery.status = 'failed';
          delivery.active = false;
          await delivery.save();
          await stopCampaignForConfiguration(delivery, message);
        } else if (kind.kind === 'retryable' && delivery.attempts < config.maxAttempts) {
          const backoff = kind.retryAfterMs || config.retryBaseMs * (2 ** Math.max(0, delivery.attempts - 1));
          delivery.status = 'retry_pending';
          delivery.nextAttemptAt = new Date(Date.now() + backoff);
          await delivery.save();
        } else if (kind.kind === 'ambiguous') {
          delivery.status = 'unknown';
          delivery.active = false;
          await delivery.save();
        } else {
          delivery.status = 'failed';
          delivery.active = false;
          await delivery.save();
        }
        if (kind.kind !== 'configuration') await refreshCampaignCounts(delivery.campaign);
      }
    }
  } finally {
    running = false;
  }
  return handled;
}

export function startEmailCampaignWorker() {
  cron.schedule('*/5 * * * * *', () => {
    runEmailCampaignWorkerOnce().catch((error) => {
      console.error('Email campaign worker failed:', error.message);
    });
  });
}


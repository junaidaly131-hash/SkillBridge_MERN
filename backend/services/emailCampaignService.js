import crypto from 'crypto';
import User from '../models/User.js';
import EmailCampaign from '../models/EmailCampaign.js';
import EmailCampaignDelivery from '../models/EmailCampaignDelivery.js';
import MarketingSuppression from '../models/MarketingSuppression.js';
import ExternalMarketingContact from '../models/ExternalMarketingContact.js';
import { assertCampaignSendConfig, getEmailCampaignConfig } from '../config/emailCampaign.js';
import {
  dedupeAudience,
  evaluateCampaignEligibility,
  evaluateExternalContactEligibility,
  mergeAudienceByEmail,
  normalizeEmail,
} from '../utils/emailCampaignEligibility.js';
import { hashUnsubscribeToken, makeUnsubscribeToken } from '../utils/marketingUnsubscribe.js';
import { validateCampaignContent } from '../utils/emailCampaignTemplate.js';

export async function buildCampaignAudience({ selectedUserIds, selectedExternalContactIds, source = 'users' } = {}) {
  const { legacyAudienceEnabled } = getEmailCampaignConfig();
  const includeUsers = ['users', 'both'].includes(source);
  const includeExternal = ['external', 'both'].includes(source);
  const userFilter = { role: { $ne: 'admin' } };
  const externalFilter = {};
  if (selectedUserIds) userFilter._id = { $in: selectedUserIds };
  if (selectedExternalContactIds) externalFilter._id = { $in: selectedExternalContactIds };
  const [users, contacts, suppressions] = await Promise.all([
    includeUsers ? User.find(userFilter).select('name email role isSuspended emailVerifiedAt marketingPreference skillsLearning skillsTeaching').lean() : [],
    includeExternal ? ExternalMarketingContact.find(externalFilter).lean() : [],
    MarketingSuppression.find({ active: true }).select('normalizedEmail').lean(),
  ]);
  const suppressed = new Set(suppressions.map((item) => item.normalizedEmail));
  let userRows = dedupeAudience(users.map((user) => evaluateCampaignEligibility(
    user,
    suppressed,
    { allowLegacyAudience: legacyAudienceEnabled }
  )));
  const candidateEmails = [...new Set([
    ...userRows.map((row) => row.normalizedEmail),
    ...contacts.map((contact) => normalizeEmail(contact.normalizedEmail)),
  ].filter(Boolean))];
  const [optedOutUsers, unsubscribedContacts] = candidateEmails.length ? await Promise.all([
    User.find({ email: { $in: candidateEmails }, 'marketingPreference.status': 'opted_out' }).select('email').lean(),
    ExternalMarketingContact.find({ normalizedEmail: { $in: candidateEmails }, 'permission.status': 'unsubscribed' }).select('normalizedEmail').lean(),
  ]) : [[], []];
  const restrictedUsers = new Set(optedOutUsers.map((user) => normalizeEmail(user.email)));
  const restrictedExternal = new Set(unsubscribedContacts.map((contact) => normalizeEmail(contact.normalizedEmail)));
  userRows = userRows.map((row) => restrictedExternal.has(row.normalizedEmail)
    ? { ...row, eligible: false, skipReason: 'unsubscribed' }
    : row);
  const externalRows = contacts.map((contact) => evaluateExternalContactEligibility(contact, suppressed, restrictedUsers));
  return mergeAudienceByEmail([...userRows, ...externalRows]);
}

export async function queueCampaign(campaignId, adminId) {
  const config = assertCampaignSendConfig();
  const campaign = await EmailCampaign.findOne({ _id: campaignId, state: 'draft' });
  if (!campaign) throw Object.assign(new Error('Only a draft campaign can be queued'), { statusCode: 409 });
  const validated = validateCampaignContent(campaign.content);
  if (!validated.valid) throw Object.assign(new Error(validated.errors.join('. ')), { statusCode: 400 });
  if (!campaign.selectedUserIds.length && !campaign.selectedExternalContactIds.length) throw Object.assign(new Error('Select at least one recipient'), { statusCode: 400 });

  const frozenAudience = await buildCampaignAudience({
    selectedUserIds: campaign.selectedUserIds,
    selectedExternalContactIds: campaign.selectedExternalContactIds,
    source: campaign.audienceSource,
  });
  if (frozenAudience.length > config.maxAudience) throw Object.assign(new Error(`Campaign audience exceeds the ${config.maxAudience} recipient limit`), { statusCode: 409 });
  if (!frozenAudience.length) throw Object.assign(new Error('No selected users were found'), { statusCode: 400 });
  if (!frozenAudience.some((row) => row.eligible)) {
    throw Object.assign(new Error('None of the selected users are currently eligible'), { statusCode: 400 });
  }

  const claimed = await EmailCampaign.findOneAndUpdate(
    { _id: campaign._id, state: 'draft' },
    { $set: { state: 'preparing', updatedBy: adminId } },
    { new: true }
  );
  if (!claimed) throw Object.assign(new Error('Campaign was already queued by another request'), { statusCode: 409 });

  try {
    claimed.frozenContent = validated.content;
    claimed.frozenAudience = frozenAudience;
    claimed.senderIdentity = `${config.senderName} <${config.senderAddress}>`;
    claimed.queuedAt = new Date();
    await claimed.save();

    const operations = frozenAudience.map((row) => {
      const deliveryId = crypto.createHash('sha256').update(`${claimed._id}:${row.normalizedEmail}`).digest('hex').slice(0, 24);
      const token = makeUnsubscribeToken(deliveryId);
      return {
        updateOne: {
          filter: { campaign: claimed._id, normalizedEmail: row.normalizedEmail },
          update: { $setOnInsert: {
            _id: deliveryId, campaign: claimed._id,
            user: row.userId || null,
            externalContact: row.externalContactId || null,
            recipientKind: row.sourceKind,
            provenance: row.provenance || [],
            normalizedEmail: row.normalizedEmail, recipientName: row.recipientName,
            isStudent: row.isStudent, isTeacher: row.isTeacher,
            status: row.eligible ? 'queued' : 'skipped', active: row.eligible,
            skippedReason: row.skipReason,
            idempotencyKey: `campaign/${claimed._id}/delivery/${deliveryId}`,
            unsubscribeTokenHash: hashUnsubscribeToken(token),
          } },
          upsert: true,
        },
      };
    });
    await EmailCampaignDelivery.bulkWrite(operations, { ordered: false });
    claimed.state = 'queued';
    await claimed.save();
    await refreshCampaignCounts(claimed._id);
    return EmailCampaign.findById(claimed._id).lean();
  } catch (error) {
    await Promise.all([
      EmailCampaignDelivery.deleteMany({ campaign: claimed._id }),
      EmailCampaign.updateOne({ _id: claimed._id, state: 'preparing' }, { $set: { state: 'draft', lastError: String(error.message).slice(0, 500) } }),
    ]);
    throw error;
  }
}

export async function refreshCampaignCounts(campaignId) {
  const rows = await EmailCampaignDelivery.aggregate([
    { $match: { campaign: typeof campaignId === 'string' ? campaignId : campaignId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const counts = { queued: 0, sending: 0, accepted: 0, delivered: 0, retryPending: 0, failed: 0, skipped: 0, unknown: 0 };
  const keys = { retry_pending: 'retryPending' };
  for (const row of rows) counts[keys[row._id] || row._id] = row.count;
  const outstanding = counts.queued + counts.sending + counts.retryPending;
  const terminalProblems = counts.failed + counts.skipped + counts.unknown;
  const campaign = await EmailCampaign.findById(campaignId).select('state').lean();
  if (!campaign) return counts;
  if (campaign.state === 'cancelled') {
    await EmailCampaign.updateOne({ _id: campaignId, state: 'cancelled' }, { $set: { counts } });
    return counts;
  }
  const update = { counts };
  if (outstanding === 0) {
    update.state = terminalProblems ? 'partial' : 'completed';
    update.completedAt = new Date();
  } else update.state = 'sending';
  await EmailCampaign.updateOne({ _id: campaignId }, { $set: update });
  return counts;
}

export function classifyCampaignSendError(error) {
  const status = Number(error?.statusCode || error?.status || 0);
  const retryAfterSeconds = Number(error?.retryAfter || error?.response?.headers?.['retry-after'] || 0);
  if (error?.code === 'CAMPAIGN_CONFIG_MISSING' || status === 401 || status === 403) return { kind: 'configuration' };
  if (status === 429 || status >= 500) return { kind: 'retryable', retryAfterMs: retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : 0 };
  if (status >= 400) return { kind: 'permanent' };
  // A connection reset/timeout may happen after the provider accepted the
  // request. Do not blindly retry an ambiguous outcome.
  return { kind: 'ambiguous' };
}


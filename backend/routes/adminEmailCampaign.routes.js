import express from 'express';
import mongoose from 'mongoose';
import EmailCampaign from '../models/EmailCampaign.js';
import EmailCampaignDelivery from '../models/EmailCampaignDelivery.js';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { campaignTestLimiter } from '../middleware/rateLimit.js';
import { AI_TUTOR_CAMPAIGN_TEMPLATE, INTRODUCE_SKILLBRIDGE_TEMPLATE, renderCampaignEmail, validateCampaignContent } from '../utils/emailCampaignTemplate.js';
import { buildCampaignAudience, queueCampaign } from '../services/emailCampaignService.js';
import { getEmailCampaignConfig, assertCampaignSendConfig } from '../config/emailCampaign.js';
import { sendMarketingEmail } from '../utils/emailService.js';
import { logAdminAction } from '../utils/auditLog.js';

const router = express.Router();
router.use(authenticateToken, requireAdmin);
const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

const serialize = (campaign) => ({
  id: campaign._id,
  name: campaign.name,
  templateKey: campaign.templateKey,
  templateVersion: campaign.templateVersion,
  state: campaign.state,
  content: campaign.content,
  selectedUserIds: campaign.selectedUserIds,
  selectedExternalContactIds: campaign.selectedExternalContactIds,
  audienceSource: campaign.audienceSource,
  senderIdentity: campaign.senderIdentity,
  counts: campaign.counts,
  queuedAt: campaign.queuedAt,
  startedAt: campaign.startedAt,
  completedAt: campaign.completedAt,
  lastError: campaign.lastError,
  createdAt: campaign.createdAt,
  updatedAt: campaign.updatedAt,
});

router.get('/', route(async (req, res) => {
  const campaigns = await EmailCampaign.find({}).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ campaigns: campaigns.map(serialize), config: getEmailCampaignConfig() });
}));

router.post('/', route(async (req, res) => {
  const templateKey = req.body?.templateKey === 'ai_tutor_announcement' ? 'ai_tutor_announcement' : 'introduce_skillbridge';
  const template = templateKey === 'ai_tutor_announcement' ? AI_TUTOR_CAMPAIGN_TEMPLATE : INTRODUCE_SKILLBRIDGE_TEMPLATE;
  const name = String(req.body?.name || (templateKey === 'introduce_skillbridge' ? 'Introduce SkillBridge' : 'AI Tutor announcement')).trim();
  if (!name || name.length > 120) return res.status(400).json({ message: 'Campaign name must be 1 to 120 characters.' });
  const campaign = await EmailCampaign.create({
    name,
    templateKey,
    content: template,
    createdBy: req.user.userId,
    updatedBy: req.user.userId,
  });
  await logAdminAction({ adminId: req.user.userId, action: 'email_campaign_created', details: { campaignId: campaign._id, name } });
  res.status(201).json({ campaign: serialize(campaign) });
}));

router.post('/preview', route(async (req, res) => {
  const validated = validateCampaignContent(req.body?.content);
  if (!validated.valid) return res.status(400).json({ message: validated.errors.join('. ') });
  res.json(renderCampaignEmail({ content: validated.content, recipientName: req.body?.recipientName || 'Junaid', unsubscribeUrl: '#', preview: true }));
}));

router.get('/audience', route(async (req, res) => {
  const audience = await buildCampaignAudience();
  const reasonCounts = {};
  for (const row of audience) if (!row.eligible) reasonCounts[row.skipReason] = (reasonCounts[row.skipReason] || 0) + 1;
  res.json({
    audience,
    stats: {
      total: audience.length,
      eligible: audience.filter((row) => row.eligible).length,
      students: audience.filter((row) => row.eligible && row.isStudent).length,
      teachers: audience.filter((row) => row.eligible && row.isTeacher).length,
      excluded: audience.filter((row) => !row.eligible).length,
      exclusionReasons: reasonCounts,
    },
  });
}));

router.post('/audience/resolve', route(async (req, res) => {
  const selectedUserIds = Array.isArray(req.body?.selectedUserIds) ? [...new Set(req.body.selectedUserIds.map(String))] : [];
  const selectedExternalContactIds = Array.isArray(req.body?.selectedExternalContactIds) ? [...new Set(req.body.selectedExternalContactIds.map(String))] : [];
  const source = ['users', 'external', 'both'].includes(req.body?.source) ? req.body.source : 'users';
  const max = getEmailCampaignConfig().maxAudience;
  if (selectedUserIds.length > max || selectedExternalContactIds.length > max || [...selectedUserIds, ...selectedExternalContactIds].some((id) => !mongoose.isValidObjectId(id))) {
    return res.status(400).json({ message: 'Selected audience is invalid or exceeds the configured limit.' });
  }
  const audience = await buildCampaignAudience({ selectedUserIds, selectedExternalContactIds, source });
  if (audience.length > max) return res.status(409).json({ message: `Unique audience exceeds the ${max} recipient limit.` });
  res.json({
    selectedSourceRecords: selectedUserIds.length + selectedExternalContactIds.length,
    uniqueRecipients: audience.length,
    eligibleRecipients: audience.filter((row) => row.eligible).length,
    excludedRecipients: audience.filter((row) => !row.eligible).length,
  });
}));

router.get('/:id', route(async (req, res) => {
  const campaign = await EmailCampaign.findById(req.params.id).lean();
  if (!campaign) return res.status(404).json({ message: 'Campaign not found' });
  res.json({ campaign: serialize(campaign) });
}));

router.patch('/:id', route(async (req, res) => {
  const campaign = await EmailCampaign.findById(req.params.id);
  if (!campaign) return res.status(404).json({ message: 'Campaign not found' });
  if (campaign.state !== 'draft') return res.status(409).json({ message: 'A queued campaign cannot be edited' });
  if (req.body.content) {
    const validated = validateCampaignContent(req.body.content);
    if (!validated.valid) return res.status(400).json({ message: validated.errors.join('. ') });
    campaign.content = validated.content;
  }
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name || name.length > 120) return res.status(400).json({ message: 'Campaign name must be 1 to 120 characters.' });
    campaign.name = name;
  }
  if (req.body.selectedUserIds !== undefined) {
    if (!Array.isArray(req.body.selectedUserIds) || req.body.selectedUserIds.length > 10000) {
      return res.status(400).json({ message: 'selectedUserIds must be an array of at most 10,000 users.' });
    }
    const selected = [...new Set(req.body.selectedUserIds.map(String))];
    if (selected.some((id) => !mongoose.isValidObjectId(id))) return res.status(400).json({ message: 'One or more selected users are invalid.' });
    campaign.selectedUserIds = selected;
  }
  if (req.body.selectedExternalContactIds !== undefined) {
    if (!Array.isArray(req.body.selectedExternalContactIds) || req.body.selectedExternalContactIds.length > getEmailCampaignConfig().maxAudience) {
      return res.status(400).json({ message: `selectedExternalContactIds must be an array of at most ${getEmailCampaignConfig().maxAudience} contacts.` });
    }
    const selected = [...new Set(req.body.selectedExternalContactIds.map(String))];
    if (selected.some((id) => !mongoose.isValidObjectId(id))) return res.status(400).json({ message: 'One or more selected external contacts are invalid.' });
    campaign.selectedExternalContactIds = selected;
  }
  if (req.body.audienceSource !== undefined) {
    if (!['users', 'external', 'both'].includes(req.body.audienceSource)) return res.status(400).json({ message: 'Audience source must be users, external, or both.' });
    campaign.audienceSource = req.body.audienceSource;
  }
  if (campaign.selectedUserIds.length + campaign.selectedExternalContactIds.length > getEmailCampaignConfig().maxAudience * 2) {
    return res.status(400).json({ message: 'Selected audience is too large.' });
  }
  campaign.updatedBy = req.user.userId;
  await campaign.save();
  await logAdminAction({ adminId: req.user.userId, action: 'email_campaign_updated', details: { campaignId: campaign._id, selectedRecipients: campaign.selectedUserIds.length + campaign.selectedExternalContactIds.length } });
  res.json({ campaign: serialize(campaign) });
}));

router.get('/:id/review', route(async (req, res) => {
  const campaign = await EmailCampaign.findById(req.params.id).lean();
  if (!campaign) return res.status(404).json({ message: 'Campaign not found' });
  const audience = await buildCampaignAudience({ selectedUserIds: campaign.selectedUserIds, selectedExternalContactIds: campaign.selectedExternalContactIds, source: campaign.audienceSource });
  res.json({
    campaign: serialize(campaign),
    review: {
      selected: campaign.selectedUserIds.length + campaign.selectedExternalContactIds.length,
      eligibleNow: audience.filter((row) => row.eligible).length,
      excludedNow: audience.filter((row) => !row.eligible).length,
      sender: getEmailCampaignConfig().senderAddress ? 'configured' : 'missing',
      consentPolicy: 'Explicit opt-in only; unknown consent is excluded.',
    },
  });
}));

router.post('/:id/test', campaignTestLimiter, route(async (req, res) => {
  const campaign = await EmailCampaign.findOne({ _id: req.params.id, state: 'draft' }).lean();
  if (!campaign) return res.status(404).json({ message: 'Draft campaign not found' });
  const admin = await User.findById(req.user.userId).select('email name emailVerifiedAt').lean();
  if (!admin?.emailVerifiedAt) return res.status(400).json({ message: 'Verify the admin email before sending a test.' });
  const config = assertCampaignSendConfig();
  const validated = validateCampaignContent(campaign.content);
  if (!validated.valid) return res.status(400).json({ message: validated.errors.join('. ') });
  const rendered = renderCampaignEmail({ content: validated.content, recipientName: admin.name, unsubscribeUrl: '#', preview: true });
  try {
    await sendMarketingEmail({
      from: `${config.senderName} <${config.senderAddress}>`,
      to: admin.email,
      ...rendered,
      subject: `[TEST] ${rendered.subject}`,
      idempotencyKey: `campaign-test/${campaign._id}/${Date.now()}`,
      headers: { 'X-SkillBridge-Test': 'true' },
    });
  } catch {
    return res.status(502).json({ message: 'The email provider could not send this test. Review the campaign configuration and try again.' });
  }
  await logAdminAction({ adminId: req.user.userId, action: 'email_campaign_test_sent', details: { campaignId: campaign._id } });
  res.json({ success: true, message: 'Test email sent to your verified admin address.' });
}));

router.post('/:id/queue', route(async (req, res) => {
  if (req.body?.confirmation !== 'SEND CAMPAIGN') {
    return res.status(400).json({ message: 'Type SEND CAMPAIGN to confirm this irreversible send.' });
  }
  try {
    const campaign = await queueCampaign(req.params.id, req.user.userId);
    await logAdminAction({ adminId: req.user.userId, action: 'email_campaign_queued', details: { campaignId: campaign._id, recipients: campaign.frozenAudience?.length } });
    res.json({ campaign: serialize(campaign) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
}));

router.get('/:id/deliveries', route(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const [deliveries, total] = await Promise.all([
    EmailCampaignDelivery.find({ campaign: req.params.id }).select('-unsubscribeTokenHash').sort({ createdAt: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    EmailCampaignDelivery.countDocuments({ campaign: req.params.id }),
  ]);
  res.json({ deliveries, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

export default router;


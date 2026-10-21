import express from 'express';
import EmailWebhookEvent from '../models/EmailWebhookEvent.js';
import EmailCampaignDelivery from '../models/EmailCampaignDelivery.js';
import MarketingSuppression from '../models/MarketingSuppression.js';
import User from '../models/User.js';
import ExternalMarketingContact from '../models/ExternalMarketingContact.js';
import { verifyResendWebhook } from '../utils/emailService.js';
import { refreshCampaignCounts } from '../services/emailCampaignService.js';
import { isHardBounce, RESEND_EVENT_STATUS, shouldApplyProviderEvent } from '../utils/emailCampaignWebhook.js';

const router = express.Router();
const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

router.post('/', express.raw({ type: '*/*', limit: '1mb' }), route(async (req, res) => {
  let event;
  try {
    event = await verifyResendWebhook(req.body, req.headers);
  } catch {
    return res.status(400).json({ message: 'Invalid webhook signature' });
  }

  const eventId = req.headers['svix-id'];
  const eventType = event.type;
  const providerMessageId = event.data?.email_id || event.data?.id || null;
  const parsedEventDate = new Date(event.created_at || Date.now());
  const eventCreatedAt = Number.isNaN(parsedEventDate.getTime()) ? new Date() : parsedEventDate;
  try {
    await EmailWebhookEvent.create({ providerEventId: eventId, eventType, providerMessageId, eventCreatedAt });
  } catch (error) {
    if (error?.code === 11000) return res.status(200).json({ received: true, duplicate: true });
    throw error;
  }

  const mapping = RESEND_EVENT_STATUS[eventType];
  if (!mapping || !providerMessageId) {
    await EmailWebhookEvent.updateOne({ providerEventId: eventId }, { $set: { handled: true } });
    return res.json({ received: true });
  }
  const rawTags = event.data?.tags;
  const taggedDeliveryId = Array.isArray(rawTags)
    ? rawTags.find((tag) => tag?.name === 'delivery_id')?.value
    : rawTags?.delivery_id;
  const delivery = await EmailCampaignDelivery.findOne({
    $or: [
      { providerMessageId },
      ...(taggedDeliveryId ? [{ _id: taggedDeliveryId }] : []),
    ],
  });
  if (!delivery) {
    await EmailWebhookEvent.updateOne({ providerEventId: eventId }, { $set: { handled: true } });
    return res.json({ received: true });
  }

  if (shouldApplyProviderEvent({ currentAt: delivery.lastProviderEventAt, currentRank: delivery.lastProviderEventRank, incomingAt: eventCreatedAt, incomingRank: mapping.rank })) {
    if (!delivery.providerMessageId) delivery.providerMessageId = providerMessageId;
    delivery.status = mapping.status;
    delivery.lastProviderEventAt = eventCreatedAt;
    delivery.lastProviderEventRank = mapping.rank;
    delivery.lastProviderEventType = eventType;
    if (eventType === 'email.delivered') delivery.deliveredAt = eventCreatedAt;
    if (['email.failed', 'email.bounced', 'email.complained'].includes(eventType)) delivery.active = false;
    await delivery.save();

    const bounceType = String(event.data?.bounce?.type || event.data?.bounce_type || '').toLowerCase();
    const hardBounce = isHardBounce(eventType, bounceType);
    if (hardBounce || eventType === 'email.complained') {
      const reason = eventType === 'email.complained' ? 'complaint' : 'hard_bounce';
      await Promise.all([
        MarketingSuppression.findOneAndUpdate(
          { normalizedEmail: delivery.normalizedEmail },
          { $set: { reason, source: 'resend_webhook', user: delivery.user, active: true, providerMessageId } },
          { upsert: true }
        ),
        User.updateMany(
          { email: delivery.normalizedEmail },
          { $set: { marketingPreference: { status: 'opted_out', changedAt: eventCreatedAt, source: `provider_${reason}` } } }
        ),
        ExternalMarketingContact.updateMany(
          { normalizedEmail: delivery.normalizedEmail },
          { $set: { permission: { status: 'unsubscribed', source: '', at: null, reference: '' } } }
        ),
      ]);
    }
    await refreshCampaignCounts(delivery.campaign);
  }
  await EmailWebhookEvent.updateOne({ providerEventId: eventId }, { $set: { handled: true } });
  res.json({ received: true });
}));

export default router;


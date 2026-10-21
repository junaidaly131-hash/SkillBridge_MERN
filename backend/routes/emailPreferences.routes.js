import express from 'express';
import EmailCampaignDelivery from '../models/EmailCampaignDelivery.js';
import MarketingSuppression from '../models/MarketingSuppression.js';
import User from '../models/User.js';
import ExternalMarketingContact from '../models/ExternalMarketingContact.js';
import { hashUnsubscribeToken, safeTokenMatch } from '../utils/marketingUnsubscribe.js';

const router = express.Router();
const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

async function findDelivery(token) {
  if (!token || token.length > 200) return null;
  const delivery = await EmailCampaignDelivery.findOne({ unsubscribeTokenHash: hashUnsubscribeToken(token) })
    .select('+unsubscribeTokenHash user normalizedEmail');
  return delivery && safeTokenMatch(token, delivery.unsubscribeTokenHash) ? delivery : null;
}

// Safe to open from mail scanners: GET never changes a preference.
router.get('/unsubscribe/:token', route(async (req, res) => {
  const delivery = await findDelivery(req.params.token);
  if (!delivery) return res.status(404).json({ valid: false, message: 'This unsubscribe link is invalid or expired.' });
  res.json({ valid: true, message: 'Confirm to stop SkillBridge marketing emails.' });
}));

router.post('/unsubscribe/:token', route(async (req, res) => {
  const delivery = await findDelivery(req.params.token);
  if (!delivery) return res.status(404).json({ valid: false, message: 'This unsubscribe link is invalid or expired.' });
  const now = new Date();
  const strongSuppression = await MarketingSuppression.exists({ normalizedEmail: delivery.normalizedEmail, active: true, reason: { $in: ['hard_bounce', 'complaint'] } });
  const operations = [
    User.updateMany(
      { email: delivery.normalizedEmail },
      { $set: { marketingPreference: { status: 'opted_out', changedAt: now, source: 'unsubscribe_link' } } }
    ),
    ExternalMarketingContact.updateMany(
      { normalizedEmail: delivery.normalizedEmail },
      { $set: { permission: { status: 'unsubscribed', source: '', at: null, reference: '' } } }
    ),
  ];
  if (!strongSuppression) {
    operations.push(MarketingSuppression.findOneAndUpdate(
      { normalizedEmail: delivery.normalizedEmail },
      { $set: { reason: 'unsubscribe', source: 'campaign_link', user: delivery.user || null, active: true } },
      { upsert: true }
    ));
  }
  await Promise.all(operations);
  res.json({ success: true, message: 'You have been unsubscribed from SkillBridge marketing emails.' });
}));

export default router;


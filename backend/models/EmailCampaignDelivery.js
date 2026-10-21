import mongoose from 'mongoose';

const emailCampaignDeliverySchema = new mongoose.Schema({
  campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailCampaign', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  normalizedEmail: { type: String, required: true },
  recipientName: { type: String, default: '' },
  isStudent: { type: Boolean, default: false },
  isTeacher: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ['queued', 'sending', 'accepted', 'delivered', 'retry_pending', 'failed', 'skipped', 'unknown'],
    required: true,
    default: 'queued',
    index: true,
  },
  active: { type: Boolean, default: true, index: true },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now, index: true },
  leaseUntil: { type: Date, default: null },
  leaseOwner: { type: String, default: null },
  idempotencyKey: { type: String, required: true },
  unsubscribeTokenHash: { type: String, required: true, select: false },
  providerMessageId: { type: String, default: null, index: true },
  providerAcceptedAt: { type: Date, default: null },
  deliveredAt: { type: Date, default: null },
  lastProviderEventAt: { type: Date, default: null },
  lastProviderEventRank: { type: Number, default: 0 },
  lastProviderEventType: { type: String, default: null },
  lastErrorCode: { type: String, default: null },
  lastErrorMessage: { type: String, default: null, maxlength: 500 },
  skippedReason: { type: String, default: null },
}, { timestamps: true });

emailCampaignDeliverySchema.index({ campaign: 1, user: 1 }, { unique: true });
emailCampaignDeliverySchema.index({ campaign: 1, normalizedEmail: 1 }, { unique: true });
emailCampaignDeliverySchema.index({ active: 1, status: 1, nextAttemptAt: 1, leaseUntil: 1 });

export default mongoose.model('EmailCampaignDelivery', emailCampaignDeliverySchema);

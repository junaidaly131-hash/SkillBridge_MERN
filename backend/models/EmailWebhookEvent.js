import mongoose from 'mongoose';

const emailWebhookEventSchema = new mongoose.Schema({
  providerEventId: { type: String, required: true, unique: true, index: true },
  eventType: { type: String, required: true },
  providerMessageId: { type: String, default: null, index: true },
  eventCreatedAt: { type: Date, required: true },
  handled: { type: Boolean, default: false },
  safeMetadata: { type: Object, default: null },
}, { timestamps: true });

emailWebhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 });

export default mongoose.model('EmailWebhookEvent', emailWebhookEventSchema);

import mongoose from 'mongoose';

const contentSchema = new mongoose.Schema({
  subject: { type: String, required: true },
  preheader: { type: String, required: true },
  heading: { type: String, required: true },
  message: { type: String, required: true },
  ctaLabel: { type: String, required: true },
  ctaUrl: { type: String, required: true },
  closing: { type: String, required: true },
}, { _id: false });

const audienceSnapshotSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  externalContactId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExternalMarketingContact', default: null },
  sourceKind: { type: String, enum: ['user', 'external'], required: true },
  provenance: [{
    kind: { type: String, enum: ['user', 'external'], required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    externalContactId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExternalMarketingContact', default: null },
  }],
  normalizedEmail: { type: String, required: true },
  recipientName: { type: String, default: '' },
  isStudent: { type: Boolean, default: false },
  isTeacher: { type: Boolean, default: false },
  eligible: { type: Boolean, required: true },
  skipReason: { type: String, default: null },
}, { _id: false });

const countsSchema = new mongoose.Schema({
  queued: { type: Number, default: 0 },
  sending: { type: Number, default: 0 },
  accepted: { type: Number, default: 0 },
  delivered: { type: Number, default: 0 },
  retryPending: { type: Number, default: 0 },
  failed: { type: Number, default: 0 },
  skipped: { type: Number, default: 0 },
  unknown: { type: Number, default: 0 },
}, { _id: false });

const emailCampaignSchema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 120 },
  templateKey: { type: String, default: 'ai_tutor_announcement' },
  templateVersion: { type: Number, default: 1 },
  state: {
    type: String,
    enum: ['draft', 'preparing', 'queued', 'sending', 'completed', 'partial', 'failed', 'cancelled'],
    default: 'draft',
    index: true,
  },
  content: { type: contentSchema, required: true },
  selectedUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  selectedExternalContactIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ExternalMarketingContact' }],
  audienceSource: { type: String, enum: ['users', 'external', 'both'], default: 'users' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  frozenContent: { type: contentSchema, default: null },
  frozenAudience: { type: [audienceSnapshotSchema], default: [] },
  senderIdentity: { type: String, default: '' },
  counts: { type: countsSchema, default: () => ({}) },
  queuedAt: { type: Date, default: null },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  lastError: { type: String, default: null, maxlength: 500 },
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

emailCampaignSchema.index({ createdAt: -1 });

export default mongoose.model('EmailCampaign', emailCampaignSchema);

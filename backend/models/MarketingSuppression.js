import mongoose from 'mongoose';

const marketingSuppressionSchema = new mongoose.Schema({
  normalizedEmail: { type: String, required: true, unique: true, index: true },
  reason: { type: String, enum: ['unsubscribe', 'hard_bounce', 'complaint'], required: true },
  source: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  active: { type: Boolean, default: true },
  providerMessageId: { type: String, default: null },
}, { timestamps: true });

export default mongoose.model('MarketingSuppression', marketingSuppressionSchema);

import mongoose from 'mongoose';

const aiTutorIngestionLockSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  token: { type: String, required: true, maxlength: 100 },
  expiresAt: { type: Date, required: true },
});

aiTutorIngestionLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('AiTutorIngestionLock', aiTutorIngestionLockSchema);

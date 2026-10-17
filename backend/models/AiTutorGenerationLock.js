import mongoose from 'mongoose';

const aiTutorGenerationLockSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    token: { type: String, required: true, maxlength: 80 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

aiTutorGenerationLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('AiTutorGenerationLock', aiTutorGenerationLockSchema);

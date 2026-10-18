import mongoose from 'mongoose';

const aiTutorIngestionUsageSchema = new mongoose.Schema(
  {
    bucket: { type: String, required: true, unique: true },
    globalCharacters: { type: Number, min: 0, default: 0 },
    userAttempts: { type: Map, of: Number, default: {} },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

aiTutorIngestionUsageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('AiTutorIngestionUsage', aiTutorIngestionUsageSchema);

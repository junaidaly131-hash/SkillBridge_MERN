import mongoose from 'mongoose';

const aiTutorStudyUsageSchema = new mongoose.Schema(
  {
    bucket: { type: String, required: true, unique: true },
    providerCalls: { type: Number, min: 0, default: 0 },
    inputTokens: { type: Number, min: 0, default: 0 },
    outputTokens: { type: Number, min: 0, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

aiTutorStudyUsageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('AiTutorStudyUsage', aiTutorStudyUsageSchema);

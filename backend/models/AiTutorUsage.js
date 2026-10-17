import mongoose from 'mongoose';

const aiTutorUsageSchema = new mongoose.Schema(
  {
    bucket: { type: String, required: true, unique: true },
    globalCount: { type: Number, min: 0, default: 0 },
    // A single daily document makes the global and per-user reservation one
    // atomic MongoDB update. The map is bounded by the configured global cap.
    users: { type: Map, of: Number, default: {} },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

aiTutorUsageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('AiTutorUsage', aiTutorUsageSchema);

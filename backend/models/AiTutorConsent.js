import mongoose from 'mongoose';

const aiTutorConsentSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    version: { type: String, required: true, maxlength: 100 },
    acceptedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model('AiTutorConsent', aiTutorConsentSchema);

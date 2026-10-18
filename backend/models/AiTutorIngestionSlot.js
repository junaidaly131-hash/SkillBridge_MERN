import mongoose from 'mongoose';

const aiTutorIngestionSlotSchema = new mongoose.Schema({
  slot: { type: Number, required: true, unique: true, min: 0 },
  token: { type: String, required: true, maxlength: 100 },
  expiresAt: { type: Date, required: true },
});

aiTutorIngestionSlotSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('AiTutorIngestionSlot', aiTutorIngestionSlotSchema);

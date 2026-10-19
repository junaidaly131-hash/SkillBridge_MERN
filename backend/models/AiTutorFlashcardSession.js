import mongoose from 'mongoose';

const aiTutorFlashcardSessionSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'AiTutorDocument', required: true },
    deck: { type: mongoose.Schema.Types.ObjectId, ref: 'AiTutorFlashcardDeck', required: true },
    mode: { type: String, enum: ['scheduled', 'extra'], required: true },
    status: { type: String, enum: ['active', 'completed'], default: 'active', required: true },
    queue: [{ type: mongoose.Schema.Types.ObjectId, required: true }],
    currentIndex: { type: Number, min: 0, default: 0, required: true },
    version: { type: Number, min: 0, default: 0, required: true },
    completedEventIds: [{ type: String, maxlength: 80 }],
    startedAt: { type: Date, required: true, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

aiTutorFlashcardSessionSchema.index({ owner: 1, deck: 1, status: 1, updatedAt: -1 });
aiTutorFlashcardSessionSchema.index(
  { owner: 1, deck: 1, mode: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

export default mongoose.model('AiTutorFlashcardSession', aiTutorFlashcardSessionSchema);

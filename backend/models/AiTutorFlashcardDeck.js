import mongoose from 'mongoose';

const sourceSchema = new mongoose.Schema(
  {
    sourceId: { type: String, required: true, maxlength: 16 },
    chunk: { type: mongoose.Schema.Types.ObjectId, ref: 'AiTutorDocumentChunk', required: true },
    label: { type: String, required: true, maxlength: 80 },
  },
  { _id: false }
);

const cardSchema = new mongoose.Schema(
  {
    prompt: { type: String, required: true, maxlength: 1200 },
    answer: { type: String, required: true, maxlength: 2400 },
    explanation: { type: String, maxlength: 1600, default: '' },
    sources: { type: [sourceSchema], default: [] },
  },
  { _id: true }
);

const aiTutorFlashcardDeckSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'AiTutorDocument', required: true, index: true },
    embeddingVersion: { type: String, required: true, maxlength: 140 },
    requestedCount: { type: Number, enum: [10, 20], required: true },
    language: { type: String, enum: ['english', 'urdu', 'roman-urdu'], required: true },
    cards: { type: [cardSchema], required: true },
    insufficientReason: { type: String, maxlength: 500, default: '' },
    evidenceChunkCount: { type: Number, min: 1, required: true },
    generatedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

aiTutorFlashcardDeckSchema.index({ owner: 1, document: 1, createdAt: -1 });
aiTutorFlashcardDeckSchema.index({ owner: 1, createdAt: -1 });

export default mongoose.model('AiTutorFlashcardDeck', aiTutorFlashcardDeckSchema);

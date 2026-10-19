import mongoose from 'mongoose';

const reviewEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, maxlength: 80 },
    mode: { type: String, enum: ['scheduled', 'extra'], required: true },
    rating: { type: String, enum: ['again', 'hard', 'remembered'], required: true },
    reviewedAt: { type: Date, required: true },
    previousStage: { type: Number, min: 0, max: 5, required: true },
    nextStage: { type: Number, min: 0, max: 5, required: true },
    previousNextDueAt: { type: Date, default: null },
    nextDueAt: { type: Date, default: null },
  },
  { _id: false }
);

const aiTutorFlashcardReviewStateSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'AiTutorDocument', required: true },
    deck: { type: mongoose.Schema.Types.ObjectId, ref: 'AiTutorFlashcardDeck', required: true },
    card: { type: mongoose.Schema.Types.ObjectId, required: true },
    nextDueAt: { type: Date, default: null },
    intervalStage: { type: Number, min: 0, max: 5, default: 0, required: true },
    reviewCount: { type: Number, min: 0, default: 0, required: true },
    scheduledReviewCount: { type: Number, min: 0, default: 0, required: true },
    extraPracticeCount: { type: Number, min: 0, default: 0, required: true },
    latestRating: { type: String, enum: ['again', 'hard', 'remembered', null], default: null },
    latestReviewedAt: { type: Date, default: null },
    version: { type: Number, min: 0, default: 0, required: true },
    recentEvents: { type: [reviewEventSchema], default: [] },
  },
  { timestamps: true }
);

aiTutorFlashcardReviewStateSchema.index({ owner: 1, deck: 1, card: 1 }, { unique: true });
aiTutorFlashcardReviewStateSchema.index({ owner: 1, nextDueAt: 1 });
aiTutorFlashcardReviewStateSchema.index({ owner: 1, 'recentEvents.reviewedAt': -1 });

export default mongoose.model('AiTutorFlashcardReviewState', aiTutorFlashcardReviewStateSchema);

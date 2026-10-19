import mongoose from 'mongoose';

const aiTutorStudyRequestSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'AiTutorDocument', required: true },
    clientRequestId: { type: String, required: true, maxlength: 80 },
    action: { type: String, enum: ['summary', 'quiz'], required: true },
    fingerprint: { type: String, required: true, maxlength: 64 },
    status: {
      type: String,
      enum: ['preparing', 'admitted', 'completed', 'failed', 'rejected'],
      default: 'preparing',
      required: true,
    },
    summary: { type: mongoose.Schema.Types.ObjectId, ref: 'AiTutorSummary', default: null },
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'AiTutorQuiz', default: null },
    safeErrorCode: { type: String, maxlength: 80, default: null },
    usage: {
      userRemaining: { type: Number, min: 0 },
      globalRemaining: { type: Number, min: 0 },
      resetAt: { type: Date },
    },
    reservedBudget: {
      calls: { type: Number, min: 0 },
      inputTokens: { type: Number, min: 0 },
      outputTokens: { type: Number, min: 0 },
    },
  },
  { timestamps: true }
);

aiTutorStudyRequestSchema.index({ owner: 1, clientRequestId: 1 }, { unique: true });
aiTutorStudyRequestSchema.index({ owner: 1, document: 1, createdAt: -1 });

export default mongoose.model('AiTutorStudyRequest', aiTutorStudyRequestSchema);

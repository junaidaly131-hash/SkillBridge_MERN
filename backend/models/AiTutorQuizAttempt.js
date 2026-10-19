import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema(
  {
    questionIndex: { type: Number, required: true, min: 0 },
    selectedOptionIndex: { type: Number, min: 0, max: 3, default: null },
  },
  { _id: false }
);

const aiTutorQuizAttemptSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'AiTutorDocument', required: true, index: true },
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'AiTutorQuiz', required: true, index: true },
    status: { type: String, enum: ['in_progress', 'submitted'], default: 'in_progress', required: true },
    answers: { type: [answerSchema], default: [] },
    score: { type: Number, min: 0, default: null },
    correctCount: { type: Number, min: 0, default: null },
    totalQuestions: { type: Number, min: 1, required: true },
    startedAt: { type: Date, default: Date.now, required: true },
    submittedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

aiTutorQuizAttemptSchema.index({ owner: 1, quiz: 1, updatedAt: -1 });
aiTutorQuizAttemptSchema.index({ owner: 1, document: 1, updatedAt: -1 });

export default mongoose.model('AiTutorQuizAttempt', aiTutorQuizAttemptSchema);

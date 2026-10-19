import mongoose from 'mongoose';

const sourceSchema = new mongoose.Schema(
  {
    sourceId: { type: String, required: true, maxlength: 16 },
    chunk: { type: mongoose.Schema.Types.ObjectId, ref: 'AiTutorDocumentChunk', required: true },
    label: { type: String, required: true, maxlength: 80 },
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, maxlength: 1200 },
    options: {
      type: [{ type: String, maxlength: 800 }],
      required: true,
      validate: [(value) => value.length === 4, 'A quiz question must have four options.'],
    },
    correctIndex: { type: Number, required: true, min: 0, max: 3 },
    explanation: { type: String, required: true, maxlength: 2400 },
    sources: { type: [sourceSchema], default: [] },
  },
  { _id: true }
);

const aiTutorQuizSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'AiTutorDocument', required: true, index: true },
    embeddingVersion: { type: String, required: true, maxlength: 140 },
    requestedCount: { type: Number, enum: [5, 10], required: true },
    difficulty: { type: String, enum: ['beginner', 'intermediate', 'advanced'], required: true },
    language: { type: String, enum: ['english', 'urdu', 'roman-urdu'], required: true },
    questions: { type: [questionSchema], required: true },
    insufficientReason: { type: String, maxlength: 500, default: '' },
    evidenceChunkCount: { type: Number, min: 1, required: true },
    generatedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

aiTutorQuizSchema.index({ owner: 1, document: 1, createdAt: -1 });

export default mongoose.model('AiTutorQuiz', aiTutorQuizSchema);

import mongoose from 'mongoose';

const sourceSchema = new mongoose.Schema(
  {
    sourceId: { type: String, required: true, maxlength: 16 },
    chunk: { type: mongoose.Schema.Types.ObjectId, ref: 'AiTutorDocumentChunk', required: true },
    label: { type: String, required: true, maxlength: 80 },
  },
  { _id: false }
);

const aiTutorSummarySchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'AiTutorDocument', required: true, index: true },
    embeddingVersion: { type: String, required: true, maxlength: 140 },
    optionsKey: { type: String, required: true, maxlength: 80 },
    language: { type: String, enum: ['english', 'urdu', 'roman-urdu'], required: true },
    length: { type: String, enum: ['short', 'detailed'], required: true },
    overview: { type: String, required: true, maxlength: 12000 },
    keyConcepts: [{ type: String, maxlength: 3000 }],
    importantTerms: [
      {
        term: { type: String, required: true, maxlength: 180 },
        definition: { type: String, required: true, maxlength: 1200 },
        _id: false,
      },
    ],
    sources: { type: [sourceSchema], default: [] },
    coverage: {
      status: { type: String, enum: ['full', 'partial'], required: true },
      coveredChunkCount: { type: Number, min: 0, required: true },
      totalChunkCount: { type: Number, min: 0, required: true },
      coveredLocations: [{ type: String, maxlength: 80 }],
      note: { type: String, maxlength: 500, default: '' },
    },
    providerCallCount: { type: Number, min: 1, required: true },
    generatedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

aiTutorSummarySchema.index(
  { owner: 1, document: 1, embeddingVersion: 1, optionsKey: 1 },
  { unique: true }
);

export default mongoose.model('AiTutorSummary', aiTutorSummarySchema);

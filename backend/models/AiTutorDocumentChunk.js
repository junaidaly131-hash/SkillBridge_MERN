import mongoose from 'mongoose';

const sourceSchema = new mongoose.Schema(
  {
    pageStart: { type: Number, min: 1, default: null },
    pageEnd: { type: Number, min: 1, default: null },
    lineStart: { type: Number, min: 1, default: null },
    lineEnd: { type: Number, min: 1, default: null },
  },
  { _id: false }
);

const aiTutorDocumentChunkSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    document: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AiTutorDocument',
      required: true,
      index: true,
    },
    ordinal: { type: Number, required: true, min: 0 },
    text: { type: String, required: true, maxlength: 12000 },
    source: { type: sourceSchema, required: true },
    embedding: { type: [Number], required: true, select: false },
    embeddingVersion: { type: String, required: true, maxlength: 140 },
  },
  { timestamps: true }
);

aiTutorDocumentChunkSchema.index({ owner: 1, document: 1, ordinal: 1 }, { unique: true });

export default mongoose.model('AiTutorDocumentChunk', aiTutorDocumentChunkSchema);

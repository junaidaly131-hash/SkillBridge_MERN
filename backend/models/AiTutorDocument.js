import mongoose from 'mongoose';

const aiTutorDocumentSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    displayName: { type: String, required: true, maxlength: 180 },
    fileType: { type: String, enum: ['pdf', 'txt'], required: true },
    mimeType: { type: String, required: true, maxlength: 80 },
    sizeBytes: { type: Number, required: true, min: 1 },
    contentHash: { type: String, required: true, maxlength: 64 },
    status: {
      type: String,
      enum: ['processing', 'ready', 'failed', 'deleting', 'deleted'],
      default: 'processing',
      required: true,
      index: true,
    },
    failureCategory: { type: String, maxlength: 80, default: null },
    pageCount: { type: Number, min: 0, default: 0 },
    extractedCharacterCount: { type: Number, min: 0, default: 0 },
    chunkCount: { type: Number, min: 0, default: 0 },
    embeddingModel: { type: String, maxlength: 100, default: null },
    embeddingDimensions: { type: Number, min: 1, default: null },
    embeddingVersion: { type: String, maxlength: 140, default: null },
    processingToken: { type: String, maxlength: 100, default: null },
    processingExpiresAt: { type: Date, default: null },
    indexedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

aiTutorDocumentSchema.index({ owner: 1, status: 1, createdAt: -1 });
aiTutorDocumentSchema.index({ owner: 1, contentHash: 1, status: 1 });

export default mongoose.model('AiTutorDocument', aiTutorDocumentSchema);

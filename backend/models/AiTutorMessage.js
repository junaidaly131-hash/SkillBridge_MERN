import mongoose from 'mongoose';

const aiTutorMessageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AiTutorConversation',
      required: true,
      index: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    text: { type: String, required: true, maxlength: 20000 },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      required: true,
      default: 'completed',
    },
    clientRequestId: { type: String, required: true, maxlength: 80 },
    safeErrorCode: { type: String, maxlength: 80, default: null },
    sources: [
      {
        sourceId: { type: String, required: true, maxlength: 12 },
        chunk: { type: mongoose.Schema.Types.ObjectId, ref: 'AiTutorDocumentChunk', required: true },
        label: { type: String, required: true, maxlength: 80 },
      },
    ],
  },
  { timestamps: true }
);

aiTutorMessageSchema.index({ conversation: 1, _id: -1 });
aiTutorMessageSchema.index({ owner: 1, clientRequestId: 1, role: 1 }, { unique: true });

export default mongoose.model('AiTutorMessage', aiTutorMessageSchema);

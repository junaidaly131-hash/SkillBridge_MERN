import mongoose from 'mongoose';

const aiTutorRequestSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AiTutorConversation',
      required: true,
    },
    clientRequestId: { type: String, required: true, maxlength: 80 },
    status: {
      type: String,
      enum: ['preparing', 'admitted', 'completed', 'failed', 'rejected'],
      required: true,
      default: 'preparing',
    },
    userMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'AiTutorMessage', default: null },
    assistantMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'AiTutorMessage', default: null },
    safeErrorCode: { type: String, maxlength: 80, default: null },
    usage: {
      userRemaining: { type: Number, min: 0 },
      globalRemaining: { type: Number, min: 0 },
      resetAt: { type: Date },
    },
  },
  { timestamps: true }
);

aiTutorRequestSchema.index({ owner: 1, clientRequestId: 1 }, { unique: true });
aiTutorRequestSchema.index({ conversation: 1, createdAt: -1 });

export default mongoose.model('AiTutorRequest', aiTutorRequestSchema);

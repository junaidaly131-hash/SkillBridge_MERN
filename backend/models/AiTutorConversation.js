import mongoose from 'mongoose';

const aiTutorConversationSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      default: 'New learning chat',
    },
    mode: { type: String, enum: ['general', 'document'], required: true, default: 'general' },
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'AiTutorDocument', default: null },
    turnCount: { type: Number, min: 0, default: 0 },
    lastMessagePreview: { type: String, trim: true, maxlength: 180, default: '' },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

aiTutorConversationSchema.index({ owner: 1, lastMessageAt: -1, _id: -1 });
aiTutorConversationSchema.index({ owner: 1, document: 1, lastMessageAt: -1 });

export default mongoose.model('AiTutorConversation', aiTutorConversationSchema);

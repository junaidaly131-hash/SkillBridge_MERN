import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    text: {
      type: String,
      trim: true,
      default: '',
    },
    messageType: {
      type: String,
      enum: ['text', 'meeting_invite', 'system', 'attachment'],
      default: 'text',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    deliveredTo: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    // Set the first time the sender edits the text. Its presence is what the
    // bubble shows "edited" from - the original text is not kept, since this is
    // a correction tool rather than an audit trail.
    editedAt: {
      type: Date,
      default: null,
    },
    // One entry per (user, emoji). A person may react with several different
    // emoji; reacting with the same one again removes it.
    reactions: [
      {
        _id: false,
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        emoji: { type: String, required: true },
      },
    ],
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: -1 });

export default mongoose.model('Message', messageSchema);



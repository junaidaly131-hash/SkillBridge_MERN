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
    // "Delete for me": the message stays, these people just stop being shown
    // it. Same idea as a conversation's clearedBy - one person tidying their
    // own view must never take the other person's copy with it.
    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    // "Delete for everyone": the message is kept as a tombstone rather than
    // removed, so the thread does not silently reshuffle around a gap and the
    // other person can see that something was withdrawn rather than wondering
    // what they misread. Its text and attachment are cleared on the way.
    deletedForEveryoneAt: {
      type: Date,
      default: null,
    },
    // At most one entry per user. Choosing a different emoji replaces theirs,
    // choosing the same one again clears it - so the chips under a message are
    // a count of people, not of taps.
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



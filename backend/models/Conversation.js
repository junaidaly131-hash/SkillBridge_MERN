import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    // "Delete chat" is per person, and is a cut-off rather than a deletion.
    //
    // It used to drop the Conversation and every Message in it, for BOTH
    // people - so one person tidying their sidebar silently destroyed the other
    // person's whole history, including anything they had agreed in it. Now
    // each side records the moment they cleared the chat: their own client
    // stops showing anything older, and the other side keeps everything.
    //
    // Storing a timestamp rather than a "hidden" flag is what makes the chat
    // come back on its own. The conversation is listed again as soon as there
    // is a message newer than the cut-off, and it comes back showing only what
    // was said since - which is what people expect from deleting a chat.
    clearedBy: [
      {
        _id: false,
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        clearedAt: { type: Date, required: true },
      },
    ],
    // Archived is only about where the conversation is listed; nothing is
    // hidden and nothing expires. Deliberately NOT un-archived by a new
    // message: a chat silently jumping back into the main list is the
    // behaviour people complain about, and the archived row carries its own
    // unread count so nothing is missed.
    archivedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1 });

/** When this user last cleared the chat, or null if they never have. */
conversationSchema.methods.clearedAtFor = function clearedAtFor(userId) {
  const entry = (this.clearedBy || []).find((c) => String(c.user) === String(userId));
  return entry?.clearedAt || null;
};

export default mongoose.model('Conversation', conversationSchema);



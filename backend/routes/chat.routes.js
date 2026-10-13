import express from 'express';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';
import { notifyUser } from '../utils/notify.js';
import { uploadChatAttachment } from '../config/cloudinary.js';
import { isBlockedBetween } from '../utils/blocking.js';
import { isUserOnline } from '../utils/presence.js';
import { isAllowedReaction, EDIT_WINDOW_MS, MAX_MESSAGE_LENGTH } from '../config/chat.js';

const router = express.Router();

// List conversations for current user
router.get('/conversations', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const conversations = await Conversation.find({ participants: userId })
      .populate('participants', 'name email avatar lastSeen acceptsFreeTrialSessions')
      .populate({
        path: 'lastMessage',
        select: 'text sender createdAt readBy messageType metadata',
        populate: { path: 'sender', select: 'name' },
      })
      .sort({ updatedAt: -1 });

    const withMeta = await Promise.all(
      conversations.map(async (conv) => {
        const clearedAt = conv.clearedAtFor(userId);

        // Unread is counted from this user's own cut-off, so clearing a chat
        // also clears its badge rather than leaving a count for messages they
        // can no longer see.
        const unreadCount = await Message.countDocuments({
          conversation: conv._id,
          sender: { $ne: userId },
          readBy: { $ne: userId },
          ...(clearedAt ? { createdAt: { $gt: clearedAt } } : {}),
        });

        return {
          ...conv.toObject(),
          unreadCount,
          archived: conv.archivedBy.some((u) => String(u) === String(userId)),
          clearedAt,
        };
      })
    );

    // A cleared conversation disappears until there is something new in it.
    // The check is on the last message rather than a stored flag, so it comes
    // back by itself the moment the other person writes again - and comes back
    // showing only what was said after the cut-off.
    const visible = withMeta.filter((c) => {
      if (!c.clearedAt) return true;
      const last = c.lastMessage?.createdAt;
      return Boolean(last) && new Date(last) > new Date(c.clearedAt);
    });

    // clearedAt was only needed for that decision; it is not the client's
    // business and leaving it out keeps the payload honest about what it means.
    res.json({
      success: true,
      conversations: visible.map(({ clearedAt, clearedBy, archivedBy, ...rest }) => rest),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create or get a 1:1 conversation with another user
router.post('/conversations', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { otherUserId } = req.body;
    if (!otherUserId) return res.status(400).json({ message: 'otherUserId is required' });
    if (otherUserId === userId) return res.status(400).json({ message: 'Invalid otherUserId' });

    const other = await User.findById(otherUserId).select('_id');
    if (!other) return res.status(404).json({ message: 'User not found' });

    if (await isBlockedBetween(userId, otherUserId)) {
      return res.status(403).json({ message: 'Unable to message this user' });
    }

    let conversation = await Conversation.findOne({
      participants: { $all: [userId, otherUserId] },
      $expr: { $eq: [{ $size: '$participants' }, 2] },
    })
      .populate('participants', 'name email avatar lastSeen acceptsFreeTrialSessions')
      .populate({
        path: 'lastMessage',
        select: 'text sender createdAt',
        populate: { path: 'sender', select: 'name' },
      });

    if (!conversation) {
      conversation = await Conversation.create({ participants: [userId, otherUserId] });
      conversation = await Conversation.findById(conversation._id)
        .populate('participants', 'name email avatar lastSeen acceptsFreeTrialSessions')
        .populate({
          path: 'lastMessage',
          select: 'text sender createdAt',
          populate: { path: 'sender', select: 'name' },
        });
    }

    res.json({ success: true, conversation });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get messages for a conversation
router.get('/conversations/:id/messages', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    if (!conversation.participants.map(String).includes(String(userId))) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    // Anything from before this user cleared the chat is theirs no longer -
    // this is what makes "delete" look like a delete to them while leaving the
    // other participant's copy intact.
    const clearedAt = conversation.clearedAtFor(userId);

    const messages = await Message.find({
      conversation: conversation._id,
      ...(clearedAt ? { createdAt: { $gt: clearedAt } } : {}),
    })
      .populate('sender', 'name email avatar')
      .populate('reactions.user', 'name')
      .sort({ createdAt: 1 })
      .limit(500);

    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Mark messages as read in a conversation
router.post('/conversations/:id/read', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    if (!conversation.participants.map(String).includes(String(userId))) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    // Mark all unread messages in this conversation as read
    const result = await Message.updateMany(
      {
        conversation: conversation._id,
        sender: { $ne: userId },
        readBy: { $ne: userId },
      },
      {
        $addToSet: { readBy: userId, deliveredTo: userId },
      }
    );

    if (result.modifiedCount > 0) {
      const io = req.app.get('io');
      if (io) {
        io.to(`conv:${conversation._id}`).emit('messagesRead', {
          conversationId: String(conversation._id),
          readerId: String(userId),
        });
      }
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * Clear a conversation for the caller only.
 *
 * This used to run Message.deleteMany + Conversation.findByIdAndDelete, which
 * destroyed the thread for BOTH people. One person tidying their sidebar wiped
 * the other person's entire history - times they had agreed, links, files -
 * with no warning and no way back. Nothing is deleted now: the caller's
 * cut-off moves to this moment, their client stops showing anything older, and
 * the other side is untouched.
 */
router.delete('/conversations/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    if (!conversation.participants.map(String).includes(String(userId))) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const now = new Date();
    const existing = conversation.clearedBy.find((c) => String(c.user) === String(userId));
    if (existing) existing.clearedAt = now;
    else conversation.clearedBy.push({ user: userId, clearedAt: now });

    // Clearing also takes it out of the archive - otherwise it would come back
    // on the next message into a section the user is not looking at.
    conversation.archivedBy = conversation.archivedBy.filter((u) => String(u) !== String(userId));

    await conversation.save();

    res.json({ success: true, message: 'Conversation cleared' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Archive / unarchive, for the caller only. Purely about which list the
// conversation appears in - nothing is hidden and no message is affected.
router.post('/conversations/:id/archive', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { archived = true } = req.body;

    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    if (!conversation.participants.map(String).includes(String(userId))) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const isArchived = conversation.archivedBy.some((u) => String(u) === String(userId));
    if (archived && !isArchived) conversation.archivedBy.push(userId);
    if (!archived) {
      conversation.archivedBy = conversation.archivedBy.filter((u) => String(u) !== String(userId));
    }
    await conversation.save();

    res.json({ success: true, archived: Boolean(archived) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Send message (REST fallback; realtime uses socket but this is handy too)
router.post('/conversations/:id/messages', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: 'text is required' });

    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    if (!conversation.participants.map(String).includes(String(userId))) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const otherParticipantId = conversation.participants.map(String).find((p) => p !== String(userId));
    if (otherParticipantId && (await isBlockedBetween(userId, otherParticipantId))) {
      return res.status(403).json({ message: 'Unable to message this user' });
    }

    const message = await Message.create({
      conversation: conversation._id,
      sender: userId,
      text: text.trim(),
      readBy: [userId],
      deliveredTo: otherParticipantId && isUserOnline(otherParticipantId) ? [otherParticipantId] : [],
    });

    conversation.lastMessage = message._id;
    await conversation.save();

    const populated = await Message.findById(message._id).populate('sender', 'name email avatar');

    const io = req.app.get('io');
    if (io) {
      io.to(`conv:${conversation._id}`).emit('newMessage', { message: populated });
    }

    const recipients = conversation.participants.map(String).filter((p) => p !== String(userId));
    for (const recipientId of recipients) {
      notifyUser({
        userId: recipientId,
        type: 'new_message',
        title: `New message from ${populated.sender.name}`,
        body: populated.text.length > 140 ? `${populated.text.slice(0, 140)}...` : populated.text,
        link: '/chat',
      });
    }

    res.status(201).json({ success: true, message: populated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Send a file attachment (image or document) - WhatsApp-style chat attachments.
router.post('/conversations/:id/attachments', authenticateToken, uploadChatAttachment.single('file'), async (req, res) => {
  try {
    const userId = req.user.userId;
    if (!req.file) return res.status(400).json({ message: 'file is required' });

    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    if (!conversation.participants.map(String).includes(String(userId))) {
      return res.status(403).json({ message: 'Not allowed' });
    }

    const otherParticipantId = conversation.participants.map(String).find((p) => p !== String(userId));
    if (otherParticipantId && (await isBlockedBetween(userId, otherParticipantId))) {
      return res.status(403).json({ message: 'Unable to message this user' });
    }

    const message = await Message.create({
      conversation: conversation._id,
      sender: userId,
      messageType: 'attachment',
      metadata: {
        url: req.file.path,
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
      },
      readBy: [userId],
      deliveredTo: otherParticipantId && isUserOnline(otherParticipantId) ? [otherParticipantId] : [],
    });

    conversation.lastMessage = message._id;
    await conversation.save();

    const populated = await Message.findById(message._id).populate('sender', 'name email avatar');

    const io = req.app.get('io');
    if (io) {
      io.to(`conv:${conversation._id}`).emit('newMessage', { message: populated });
    }

    const recipients = conversation.participants.map(String).filter((p) => p !== String(userId));
    for (const recipientId of recipients) {
      notifyUser({
        userId: recipientId,
        type: 'new_message',
        title: `New attachment from ${populated.sender.name}`,
        body: req.file.originalname,
        link: '/chat',
      });
    }

    res.status(201).json({ success: true, message: populated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * Loads a message together with its conversation, having checked the caller is
 * actually in it. Returns { error } instead of throwing so each route can
 * answer with its own status.
 */
async function loadMessageForParticipant(messageId, userId) {
  const message = await Message.findById(messageId);
  if (!message) return { error: { status: 404, message: 'Message not found' } };

  const conversation = await Conversation.findById(message.conversation);
  if (!conversation) return { error: { status: 404, message: 'Conversation not found' } };
  if (!conversation.participants.map(String).includes(String(userId))) {
    return { error: { status: 403, message: 'Not allowed' } };
  }

  // Someone who cleared the chat should not be able to reach back past their
  // own cut-off and react to - or read - a message they no longer have.
  const clearedAt = conversation.clearedAtFor(userId);
  if (clearedAt && message.createdAt <= clearedAt) {
    return { error: { status: 404, message: 'Message not found' } };
  }

  return { message, conversation };
}

// Pushes a changed message to everyone in the conversation. Personal rooms,
// for the same reason newMessage uses them - see the sendMessage handler in
// server.js.
function broadcastMessage(req, conversation, event, payload) {
  const io = req.app.get('io');
  if (!io) return;
  for (const participantId of conversation.participants.map(String)) {
    io.to(`user:${participantId}`).emit(event, payload);
  }
}

/**
 * Edit the text of a message you sent.
 *
 * Only your own, only plain text, and only inside EDIT_WINDOW_MS. Meeting
 * invites and attachments are excluded because their bubble is rendered from
 * `metadata`, not from `text` - editing the text would change what is written
 * on a session invitation while the booking it refers to stayed as it was.
 */
router.patch('/messages/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { text } = req.body;

    if (!text?.trim()) return res.status(400).json({ message: 'text is required' });
    if (text.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ message: 'That message is too long.' });
    }

    const { message, conversation, error } = await loadMessageForParticipant(req.params.id, userId);
    if (error) return res.status(error.status).json({ message: error.message });

    if (String(message.sender) !== String(userId)) {
      return res.status(403).json({ message: 'You can only edit your own messages.' });
    }
    if (message.messageType !== 'text') {
      return res.status(400).json({ message: 'Only text messages can be edited.' });
    }
    if (Date.now() - message.createdAt.getTime() > EDIT_WINDOW_MS) {
      return res.status(400).json({
        message: `Messages can only be edited within ${Math.round(EDIT_WINDOW_MS / 60000)} minutes of sending.`,
      });
    }

    message.text = text.trim();
    message.editedAt = new Date();
    await message.save();

    const populated = await Message.findById(message._id)
      .populate('sender', 'name email avatar')
      .populate('reactions.user', 'name');

    // If this was the conversation's last message, the sidebar preview is now
    // wrong everywhere until something else is sent.
    if (String(conversation.lastMessage) === String(message._id)) {
      broadcastMessage(req, conversation, 'conversationPreviewChanged', {
        conversationId: String(conversation._id),
      });
    }
    broadcastMessage(req, conversation, 'messageUpdated', { message: populated });

    res.json({ success: true, message: populated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * Toggle one reaction on a message.
 *
 * Reacting with an emoji you already used removes it; different emoji stack, so
 * a message can carry several from the same person.
 */
router.post('/messages/:id/reactions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { emoji } = req.body;

    if (!isAllowedReaction(emoji)) {
      return res.status(400).json({ message: 'That reaction is not available.' });
    }

    const { message, conversation, error } = await loadMessageForParticipant(req.params.id, userId);
    if (error) return res.status(error.status).json({ message: error.message });

    const existing = message.reactions.findIndex(
      (r) => String(r.user) === String(userId) && r.emoji === emoji
    );
    if (existing >= 0) message.reactions.splice(existing, 1);
    else message.reactions.push({ user: userId, emoji });

    await message.save();

    const populated = await Message.findById(message._id)
      .populate('sender', 'name email avatar')
      .populate('reactions.user', 'name');

    broadcastMessage(req, conversation, 'messageUpdated', { message: populated });

    res.json({ success: true, message: populated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;



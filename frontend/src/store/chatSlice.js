import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import apiClient from '../api/client';

export const fetchConversations = createAsyncThunk(
  'chat/fetchConversations',
  async (_, { rejectWithValue }) => {
    try {
      const res = await apiClient.get('/chat/conversations');
      return res.data.conversations;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load conversations');
    }
  }
);

export const fetchMessages = createAsyncThunk(
  'chat/fetchMessages',
  async (conversationId, { rejectWithValue }) => {
    try {
      const res = await apiClient.get(`/chat/conversations/${conversationId}/messages`);
      return { conversationId, messages: res.data.messages };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load messages');
    }
  }
);

export const createConversation = createAsyncThunk(
  'chat/createConversation',
  async (otherUserId, { rejectWithValue }) => {
    try {
      const res = await apiClient.post('/chat/conversations', { otherUserId });
      return res.data.conversation;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to create conversation');
    }
  }
);

export const sendAttachment = createAsyncThunk(
  'chat/sendAttachment',
  async ({ conversationId, file }, { rejectWithValue }) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiClient.post(`/chat/conversations/${conversationId}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      // The new message also arrives via the socket 'newMessage' broadcast
      // (the sender is already joined to the conversation room), so no need
      // to upsert it here too.
      return res.data.message;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to send attachment');
    }
  }
);

export const markConversationAsRead = createAsyncThunk(
  'chat/markAsRead',
  async (conversationId, { rejectWithValue }) => {
    try {
      await apiClient.post(`/chat/conversations/${conversationId}/read`);
      return conversationId;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to mark as read');
    }
  }
);

export const deleteConversation = createAsyncThunk(
  'chat/deleteConversation',
  async (conversationId, { rejectWithValue }) => {
    try {
      await apiClient.delete(`/chat/conversations/${conversationId}`);
      return conversationId;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to delete conversation');
    }
  }
);

export const setConversationArchived = createAsyncThunk(
  'chat/setArchived',
  async ({ conversationId, archived }, { rejectWithValue }) => {
    try {
      await apiClient.post(`/chat/conversations/${conversationId}/archive`, { archived });
      return { conversationId, archived };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to update this chat');
    }
  }
);

export const editMessage = createAsyncThunk(
  'chat/editMessage',
  async ({ conversationId, messageId, text }, { rejectWithValue }) => {
    try {
      const res = await apiClient.patch(`/chat/messages/${messageId}`, { text });
      return { conversationId, message: res.data.message };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to edit message');
    }
  }
);

export const deleteMessage = createAsyncThunk(
  'chat/deleteMessage',
  async ({ conversationId, messageId, scope }, { rejectWithValue }) => {
    try {
      const res = await apiClient.delete(`/chat/messages/${messageId}?scope=${scope}`);
      return { conversationId, messageId, scope, message: res.data.message || null };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to delete message');
    }
  }
);

export const toggleReaction = createAsyncThunk(
  'chat/toggleReaction',
  async ({ conversationId, messageId, emoji }, { rejectWithValue }) => {
    try {
      const res = await apiClient.post(`/chat/messages/${messageId}/reactions`, { emoji });
      return { conversationId, message: res.data.message };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to react');
    }
  }
);

const chatSlice = createSlice({
  name: 'chat',
  initialState: {
    conversations: [],
    messagesByConversation: {},
    // Who is currently typing, as { [conversationId]: true }. Lives here rather
    // than in the open thread so the chat LIST can show it on a row the user is
    // not looking at, which is the whole point of relaying typing to personal
    // rooms (see server.js).
    typingByConversation: {},
    loading: false,
    messagesLoading: false,
    error: null,
  },
  reducers: {
    // For incoming messages (socket broadcast, fetched history). Matches only
    // by real ID - deliberately does NOT try to fuzzy-match against optimistic
    // temp bubbles by text+sender, since that heuristic could misfire (e.g.
    // two quick identical messages) and leave a duplicate on screen. Temp
    // reconciliation is handled precisely by replaceMessage below instead.
    upsertMessage: (state, action) => {
      const { conversationId, message } = action.payload;
      if (!state.messagesByConversation[conversationId]) {
        state.messagesByConversation[conversationId] = [];
      }

      const messages = state.messagesByConversation[conversationId];
      const messageId = String(message._id || message.id);

      const existingIndex = messages.findIndex(
        (m) => String(m._id || m.id) === messageId
      );

      if (existingIndex >= 0) {
        messages[existingIndex] = message;
      } else {
        messages.push(message);
      }

      messages.sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return timeA - timeB;
      });

      const idx = state.conversations.findIndex((c) => c._id === conversationId);
      if (idx >= 0) {
        state.conversations[idx].lastMessage = message;
        state.conversations[idx].updatedAt = message.createdAt || new Date().toISOString();
      }
    },
    // Precisely reconciles one optimistic temp bubble (identified by its exact
    // tempId) with the real, server-saved message. Handles the race where the
    // socket broadcast for this same message already arrived and got pushed
    // (via upsertMessage) before this ack fires - in that case we just drop
    // the temp placeholder instead of adding a second copy of the real message.
    replaceMessage: (state, action) => {
      const { conversationId, tempId, message } = action.payload;
      const messages = state.messagesByConversation[conversationId];
      if (!messages) return;

      const realId = String(message._id || message.id);
      const realIndex = messages.findIndex((m) => String(m._id || m.id) === realId);
      const tempIndex = messages.findIndex((m) => String(m._id || m.id) === String(tempId));

      if (realIndex >= 0) {
        messages[realIndex] = message;
        if (tempIndex >= 0 && tempIndex !== realIndex) {
          messages.splice(tempIndex, 1);
        }
      } else if (tempIndex >= 0) {
        messages[tempIndex] = message;
      } else {
        messages.push(message);
      }

      messages.sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return timeA - timeB;
      });

      const idx = state.conversations.findIndex((c) => c._id === conversationId);
      if (idx >= 0) {
        state.conversations[idx].lastMessage = message;
        state.conversations[idx].updatedAt = message.createdAt || new Date().toISOString();
      }
    },
    // Live tick updates: mark every message not authored by `userId` as
    // delivered/read to them (1:1 conversations only, so "not authored by
    // them" is equivalent to "sent to them").
    markMessagesDelivered: (state, action) => {
      const { conversationId, userId } = action.payload;
      const messages = state.messagesByConversation[conversationId];
      if (!messages) return;
      const uid = String(userId);
      for (const m of messages) {
        const senderId = String(m.sender?._id || m.sender?.id || m.sender);
        if (senderId === uid) continue;
        m.deliveredTo = m.deliveredTo || [];
        if (!m.deliveredTo.map(String).includes(uid)) m.deliveredTo.push(userId);
      }
    },
    markMessagesReadReceipt: (state, action) => {
      const { conversationId, readerId } = action.payload;
      const messages = state.messagesByConversation[conversationId];
      if (!messages) return;
      const uid = String(readerId);
      for (const m of messages) {
        const senderId = String(m.sender?._id || m.sender?.id || m.sender);
        if (senderId === uid) continue;
        m.readBy = m.readBy || [];
        if (!m.readBy.map(String).includes(uid)) m.readBy.push(readerId);
        m.deliveredTo = m.deliveredTo || [];
        if (!m.deliveredTo.map(String).includes(uid)) m.deliveredTo.push(readerId);
      }
    },
    updateUnreadCount: (state, action) => {
      const { conversationId, unreadCount } = action.payload;
      const idx = state.conversations.findIndex((c) => c._id === conversationId);
      if (idx >= 0) {
        state.conversations[idx].unreadCount = unreadCount;
      }
    },
    removeMessage: (state, action) => {
      const { conversationId, messageId } = action.payload;
      if (state.messagesByConversation[conversationId]) {
        state.messagesByConversation[conversationId] = state.messagesByConversation[conversationId].filter(
          (m) => String(m._id || m.id) !== String(messageId)
        );
      }
    },
    // Typing dots, keyed by conversation. Set from the socket and cleared
    // either by the sender's stopTyping or by the receiver's own timeout, so a
    // tab that closes mid-word doesn't leave the row stuck on "typing...".
    setTyping: (state, action) => {
      const { conversationId, typing } = action.payload;
      if (typing) state.typingByConversation[conversationId] = true;
      else delete state.typingByConversation[conversationId];
    },
    // One message replaced in place - an edit, or a reaction added or removed.
    // Does not insert: an update for a message this client never loaded (one
    // from before it cleared the chat, say) is nothing to show.
    applyMessageUpdate: (state, action) => {
      const { conversationId, message } = action.payload;
      const list = state.messagesByConversation[conversationId];
      if (list) {
        const i = list.findIndex((m) => String(m._id) === String(message._id));
        if (i >= 0) list[i] = message;
      }

      // If the changed message is the conversation's latest one, update the
      // sidebar preview from the same socket payload. Refetching every
      // conversation here used to flip the list back to its skeleton on every
      // edit and made a one-line change look like the whole inbox reloaded.
      const conversation = state.conversations.find(
        (c) => String(c._id) === String(conversationId)
      );
      const lastMessageId = conversation?.lastMessage?._id
        || conversation?.lastMessage?.id
        || conversation?.lastMessage;
      if (conversation && String(lastMessageId) === String(message._id)) {
        conversation.lastMessage = message;
      }
    },
    setError: (state, action) => {
      state.error = action.payload;
    },
    clearChatError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchConversations.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchConversations.fulfilled, (state, action) => {
        state.loading = false;
        state.conversations = action.payload || [];
      })
      .addCase(fetchConversations.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchMessages.pending, (state) => {
        state.messagesLoading = true;
        state.error = null;
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        state.messagesLoading = false;
        state.messagesByConversation[action.payload.conversationId] = action.payload.messages || [];
      })
      .addCase(fetchMessages.rejected, (state, action) => {
        state.messagesLoading = false;
        state.error = action.payload;
      })
      .addCase(createConversation.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createConversation.fulfilled, (state, action) => {
        state.loading = false;
        // Add new conversation to the list if not already present
        const exists = state.conversations.find(c => c._id === action.payload._id);
        if (!exists) {
          state.conversations.unshift(action.payload);
        }
      })
      .addCase(createConversation.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(markConversationAsRead.fulfilled, (state, action) => {
        const conversationId = action.payload;
        const idx = state.conversations.findIndex((c) => c._id === conversationId);
        if (idx >= 0) {
          state.conversations[idx].unreadCount = 0;
        }
      })
      .addCase(deleteConversation.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteConversation.fulfilled, (state, action) => {
        state.loading = false;
        const conversationId = action.payload;
        state.conversations = state.conversations.filter((c) => c._id !== conversationId);
        delete state.messagesByConversation[conversationId];
      })
      .addCase(deleteConversation.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(setConversationArchived.fulfilled, (state, action) => {
        const { conversationId, archived } = action.payload;
        const conv = state.conversations.find((c) => c._id === conversationId);
        if (conv) conv.archived = archived;
      })
      .addCase(setConversationArchived.rejected, (state, action) => {
        state.error = action.payload;
      })
      // Edits and reactions both come back as the whole updated message. The
      // socket broadcast carries it too, so whichever lands first wins and the
      // other is a no-op - applyMessageUpdate replaces by id.
      .addCase(editMessage.fulfilled, (state, action) => {
        chatSlice.caseReducers.applyMessageUpdate(state, action);
      })
      .addCase(toggleReaction.fulfilled, (state, action) => {
        chatSlice.caseReducers.applyMessageUpdate(state, action);
      })
      .addCase(toggleReaction.rejected, (state, action) => {
        state.error = action.payload;
      })
      // Deleting for yourself drops the bubble; deleting for everyone leaves a
      // tombstone, which arrives as an ordinary message update.
      .addCase(deleteMessage.fulfilled, (state, action) => {
        const { conversationId, messageId, scope, message } = action.payload;
        if (scope === 'me') {
          const list = state.messagesByConversation[conversationId];
          if (list) {
            state.messagesByConversation[conversationId] = list.filter(
              (m) => String(m._id) !== String(messageId)
            );
          }
        } else if (message) {
          chatSlice.caseReducers.applyMessageUpdate(state, {
            payload: { conversationId, message },
          });
        }
      })
      .addCase(deleteMessage.rejected, (state, action) => {
        state.error = action.payload;
      });
  },
});

export const {
  upsertMessage,
  replaceMessage,
  removeMessage,
  setTyping,
  applyMessageUpdate,
  markMessagesDelivered,
  markMessagesReadReceipt,
  updateUnreadCount,
  setError,
  clearChatError,
} = chatSlice.actions;
export default chatSlice.reducer;



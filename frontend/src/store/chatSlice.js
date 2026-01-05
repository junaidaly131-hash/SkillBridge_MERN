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

const chatSlice = createSlice({
  name: 'chat',
  initialState: {
    conversations: [],
    messagesByConversation: {},
    loading: false,
    messagesLoading: false,
    error: null,
  },
  reducers: {
    upsertMessage: (state, action) => {
      const { conversationId, message } = action.payload;
      if (!state.messagesByConversation[conversationId]) {
        state.messagesByConversation[conversationId] = [];
      }
      
      const messages = state.messagesByConversation[conversationId];
      const messageId = String(message._id || message.id);
      
      // Check if message already exists (by ID) to prevent duplicates
      const existingIndex = messages.findIndex(
        (m) => String(m._id || m.id) === messageId
      );
      
      if (existingIndex >= 0) {
        // Replace existing message (useful for replacing temp messages with real ones)
        messages[existingIndex] = message;
      } else {
        // Check if there's a temporary message with the same text and sender that we should replace
        // This handles the case where we have a temp message and receive the real one
        const tempIndex = messages.findIndex(
          (m) => {
            const mId = String(m._id || m.id);
            const isTemp = mId.startsWith('tmp-');
            const sameText = m.text === message.text;
            const sameSender = String(m.sender?._id || m.sender?.id) === String(message.sender?._id || message.sender?.id);
            return isTemp && sameText && sameSender;
          }
        );
        
        if (tempIndex >= 0) {
          // Replace temporary message with real one
          messages[tempIndex] = message;
        } else {
          // Add new message at the end (will be sorted below)
          messages.push(message);
        }
      }
      
      // Sort messages by createdAt to maintain chronological order
      messages.sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return timeA - timeB;
      });
      
      // Update conversation preview if present
      const idx = state.conversations.findIndex((c) => c._id === conversationId);
      if (idx >= 0) {
        state.conversations[idx].lastMessage = message;
        state.conversations[idx].updatedAt = message.createdAt || new Date().toISOString();
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
      });
  },
});

export const { upsertMessage, removeMessage, updateUnreadCount, setError, clearChatError } = chatSlice.actions;
export default chatSlice.reducer;



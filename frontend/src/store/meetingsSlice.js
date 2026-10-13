import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import apiClient from '../api/client';

export const fetchMeetings = createAsyncThunk(
  'meetings/fetch',
  async (_, { rejectWithValue }) => {
    try {
      const res = await apiClient.get('/meetings');
      return res.data.meetings;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load meetings');
    }
  }
);

export const fetchMeetingById = createAsyncThunk(
  'meetings/fetchById',
  async (meetingId, { rejectWithValue }) => {
    try {
      const res = await apiClient.get(`/meetings/${meetingId}`);
      return {
        ...res.data.meeting,
        videoRoomName: res.data.videoRoomName,
        jaasToken: res.data.jaasToken,
      };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load meeting');
    }
  }
);

export const fetchMeetingHistory = createAsyncThunk(
  'meetings/fetchHistory',
  async ({ status, limit, page } = {}, { rejectWithValue }) => {
    try {
      const params = new URLSearchParams();
      if (status) params.append('status', status);
      if (limit) params.append('limit', limit);
      if (page) params.append('page', page);
      const res = await apiClient.get(`/meetings/history?${params.toString()}`);
      return {
        meetings: res.data.meetings,
        page: res.data.page,
        totalPages: res.data.totalPages,
      };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load meeting history');
    }
  }
);

export const createMeeting = createAsyncThunk(
  'meetings/create',
  async ({ conversationId, otherUserId, title, startsAt, sessionType, skill, duration, useFreeTrialSession }, { rejectWithValue }) => {
    try {
      const res = await apiClient.post('/meetings', {
        conversationId,
        otherUserId,
        title,
        startsAt,
        sessionType,
        skill,
        duration,
        useFreeTrialSession,
      });
      return res.data.meeting;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to create meeting');
    }
  }
);

export const rateMeeting = createAsyncThunk(
  'meetings/rate',
  async ({ meetingId, rating }, { rejectWithValue }) => {
    try {
      const res = await apiClient.post(`/meetings/${meetingId}/rate`, { rating });
      return res.data.meeting;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to rate meeting');
    }
  }
);

export const reportMeetingIssue = createAsyncThunk(
  'meetings/reportIssue',
  async ({ meetingId, reason }, { rejectWithValue }) => {
    try {
      const res = await apiClient.post(`/meetings/${meetingId}/report-issue`, { reason });
      return { meetingId, dispute: res.data.dispute };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to report issue');
    }
  }
);

export const cancelMeeting = createAsyncThunk(
  'meetings/cancel',
  async (meetingId, { rejectWithValue }) => {
    try {
      const res = await apiClient.post(`/meetings/${meetingId}/cancel`);
      return res.data.meeting;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to cancel meeting');
    }
  }
);

// Accept or decline a session request. Only the invited participant can call
// this - the server refuses the creator.
export const respondToMeeting = createAsyncThunk(
  'meetings/respond',
  async ({ meetingId, decision }, { rejectWithValue }) => {
    try {
      const res = await apiClient.post(`/meetings/${meetingId}/respond`, { decision });
      return res.data.meeting;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to respond to this request');
    }
  }
);

export const deleteMeeting = createAsyncThunk(
  'meetings/delete',
  async (meetingId, { rejectWithValue }) => {
    try {
      await apiClient.delete(`/meetings/${meetingId}`);
      return meetingId;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to delete meeting');
    }
  }
);

const meetingsSlice = createSlice({
  name: 'meetings',
  initialState: {
    meetings: [],
    history: [],
    historyPage: 1,
    historyTotalPages: 1,
    historyLoading: false,
    loading: false,
    error: null,
    currentMeeting: null,
    currentMeetingLoading: false,
    currentMeetingError: null,
  },
  reducers: {
    clearMeetingsError: (state) => {
      state.error = null;
    },
    clearCurrentMeeting: (state) => {
      state.currentMeeting = null;
      state.currentMeetingError = null;
    },
    // A meeting arriving from someone else's action, over the socket. Used by
    // the 'newMeeting' event so an invitation shows up for the invitee without
    // a reload.
    upsertMeeting: (state, action) => {
      const incoming = action.payload;
      if (!incoming?._id) return;
      const i = state.meetings.findIndex((m) => String(m._id) === String(incoming._id));
      if (i >= 0) state.meetings[i] = incoming;
      else state.meetings.push(incoming);
      state.meetings.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
    },
    // The 'meetingUpdated' event carries only what changed, so this patches in
    // place rather than replacing - and drops the meeting from the upcoming
    // list once it reaches a state that is no longer upcoming.
    applyMeetingStatus: (state, action) => {
      const { id, status, respondedAt } = action.payload || {};
      if (!id) return;

      const patch = (list) => {
        const m = list.find((x) => String(x._id) === String(id));
        if (m) {
          m.status = status;
          if (respondedAt) m.respondedAt = respondedAt;
        }
      };
      patch(state.meetings);
      patch(state.history);

      if (!['pending', 'scheduled'].includes(status)) {
        state.meetings = state.meetings.filter((m) => String(m._id) !== String(id));
      }
      if (state.currentMeeting && String(state.currentMeeting._id) === String(id)) {
        state.currentMeeting.status = status;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMeetings.pending, (s) => {
        s.loading = true;
        s.error = null;
      })
      .addCase(fetchMeetings.fulfilled, (s, a) => {
        s.loading = false;
        s.meetings = a.payload || [];
      })
      .addCase(fetchMeetings.rejected, (s, a) => {
        s.loading = false;
        s.error = a.payload;
      })
      .addCase(fetchMeetingById.pending, (s) => {
        s.currentMeetingLoading = true;
        s.currentMeetingError = null;
      })
      .addCase(fetchMeetingById.fulfilled, (s, a) => {
        s.currentMeetingLoading = false;
        s.currentMeeting = a.payload;
      })
      .addCase(fetchMeetingById.rejected, (s, a) => {
        s.currentMeetingLoading = false;
        s.currentMeetingError = a.payload;
      })
      .addCase(fetchMeetingHistory.pending, (s) => {
        s.historyLoading = true;
      })
      .addCase(fetchMeetingHistory.fulfilled, (s, a) => {
        s.historyLoading = false;
        s.history = a.payload.meetings || [];
        s.historyPage = a.payload.page || 1;
        s.historyTotalPages = a.payload.totalPages || 1;
      })
      .addCase(fetchMeetingHistory.rejected, (s) => {
        s.historyLoading = false;
      })
      .addCase(createMeeting.fulfilled, (s, a) => {
        s.meetings = [a.payload, ...(s.meetings || [])];
      })
      .addCase(cancelMeeting.fulfilled, (s, a) => {
        s.meetings = s.meetings.filter(m => m._id !== a.payload._id);
      })
      // An accepted request stays in the list with its new status; a declined
      // one is no longer upcoming and drops out.
      .addCase(respondToMeeting.fulfilled, (s, a) => {
        const updated = a.payload;
        if (!updated?._id) return;
        if (updated.status === 'scheduled') {
          const i = s.meetings.findIndex(m => String(m._id) === String(updated._id));
          if (i >= 0) s.meetings[i] = updated;
          else s.meetings.push(updated);
          s.meetings.sort((x, y) => new Date(x.startsAt) - new Date(y.startsAt));
        } else {
          s.meetings = s.meetings.filter(m => String(m._id) !== String(updated._id));
        }
      })
      .addCase(deleteMeeting.fulfilled, (s, a) => {
        s.meetings = s.meetings.filter(m => m._id !== a.payload);
        s.history = s.history.filter(m => m._id !== a.payload);
      })
      .addCase(rateMeeting.fulfilled, (s, a) => {
        const idx = s.history.findIndex(m => m._id === a.payload._id);
        if (idx >= 0) {
          s.history[idx] = a.payload;
        }
      })
      .addCase(reportMeetingIssue.fulfilled, (s, a) => {
        const idx = s.history.findIndex(m => m._id === a.payload.meetingId);
        if (idx >= 0) {
          s.history[idx].dispute = a.payload.dispute;
        }
      });
  },
});

export const { clearMeetingsError, clearCurrentMeeting, upsertMeeting, applyMeetingStatus } =
  meetingsSlice.actions;
export default meetingsSlice.reducer;



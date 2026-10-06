import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import apiClient from '../api/client';

export const fetchWallet = createAsyncThunk(
  'credits/fetchWallet',
  async (_, { rejectWithValue }) => {
    try {
      const res = await apiClient.get('/credits/wallet');
      return res.data.wallet;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load wallet');
    }
  }
);

export const fetchTransactions = createAsyncThunk(
  'credits/fetchTransactions',
  async ({ limit = 20, offset = 0 } = {}, { rejectWithValue }) => {
    try {
      const res = await apiClient.get(`/credits/transactions?limit=${limit}&offset=${offset}`);
      return res.data;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to load transactions');
    }
  }
);

// The wallet is read-only from the client. Credits move when a session
// completes, decided entirely server-side in utils/meetingCompletion.js - there
// is deliberately no thunk that asks the server to add or remove credits, and
// the endpoints that used to accept such a request have been removed.

const creditsSlice = createSlice({
  name: 'credits',
  initialState: {
    wallet: null,
    transactions: [],
    totalTransactions: 0,
    hasMoreTransactions: false,
    loading: false,
    error: null,
  },
  reducers: {
    clearCreditsError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch wallet
      .addCase(fetchWallet.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchWallet.fulfilled, (state, action) => {
        state.loading = false;
        state.wallet = action.payload;
      })
      .addCase(fetchWallet.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      // Fetch transactions
      .addCase(fetchTransactions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTransactions.fulfilled, (state, action) => {
        state.loading = false;
        state.transactions = action.payload.transactions;
        state.totalTransactions = action.payload.total;
        state.hasMoreTransactions = action.payload.hasMore;
      })
      .addCase(fetchTransactions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { clearCreditsError } = creditsSlice.actions;
export default creditsSlice.reducer;

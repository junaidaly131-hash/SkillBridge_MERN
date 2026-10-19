import axios from 'axios';
import { bearerToken, shouldInvalidateSession } from './authFailure';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

export const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

let invalidatedToken = '';
let sessionFailureHandler = () => {};

export function setSessionFailureHandler(handler) {
  sessionFailureHandler = typeof handler === 'function' ? handler : () => {};
}

function storedToken() {
  try {
    return JSON.parse(localStorage.getItem('auth'))?.token || '';
  } catch {
    return '';
  }
}

// Attach auth token from localStorage on every request
apiClient.interceptors.request.use((config) => {
  const stored = localStorage.getItem('auth');
  if (stored) {
    try {
      const { token } = JSON.parse(stored);
      if (token) {
        if (token !== invalidatedToken) invalidatedToken = '';
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // ignore malformed auth storage
    }
  }
  return config;
});

// Authentication failures are handled once for the whole application. Only a
// request that actually carried the current stored token may invalidate it;
// this prevents a slow response from an old session logging out a newer login.
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const headers = error.config?.headers;
    const authorization = headers?.get?.('Authorization') || headers?.Authorization || '';
    const sentToken = bearerToken(authorization);
    const code = error.response?.data?.code;
    const shouldEndSession = shouldInvalidateSession({
      currentToken: storedToken(),
      status: error.response?.status,
      code,
      message: error.response?.data?.message,
      authorization,
    });

    if (shouldEndSession) {
      localStorage.removeItem('auth');
      if (invalidatedToken !== sentToken) {
        invalidatedToken = sentToken;
        sessionFailureHandler({ code: code || 'INVALID_TOKEN' });
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;


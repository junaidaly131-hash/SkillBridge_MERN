import { io } from 'socket.io-client';

let socket;

function readToken() {
  const stored = localStorage.getItem('auth');
  if (!stored) return '';
  try {
    return JSON.parse(stored)?.token || '';
  } catch {
    return '';
  }
}

export function getSocket() {
  if (socket) return socket;

  const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
  const socketURL = baseURL.replace(/\/api\/?$/, '');

  socket = io(socketURL, {
    // Polling first, then upgrade. This used to be websocket-only, which fails
    // outright behind proxies and networks that block the upgrade - and it
    // fails silently, so the app looked merely "slow to update" when in fact
    // nothing real-time worked at all: no incoming messages, no notifications,
    // no presence. Reloading appeared to fix it only because that refetches
    // over plain HTTP.
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    // Read fresh on every (re)connect rather than captured once. A token that
    // was refreshed or replaced mid-session would otherwise keep reconnecting
    // with the stale one until a full page load.
    auth: (cb) => cb({ token: readToken() }),
  });

  if (import.meta.env.DEV) {
    socket.on('connect_error', (err) => {
      console.warn('[socket] connect_error:', err.message);
    });
  }

  return socket;
}

/**
 * Runs `fn` once now (if already connected) and again after every reconnect.
 *
 * Socket.IO rooms do not survive a reconnect: the socket comes back with a new
 * id and belongs to nothing, so anything joined with an emit has to be joined
 * again. Nothing did that, which is why a sleeping laptop or a brief network
 * drop left a conversation permanently silent until the page was reloaded.
 *
 * Returns an unsubscribe function.
 */
export function onConnected(fn) {
  const s = getSocket();
  if (s.connected) fn();
  s.on('connect', fn);
  return () => s.off('connect', fn);
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

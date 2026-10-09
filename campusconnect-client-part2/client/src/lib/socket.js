// Single socket for the whole app (PROJECT_INSTRUCTIONS §7).
// Owned by P3. This version follows the contract so P2's UI can be built and tested now;
// P3 can change the internals as long as these exports keep the same behaviour.

import { io } from 'socket.io-client';
import { SERVER_URL, USE_MOCKS } from './api.js';
import { createMockSocket } from './mock/mockSocket.js';

let socket = null;

export function connectSocket(token) {
  if (socket) return socket;
  socket = USE_MOCKS
    ? createMockSocket(token)
    : io(SERVER_URL, {
        auth: { token },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });
  return socket;
}

// Mock mode only: type ccMock.dropConnection() in the DevTools console to test reconnecting.
if (USE_MOCKS && typeof window !== 'undefined') {
  window.ccMock = { dropConnection: (ms = 4000) => socket?.simulateDrop?.(ms) };
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}

/** Fire-and-forget event. Dropped silently while offline (typing, receipts). */
export function emit(event, payload) {
  if (socket?.connected) socket.emit(event, payload);
}

/**
 * Event with an acknowledgement. Always resolves to { ok: true, ... } or { ok: false, error }.
 * Fails immediately when offline instead of letting socket.io buffer it, so the UI can show
 * "Not sent · Retry" and never sends a message twice behind the user's back.
 */
export function emitWithAck(event, payload, timeoutMs = 10000) {
  return new Promise((resolve) => {
    if (!socket?.connected) {
      resolve({ ok: false, error: 'You are offline' });
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, error: 'The server did not respond' });
    }, timeoutMs);
    socket.emit(event, payload, (response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(response && typeof response === 'object' ? response : { ok: false, error: 'Empty response' });
    });
  });
}

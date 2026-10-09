import axios from 'axios';
import { tokenStore } from './storage.js';
import { mockAdapter } from './mock/mockApi.js';

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';

export const SERVER_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/+$/, '');

export const api = axios.create({
  baseURL: `${SERVER_URL}/api`,
  timeout: 15000,
  ...(USE_MOCKS ? { adapter: mockAdapter } : {}),
});

let unauthorizedHandler = null;

/** AuthContext registers a callback here so any 401 logs the user out. */
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const AUTH_ATTEMPT = /\/auth\/(login|register)$/;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    // A wrong password on /auth/login is a 401 too, but that must show an error, not log out.
    if (status === 401 && !AUTH_ATTEMPT.test(url) && unauthorizedHandler) {
      unauthorizedHandler();
    }
    return Promise.reject(error);
  },
);

/** Turns any axios error into one sentence that is safe to show the user. */
export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  const serverMessage = error?.response?.data?.error;
  if (typeof serverMessage === 'string' && serverMessage.trim()) return serverMessage;
  if (error?.code === 'ECONNABORTED') return 'The server took too long to respond. Please try again.';
  if (error && !error.response) return 'Cannot reach the server. Check your connection and try again.';
  if (error?.response?.status === 429) return 'Too many attempts. Please wait a moment and try again.';
  return fallback;
}

const data = (promise) => promise.then((res) => res.data);

export const authApi = {
  register: (body) => data(api.post('/auth/register', body)),
  login: (body) => data(api.post('/auth/login', body)),
  logout: () => data(api.post('/auth/logout')),
  me: () => data(api.get('/auth/me')),
};

export const usersApi = {
  search: (q, config) => data(api.get('/users/search', { params: { q }, ...config })),
  getById: (id) => data(api.get(`/users/${id}`)),
  updateProfile: (body) => data(api.put('/users/profile', body)),
};

export const conversationsApi = {
  list: () => data(api.get('/conversations')),
  get: (id) => data(api.get(`/conversations/${id}`)),
  openPrivate: (userId) => data(api.post('/conversations', { userId })),
  star: (id) => data(api.post(`/conversations/${id}/star`)),
  unstar: (id) => data(api.delete(`/conversations/${id}/star`)),
};

export const MESSAGE_PAGE_SIZE = 30;

export const messagesApi = {
  list: (conversationId, { before } = {}) =>
    data(api.get(`/messages/${conversationId}`, { params: { limit: MESSAGE_PAGE_SIZE, ...(before ? { before } : {}) } })),
  pinned: (conversationId) => data(api.get(`/messages/${conversationId}/pinned`)),
  pin: (conversationId, messageId) => data(api.post(`/messages/${conversationId}/pin/${messageId}`)),
  unpin: (conversationId, messageId) => data(api.delete(`/messages/${conversationId}/pin/${messageId}`)),
};

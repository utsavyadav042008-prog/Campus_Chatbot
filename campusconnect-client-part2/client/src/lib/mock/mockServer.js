// In-browser fake of P1's server + P3's socket server (mock mode only).
// Data lives in localStorage; real-time events go through an in-memory event bus.
// Seeded classmates act as simulated users: online ones receive, read, type and reply.
// Demo only: passwords are stored in plain text.

const USERS_KEY = 'cc_mock_users';
const DB_KEY = 'cc_mock_db';
export const SEED_PASSWORD = 'password123';

const SEED_USERS = [
  { name: 'Aarav Sharma', email: 'aarav@students.iitmandi.ac.in', bio: 'B.Tech CSE · Robotics Club', online: false },
  { name: 'Diya Patel', email: 'diya@students.iitmandi.ac.in', bio: 'KamandPrompt core team', online: true },
  { name: 'Kabir Rao', email: 'kabir@students.iitmandi.ac.in', bio: 'Hostel council · Music club', online: false },
  { name: 'Meera Nair', email: 'meera@students.iitmandi.ac.in', bio: 'M.Sc Physics', online: true },
];
export const SEED_EMAILS = SEED_USERS.map((u) => u.email);
const SEED_ONLINE = new Set(SEED_USERS.filter((u) => u.online).map((u) => u.email));

const REPLIES = [
  'Sounds good! 👍',
  'Sure, see you at the lab.',
  "I'll check and get back to you.",
  'Haha true 😄',
  'Can we meet near the library at 5?',
  'Done, shared it on the group.',
  'Okay, noted!',
];

class MockError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function makeId() {
  const hex = '0123456789abcdef';
  let id = '';
  for (let i = 0; i < 24; i += 1) id += hex[Math.floor(Math.random() * 16)];
  return id;
}

const nowIso = () => new Date().toISOString();

// ---------- storage ----------

const memory = {};

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {
    /* fall back to memory */
  }
  return memory[key] ?? null;
}

function write(key, value) {
  memory[key] = value;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* memory only */
  }
}

function seedUsers() {
  const now = nowIso();
  return SEED_USERS.map(({ online: _online, ...u }) => ({
    _id: makeId(),
    ...u,
    password: SEED_PASSWORD,
    profilePicture: '',
    starredConversations: [],
    lastSeen: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    createdAt: now,
    updatedAt: now,
  }));
}

export function getUsers() {
  const stored = read(USERS_KEY);
  if (Array.isArray(stored)) return stored;
  const seeded = seedUsers();
  write(USERS_KEY, seeded);
  return seeded;
}

export function saveUsers(users) {
  write(USERS_KEY, users);
}

function getDb() {
  const stored = read(DB_KEY);
  if (stored && Array.isArray(stored.conversations) && Array.isArray(stored.messages)) return stored;
  return { conversations: [], messages: [] };
}

function saveDb(db) {
  write(DB_KEY, db);
}

// ---------- presence & event bus ----------

const liveSockets = {}; // userId -> number of connected mock sockets
const presence = {}; // userId -> { status, lastSeen }
const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emitTo(userId, event, payload) {
  listeners.forEach((fn) => fn(userId, event, payload));
}

function statusOf(user) {
  if (presence[user._id]) return presence[user._id];
  return { status: SEED_ONLINE.has(user.email) ? 'online' : 'offline', lastSeen: user.lastSeen };
}

function isLive(userId) {
  return (liveSockets[userId] || 0) > 0;
}

/** A seeded user nobody is logged in as: the mock plays them. */
function isSimulated(user) {
  return SEED_EMAILS.includes(user.email) && !isLive(user._id);
}

export function publicUser(user) {
  const { password: _p, starredConversations: _s, ...rest } = user;
  return { ...rest, ...statusOf(user) };
}

function popUser(user) {
  if (!user) return { _id: 'deleted', name: 'Deleted user', profilePicture: '', status: 'offline' };
  const { status, lastSeen } = statusOf(user);
  return { _id: user._id, name: user.name, profilePicture: user.profilePicture || '', status, lastSeen };
}

function contactsOf(userId, db) {
  const ids = new Set();
  db.conversations.forEach((c) => {
    if (c.participants.includes(userId)) c.participants.forEach((p) => p !== userId && ids.add(p));
  });
  return [...ids];
}

export function socketConnected(userId) {
  liveSockets[userId] = (liveSockets[userId] || 0) + 1;
  if (liveSockets[userId] === 1) {
    presence[userId] = { status: 'online', lastSeen: nowIso() };
    contactsOf(userId, getDb()).forEach((id) => emitTo(id, 'user_online', { userId }));
  }
}

export function socketDisconnected(userId) {
  liveSockets[userId] = Math.max(0, (liveSockets[userId] || 0) - 1);
  if (liveSockets[userId] === 0) {
    const lastSeen = nowIso();
    presence[userId] = { status: 'offline', lastSeen };
    saveUsers(getUsers().map((u) => (u._id === userId ? { ...u, lastSeen } : u)));
    contactsOf(userId, getDb()).forEach((id) => emitTo(id, 'user_offline', { userId, lastSeen }));
  }
}

// ---------- helpers ----------

function findUser(id) {
  return getUsers().find((u) => u._id === id) || null;
}

export function userFromToken(token = '') {
  const clean = String(token).replace(/^Bearer\s+/i, '');
  if (!clean.startsWith('mock.')) return null;
  return findUser(clean.slice(5));
}

function popMessage(message, users) {
  const sender = users.find((u) => u._id === message.senderId);
  return { ...message, senderId: popUser(sender) };
}

function memberConversation(db, meId, conversationId) {
  const conv = db.conversations.find((c) => c._id === conversationId);
  if (!conv || !conv.participants.includes(meId)) throw new MockError(404, 'Conversation not found');
  return conv;
}

function populateConversation(conv, meId, db) {
  const users = getUsers();
  const me = users.find((u) => u._id === meId);
  const last = conv.lastMessage ? db.messages.find((m) => m._id === conv.lastMessage) : null;
  const unreadCount = db.messages.filter(
    (m) => m.conversationId === conv._id && m.senderId !== meId && !m.readBy.some((r) => r.user === meId),
  ).length;
  return {
    ...conv,
    participants: conv.participants.map((id) => popUser(users.find((u) => u._id === id))),
    lastMessage: last ? popMessage(last, users) : null,
    isStarred: (me?.starredConversations || []).includes(conv._id),
    unreadCount,
  };
}

// ---------- REST-side operations ----------

export function listConversations(meId) {
  const db = getDb();
  return db.conversations
    .filter((c) => c.participants.includes(meId))
    .sort((a, b) => new Date(b.lastMessageAt || b.createdAt) - new Date(a.lastMessageAt || a.createdAt))
    .map((c) => populateConversation(c, meId, db));
}

export function getConversation(meId, conversationId) {
  const db = getDb();
  return populateConversation(memberConversation(db, meId, conversationId), meId, db);
}

export function findOrCreatePrivate(meId, otherId) {
  if (!otherId || otherId === meId) throw new MockError(400, 'Choose another user to chat with');
  if (!findUser(otherId)) throw new MockError(404, 'User not found');
  const db = getDb();
  const privateKey = [meId, otherId].sort().join('_');
  const existing = db.conversations.find((c) => c.privateKey === privateKey);
  if (existing) return { conversation: populateConversation(existing, meId, db), created: false };

  const now = nowIso();
  const conv = {
    _id: makeId(),
    type: 'private',
    participants: [meId, otherId],
    privateKey,
    groupName: '',
    groupAdmin: null,
    groupPicture: '',
    lastMessage: null,
    lastMessageAt: null,
    createdAt: now,
    updatedAt: now,
  };
  db.conversations.push(conv);
  saveDb(db);
  emitTo(otherId, 'conversation_created', { conversation: populateConversation(conv, otherId, db) });
  return { conversation: populateConversation(conv, meId, db), created: true };
}

export function setStar(meId, conversationId, value) {
  memberConversation(getDb(), meId, conversationId);
  saveUsers(
    getUsers().map((u) => {
      if (u._id !== meId) return u;
      const set = new Set(u.starredConversations || []);
      if (value) set.add(conversationId);
      else set.delete(conversationId);
      return { ...u, starredConversations: [...set] };
    }),
  );
  return { ok: true, isStarred: value };
}

export function listMessages(meId, conversationId, { before, limit = 30 } = {}) {
  const db = getDb();
  memberConversation(db, meId, conversationId);
  const users = getUsers();
  let msgs = db.messages
    .filter((m) => m.conversationId === conversationId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (before) msgs = msgs.filter((m) => new Date(m.createdAt) < new Date(before));
  const size = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const hasMore = msgs.length > size;
  return { messages: msgs.slice(-size).map((m) => popMessage(m, users)), hasMore };
}

export function listPinned(meId, conversationId) {
  const db = getDb();
  memberConversation(db, meId, conversationId);
  const users = getUsers();
  return {
    messages: db.messages
      .filter((m) => m.conversationId === conversationId && m.isPinned)
      .sort((a, b) => new Date(b.pinnedAt) - new Date(a.pinnedAt))
      .map((m) => popMessage(m, users)),
  };
}

export function setPin(meId, conversationId, messageId, pinned) {
  const db = getDb();
  const conv = memberConversation(db, meId, conversationId);
  const msg = db.messages.find((m) => m._id === messageId && m.conversationId === conversationId);
  if (!msg) throw new MockError(404, 'Message not found');
  msg.isPinned = pinned;
  msg.pinnedAt = pinned ? nowIso() : null;
  msg.pinnedBy = pinned ? meId : null;
  saveDb(db);
  const populated = popMessage(msg, getUsers());
  conv.participants.forEach((p) =>
    pinned
      ? emitTo(p, 'message_pinned', { message: populated })
      : emitTo(p, 'message_unpinned', { conversationId, messageId }),
  );
  return { message: populated };
}

// ---------- socket-side operations ----------

export function createMessage(meId, conversationId, text, clientId) {
  const clean = String(text ?? '').trim();
  if (!clean) throw new MockError(400, 'Message cannot be empty');
  if (clean.length > 4000) throw new MockError(400, 'Message is too long (max 4000 characters)');
  const db = getDb();
  const conv = memberConversation(db, meId, conversationId);
  const now = nowIso();
  const msg = {
    _id: makeId(),
    conversationId,
    senderId: meId,
    messageType: 'text',
    text: clean,
    mediaUrl: '',
    mediaType: '',
    duration: 0,
    deliveredTo: [],
    readBy: [],
    isPinned: false,
    pinnedAt: null,
    pinnedBy: null,
    createdAt: now,
    updatedAt: now,
  };
  db.messages.push(msg);
  conv.lastMessage = msg._id;
  conv.lastMessageAt = now;
  conv.updatedAt = now;
  saveDb(db);

  const populated = { ...popMessage(msg, getUsers()), ...(clientId ? { clientId } : {}) };
  conv.participants.forEach((p) => emitTo(p, 'new_message', { message: populated }));
  simulateRecipients(conv, meId, msg);
  return populated;
}

export function markDelivered(userId, messageIds) {
  const db = getDb();
  const at = nowIso();
  const bySender = {};
  db.messages.forEach((m) => {
    if (!messageIds.includes(m._id) || m.senderId === userId) return;
    const conv = db.conversations.find((c) => c._id === m.conversationId);
    if (!conv?.participants.includes(userId)) return;
    if (m.deliveredTo.some((r) => r.user === userId)) return;
    m.deliveredTo.push({ user: userId, at });
    const key = `${m.senderId}|${m.conversationId}`;
    (bySender[key] ||= []).push(m._id);
  });
  saveDb(db);
  Object.entries(bySender).forEach(([key, ids]) => {
    const [senderId, conversationId] = key.split('|');
    emitTo(senderId, 'message_delivered', { conversationId, messageIds: ids, userId, at });
  });
}

export function markRead(userId, conversationId) {
  const db = getDb();
  const conv = memberConversation(db, userId, conversationId);
  const at = nowIso();
  let changed = false;
  db.messages.forEach((m) => {
    if (m.conversationId !== conversationId || m.senderId === userId) return;
    if (!m.deliveredTo.some((r) => r.user === userId)) m.deliveredTo.push({ user: userId, at });
    if (!m.readBy.some((r) => r.user === userId)) {
      m.readBy.push({ user: userId, at });
      changed = true;
    }
  });
  if (!changed) return;
  saveDb(db);
  conv.participants.forEach((p) => emitTo(p, 'message_read', { conversationId, userId, at }));
}

export function relayTyping(userId, conversationId, isTyping) {
  const conv = memberConversation(getDb(), userId, conversationId);
  const user = findUser(userId);
  conv.participants
    .filter((p) => p !== userId)
    .forEach((p) => emitTo(p, isTyping ? 'typing' : 'stop_typing', { conversationId, userId, name: user?.name || '' }));
}

// ---------- simulated classmates ----------

const botTimers = {};
let replyIndex = 0;

function simulateRecipients(conv, senderId, msg) {
  const sender = findUser(senderId);
  if (!sender || isSimulated(sender)) return; // bots never answer bots
  conv.participants
    .filter((id) => id !== senderId)
    .map(findUser)
    .filter((u) => u && isSimulated(u) && statusOf(u).status === 'online')
    .forEach((bot) => {
      const key = `${conv._id}|${bot._id}`;
      (botTimers[key] || []).forEach(clearTimeout);
      botTimers[key] = [
        setTimeout(() => markDelivered(bot._id, [msg._id]), 600),
        setTimeout(() => markRead(bot._id, conv._id), 1600),
        setTimeout(() => relayTyping(bot._id, conv._id, true), 2200),
        setTimeout(() => {
          relayTyping(bot._id, conv._id, false);
          createMessage(bot._id, conv._id, REPLIES[replyIndex++ % REPLIES.length]);
        }, 4200),
      ];
    });
}

export { MockError };

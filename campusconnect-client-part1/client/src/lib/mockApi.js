// In-browser stand-in for P1's server, used when VITE_USE_MOCKS=true.
// It follows the REST contract in PROJECT_INSTRUCTIONS §6 (same paths, bodies,
// responses and { error } shape) so switching to the real server needs no UI change.
// Demo only: passwords are stored in this browser's localStorage in plain text.

import { AxiosError } from 'axios';

const USERS_KEY = 'cc_mock_users';
const LATENCY_MS = 350;
const SEED_PASSWORD = 'password123';

const SEED_USERS = [
  { name: 'Aarav Sharma', email: 'aarav@students.iitmandi.ac.in', bio: 'B.Tech CSE · Robotics Club' },
  { name: 'Diya Patel', email: 'diya@students.iitmandi.ac.in', bio: 'KamandPrompt core team' },
  { name: 'Kabir Rao', email: 'kabir@students.iitmandi.ac.in', bio: 'Hostel council · Music club' },
  { name: 'Meera Nair', email: 'meera@students.iitmandi.ac.in', bio: 'M.Sc Physics' },
];

let memoryUsers = null;

function makeId() {
  const hex = '0123456789abcdef';
  let id = '';
  for (let i = 0; i < 24; i += 1) id += hex[Math.floor(Math.random() * 16)];
  return id;
}

function seedUsers() {
  const now = new Date().toISOString();
  return SEED_USERS.map((u) => ({
    _id: makeId(),
    ...u,
    password: SEED_PASSWORD,
    profilePicture: '',
    status: 'offline',
    lastSeen: now,
    createdAt: now,
    updatedAt: now,
  }));
}

function loadUsers() {
  try {
    const stored = JSON.parse(localStorage.getItem(USERS_KEY));
    if (Array.isArray(stored)) return stored;
  } catch {
    /* fall through to seed */
  }
  if (!memoryUsers) memoryUsers = seedUsers();
  saveUsers(memoryUsers);
  return memoryUsers;
}

function saveUsers(users) {
  memoryUsers = users;
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch {
    /* keep in memory only */
  }
}

function publicUser(user) {
  const { password: _password, ...rest } = user;
  return rest;
}

function respond(config, status, body) {
  const response = { data: body, status, statusText: String(status), headers: {}, config, request: {} };
  if (status >= 400) {
    const code = status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST;
    throw new AxiosError(body.error, code, config, {}, response);
  }
  return response;
}

function parseBody(config) {
  if (!config.data) return {};
  if (typeof config.data === 'string') {
    try {
      return JSON.parse(config.data);
    } catch {
      return {};
    }
  }
  return config.data;
}

function readAuthHeader(config) {
  const headers = config.headers || {};
  const value = typeof headers.get === 'function' ? headers.get('Authorization') : headers.Authorization;
  return typeof value === 'string' ? value : '';
}

function currentUser(config, users) {
  const token = readAuthHeader(config).replace(/^Bearer\s+/i, '');
  if (!token.startsWith('mock.')) return null;
  const id = token.slice(5);
  return users.find((u) => u._id === id) || null;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function handleRegister(config, users) {
  const { name = '', email = '', password = '' } = parseBody(config);
  const cleanName = String(name).trim();
  const cleanEmail = String(email).trim().toLowerCase();
  if (cleanName.length < 2 || cleanName.length > 50) return respond(config, 400, { error: 'Name must be 2–50 characters' });
  if (!EMAIL_RE.test(cleanEmail)) return respond(config, 400, { error: 'Enter a valid email address' });
  if (String(password).length < 8) return respond(config, 400, { error: 'Password must be at least 8 characters' });
  if (users.some((u) => u.email === cleanEmail)) {
    return respond(config, 400, { error: 'An account with this email already exists' });
  }
  const now = new Date().toISOString();
  const user = {
    _id: makeId(),
    name: cleanName,
    email: cleanEmail,
    password: String(password),
    bio: '',
    profilePicture: '',
    status: 'online',
    lastSeen: now,
    createdAt: now,
    updatedAt: now,
  };
  saveUsers([...users, user]);
  return respond(config, 201, { token: `mock.${user._id}`, user: publicUser(user) });
}

function handleLogin(config, users) {
  const { email = '', password = '' } = parseBody(config);
  const user = users.find((u) => u.email === String(email).trim().toLowerCase());
  if (!user || user.password !== password) {
    return respond(config, 401, { error: 'Invalid email or password' });
  }
  return respond(config, 200, { token: `mock.${user._id}`, user: publicUser(user) });
}

export async function mockAdapter(config) {
  await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

  const method = (config.method || 'get').toLowerCase();
  const path = (config.url || '').split('?')[0].replace(/\/+$/, '');
  const users = loadUsers();

  if (method === 'post' && path === '/auth/register') return handleRegister(config, users);
  if (method === 'post' && path === '/auth/login') return handleLogin(config, users);

  const me = currentUser(config, users);
  if (!me) return respond(config, 401, { error: 'Please log in to continue' });

  if (method === 'post' && path === '/auth/logout') return respond(config, 200, { ok: true });
  if (method === 'get' && path === '/auth/me') return respond(config, 200, { user: publicUser(me) });

  if (method === 'get' && path === '/users/search') {
    const q = String(config.params?.q || '').trim();
    if (!q) return respond(config, 200, { users: [] });
    const re = new RegExp(escapeRegex(q), 'i');
    const found = users
      .filter((u) => u._id !== me._id && (re.test(u.name) || re.test(u.email)))
      .slice(0, 20)
      .map(publicUser);
    return respond(config, 200, { users: found });
  }

  if (method === 'put' && path === '/users/profile') {
    const { name, bio } = parseBody(config);
    const updated = {
      ...me,
      ...(typeof name === 'string' && name.trim() ? { name: name.trim() } : {}),
      ...(typeof bio === 'string' ? { bio: bio.trim().slice(0, 160) } : {}),
      updatedAt: new Date().toISOString(),
    };
    saveUsers(users.map((u) => (u._id === me._id ? updated : u)));
    return respond(config, 200, { user: publicUser(updated) });
  }

  const userMatch = path.match(/^\/users\/([a-f0-9]{24})$/);
  if (method === 'get' && userMatch) {
    const user = users.find((u) => u._id === userMatch[1]);
    if (!user) return respond(config, 404, { error: 'User not found' });
    return respond(config, 200, { user: publicUser(user) });
  }

  return respond(config, 404, { error: `Mock API: ${method.toUpperCase()} ${path} is not implemented yet` });
}

export const MOCK_SEED_PASSWORD = SEED_PASSWORD;
export const MOCK_SEED_EMAILS = SEED_USERS.map((u) => u.email);

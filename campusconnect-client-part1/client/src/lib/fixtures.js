// Preview data shaped exactly like the REST contract (PROJECT_INSTRUCTIONS §5–6).
// Used by the Part 1 chat skeleton until GET /conversations and GET /messages are wired in Part 2.

const minutesAgo = (m) => new Date(Date.now() - m * 60 * 1000).toISOString();

export const PREVIEW_ME_ID = 'me';

const people = {
  diya: { _id: 'u_diya', name: 'Diya Patel', profilePicture: '', status: 'online', lastSeen: minutesAgo(0) },
  kabir: { _id: 'u_kabir', name: 'Kabir Rao', profilePicture: '', status: 'offline', lastSeen: minutesAgo(42) },
  meera: { _id: 'u_meera', name: 'Meera Nair', profilePicture: '', status: 'offline', lastSeen: minutesAgo(60 * 26) },
};

export function buildPreviewConversations(me) {
  const self = { _id: PREVIEW_ME_ID, name: me?.name || 'You', profilePicture: '', status: 'online' };
  return [
    {
      _id: 'c_diya',
      type: 'private',
      participants: [self, people.diya],
      lastMessage: { text: 'See you at the lab at 4!', senderId: people.diya._id, createdAt: minutesAgo(3) },
      lastMessageAt: minutesAgo(3),
      isStarred: true,
      unreadCount: 2,
    },
    {
      _id: 'c_robotics',
      type: 'group',
      groupName: 'Robotics Club',
      participants: [self, people.diya, people.kabir, people.meera],
      lastMessage: { text: 'Kits are in room A-12', senderId: people.kabir._id, createdAt: minutesAgo(35) },
      lastMessageAt: minutesAgo(35),
      isStarred: false,
      unreadCount: 0,
    },
    {
      _id: 'c_kabir',
      type: 'private',
      participants: [self, people.kabir],
      lastMessage: { text: 'Thanks, got the notes', senderId: PREVIEW_ME_ID, createdAt: minutesAgo(60 * 20) },
      lastMessageAt: minutesAgo(60 * 20),
      isStarred: false,
      unreadCount: 0,
    },
    {
      _id: 'c_meera',
      type: 'private',
      participants: [self, people.meera],
      lastMessage: { text: 'Physics lab report due Monday', senderId: people.meera._id, createdAt: minutesAgo(60 * 50) },
      lastMessageAt: minutesAgo(60 * 50),
      isStarred: false,
      unreadCount: 0,
    },
  ];
}

const msg = (id, conversationId, sender, text, mins, receipts = {}) => ({
  _id: id,
  conversationId,
  senderId: sender,
  messageType: 'text',
  text,
  deliveredTo: receipts.deliveredTo || [],
  readBy: receipts.readBy || [],
  isPinned: false,
  createdAt: minutesAgo(mins),
});

export function buildPreviewMessages(me) {
  const self = { _id: PREVIEW_ME_ID, name: me?.name || 'You', profilePicture: '' };
  const readBy = (...ids) => ids.map((user) => ({ user, at: minutesAgo(1) }));
  return {
    c_diya: [
      msg('m1', 'c_diya', people.diya, 'Hey! Are you coming to the robotics workshop?', 60 * 25),
      msg('m2', 'c_diya', self, 'Yes! What time does it start?', 60 * 25 - 2, { readBy: readBy('u_diya') }),
      msg('m3', 'c_diya', people.diya, "It moved to Saturday, 4 pm. North Campus lab.", 12),
      msg('m4', 'c_diya', self, "Perfect, I'll bring the Arduino kits.", 8, { readBy: readBy('u_diya') }),
      msg('m5', 'c_diya', self, 'Should I bring the spare sensors too?', 5, { deliveredTo: readBy('u_diya') }),
      msg('m6', 'c_diya', people.diya, 'Yes please 🙌', 4),
      msg('m7', 'c_diya', people.diya, 'See you at the lab at 4!', 3),
    ],
    c_robotics: [
      msg('g1', 'c_robotics', people.meera, 'Who has the soldering kit?', 50),
      msg('g2', 'c_robotics', people.kabir, 'Kits are in room A-12', 35),
    ],
    c_kabir: [
      msg('k1', 'c_kabir', people.kabir, 'Can you share the DSA notes?', 60 * 21),
      msg('k2', 'c_kabir', self, 'Thanks, got the notes', 60 * 20, { readBy: readBy('u_kabir') }),
    ],
    c_meera: [msg('n1', 'c_meera', people.meera, 'Physics lab report due Monday', 60 * 50)],
  };
}

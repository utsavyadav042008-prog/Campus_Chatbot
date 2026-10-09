// Receipt status for one of MY messages (PROJECT_INSTRUCTIONS §7, "Receipt display").
// Works for private chats and groups because receipts are arrays.

const idOf = (value) => (value && typeof value === 'object' ? value._id : value);

export function getMessageStatus(message, conversation, myId) {
  if (message.status === 'failed') return 'failed';
  if (!message._id || message.status === 'sending') return 'sending';

  const others = (conversation?.participants || [])
    .map(idOf)
    .filter((id) => id && id !== myId);
  if (others.length === 0) return 'sent';

  const readers = new Set((message.readBy || []).map((r) => idOf(r.user)));
  if (others.every((id) => readers.has(id))) return 'read';

  const delivered = new Set((message.deliveredTo || []).map((r) => idOf(r.user)));
  readers.forEach((id) => delivered.add(id));
  if (others.every((id) => delivered.has(id))) return 'delivered';

  return 'sent';
}

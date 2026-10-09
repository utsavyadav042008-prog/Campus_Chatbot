const idOf = (value) => (value && typeof value === 'object' ? value._id : value);

export function getOtherParticipant(conversation, myId) {
  return (conversation?.participants || []).find((p) => idOf(p) !== myId) || null;
}

export function getConversationTitle(conversation, myId) {
  if (!conversation) return '';
  if (conversation.type === 'group') return conversation.groupName || 'Group';
  return getOtherParticipant(conversation, myId)?.name || 'Unknown user';
}

export function getConversationAvatar(conversation, myId) {
  if (conversation?.type === 'group') {
    return { name: conversation.groupName || 'Group', src: conversation.groupPicture };
  }
  const other = getOtherParticipant(conversation, myId);
  return { name: other?.name || '', src: other?.profilePicture };
}

/** Live presence from the store, falling back to what the participant object says. */
export function getPresence(presenceMap, user) {
  if (!user) return { online: false, lastSeen: null };
  const live = presenceMap?.[idOf(user)];
  if (live) return live;
  return { online: user.status === 'online', lastSeen: user.lastSeen };
}

/** "typing…" for a private chat, "Diya is typing…" / "Diya and Kabir are typing…" for groups. */
export function typingLabel(typingForConversation, isGroup) {
  const names = Object.values(typingForConversation || {});
  if (names.length === 0) return '';
  if (!isGroup) return 'typing…';
  const first = names[0].split(' ')[0];
  if (names.length === 1) return `${first} is typing…`;
  if (names.length === 2) return `${first} and ${names[1].split(' ')[0]} are typing…`;
  return 'Several people are typing…';
}

export function previewText(message) {
  if (!message) return '';
  if (message.messageType === 'voice') return '🎤 Voice note';
  if (message.messageType === 'image') return '📷 Photo';
  if (message.messageType === 'file') return '📎 File';
  return message.text || '';
}

export { idOf };

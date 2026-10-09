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

export { idOf };

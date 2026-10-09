import { NavLink } from 'react-router-dom';
import { Star } from 'lucide-react';
import Avatar from '../ui/Avatar.jsx';
import { Badge } from '../ui/Feedback.jsx';
import { formatListTime } from '../../lib/format.js';
import { getConversationAvatar, getConversationTitle, getOtherParticipant, idOf } from '../../lib/conversation.js';

export default function ConversationItem({ conversation, myId }) {
  const title = getConversationTitle(conversation, myId);
  const avatar = getConversationAvatar(conversation, myId);
  const other = conversation.type === 'private' ? getOtherParticipant(conversation, myId) : null;
  const last = conversation.lastMessage;
  const fromMe = last && idOf(last.senderId) === myId;
  const unread = conversation.unreadCount || 0;

  return (
    <NavLink
      to={`/chat/${conversation._id}`}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-150 ${
          isActive ? 'bg-brand-50' : 'hover:bg-surface-muted'
        }`
      }
    >
      <Avatar name={avatar.name} src={avatar.src} online={other ? other.status === 'online' : undefined} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1 text-sm font-semibold">
            <span className="truncate">{title}</span>
            {conversation.isStarred ? (
              <Star className="h-3.5 w-3.5 shrink-0 fill-star text-star" aria-label="Starred" />
            ) : null}
          </p>
          {conversation.lastMessageAt ? (
            <span className={`shrink-0 text-[11px] ${unread ? 'font-semibold text-brand-600' : 'text-ink-subtle'}`}>
              {formatListTime(conversation.lastMessageAt)}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className={`truncate text-[13px] ${unread ? 'font-medium text-ink' : 'text-ink-muted'}`}>
            {last ? `${fromMe ? 'You: ' : ''}${last.text || 'Voice note'}` : 'No messages yet'}
          </p>
          {unread ? <Badge aria-label={`${unread} unread`}>{unread > 99 ? '99+' : unread}</Badge> : null}
        </div>
      </div>
    </NavLink>
  );
}

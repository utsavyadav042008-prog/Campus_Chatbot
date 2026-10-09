import { Fragment, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Sparkles, Star } from 'lucide-react';
import Avatar from '../ui/Avatar.jsx';
import Button from '../ui/Button.jsx';
import { EmptyState } from '../ui/Feedback.jsx';
import MessageBubble from './MessageBubble.jsx';
import Composer from './Composer.jsx';
import { formatDayLabel, formatLastSeen, isSameDay } from '../../lib/format.js';
import { getMessageStatus } from '../../lib/receipts.js';
import { getConversationAvatar, getConversationTitle, getOtherParticipant, idOf } from '../../lib/conversation.js';

function presenceText(conversation, myId) {
  if (conversation.type === 'group') return `${conversation.participants.length} members`;
  const other = getOtherParticipant(conversation, myId);
  if (!other) return '';
  return other.status === 'online' ? 'online' : formatLastSeen(other.lastSeen);
}

function ChatHeader({ conversation, myId }) {
  const avatar = getConversationAvatar(conversation, myId);
  const other = conversation.type === 'private' ? getOtherParticipant(conversation, myId) : null;
  const subtitle = presenceText(conversation, myId);

  return (
    <header className="flex items-center gap-2 border-b border-border bg-surface px-2 py-2.5 sm:px-4">
      <Link
        to="/chat"
        aria-label="Back to conversations"
        className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-muted hover:bg-surface-muted md:hidden"
      >
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
      </Link>
      <Avatar name={avatar.name} src={avatar.src} size="sm" online={other ? other.status === 'online' : undefined} />
      <div className="min-w-0 flex-1 pl-1">
        <h2 className="truncate text-sm font-semibold">{getConversationTitle(conversation, myId)}</h2>
        <p className={`truncate text-xs ${subtitle === 'online' ? 'text-success' : 'text-ink-subtle'}`}>{subtitle}</p>
      </div>
      <Button variant="ghost" size="icon" aria-label={conversation.isStarred ? 'Unstar chat' : 'Star chat'} aria-pressed={conversation.isStarred} disabled title="Starring arrives in Part 2">
        <Star className={`h-4.5 w-4.5 ${conversation.isStarred ? 'fill-star text-star' : ''}`} aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Chat Memory" disabled title="Chat Memory arrives in Part 3">
        <Sparkles className="h-4.5 w-4.5" aria-hidden="true" />
      </Button>
    </header>
  );
}

export default function ChatWindow({ conversation, messages, myId, onSend }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, conversation._id]);

  const isGroup = conversation.type === 'group';

  return (
    <div className="flex h-full flex-col bg-canvas">
      <ChatHeader conversation={conversation} myId={myId} />

      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6" role="log" aria-live="polite" aria-label="Messages">
        {messages.length === 0 ? (
          <EmptyState icon={MessageCircle} title="Say hello 👋" description="This is the start of your conversation." className="h-full" />
        ) : (
          messages.map((message, index) => {
            const previous = messages[index - 1];
            const senderId = idOf(message.senderId);
            const mine = senderId === myId;
            const newDay = !previous || !isSameDay(new Date(previous.createdAt), new Date(message.createdAt));
            const grouped = !newDay && previous && idOf(previous.senderId) === senderId;
            return (
              <Fragment key={message._id || message.clientId}>
                {newDay ? (
                  <div className="my-4 flex justify-center">
                    <span className="rounded-full bg-surface px-3 py-1 text-[11px] font-medium text-ink-muted shadow-sm">
                      {formatDayLabel(message.createdAt)}
                    </span>
                  </div>
                ) : null}
                <MessageBubble
                  message={message}
                  mine={mine}
                  status={mine ? getMessageStatus(message, conversation, myId) : undefined}
                  showSender={isGroup && !mine && !grouped}
                  groupedWithPrevious={grouped}
                />
              </Fragment>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <Composer onSend={onSend} />
    </div>
  );
}

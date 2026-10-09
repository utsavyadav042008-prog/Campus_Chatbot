import { Fragment, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, Loader2, MessageCircle } from 'lucide-react';
import MessageBubble from './MessageBubble.jsx';
import TypingIndicator from './TypingIndicator.jsx';
import { EmptyState, ErrorState, Skeleton } from '../ui/Feedback.jsx';
import { formatDayLabel, isSameDay } from '../../lib/format.js';
import { getMessageStatus } from '../../lib/receipts.js';
import { idOf } from '../../lib/conversation.js';

const NEAR_BOTTOM_PX = 120;
const LOAD_OLDER_PX = 80;

const keyOf = (m) => (m ? m.clientId || m._id : null);

function LoadingBubbles() {
  return (
    <div className="space-y-3 py-4" aria-label="Loading messages">
      {['w-48', 'w-64 ml-auto', 'w-40', 'w-56 ml-auto', 'w-36'].map((w, i) => (
        <Skeleton key={i} className={`h-10 rounded-bubble ${w}`} />
      ))}
    </div>
  );
}

export default function MessageList({
  conversation,
  entry,
  myId,
  typingText,
  highlightId,
  onLoadOlder,
  onReload,
  onRetry,
  onPin,
  onUnpin,
}) {
  const scrollRef = useRef(null);
  const atBottomRef = useRef(true);
  const prevRef = useRef({ first: null, last: null, length: 0, scrollHeight: 0 });
  const [unseen, setUnseen] = useState(0);

  const items = entry?.items || [];
  const isGroup = conversation.type === 'group';

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    atBottomRef.current = true;
    setUnseen(0);
  }, []);

  // Keep the view where the user expects it after every change to the list.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const prev = prevRef.current;
    const first = keyOf(items[0]);
    const last = keyOf(items[items.length - 1]);

    if (prev.length === 0 && items.length > 0) {
      el.scrollTop = el.scrollHeight; // first load: start at the newest message
    } else if (first !== prev.first && last === prev.last && items.length > prev.length) {
      el.scrollTop += el.scrollHeight - prev.scrollHeight; // older page prepended: don't jump
    } else if (last !== prev.last && items.length > 0) {
      const newest = items[items.length - 1];
      if (idOf(newest.senderId) === myId || atBottomRef.current) el.scrollTop = el.scrollHeight;
      else setUnseen((n) => n + 1);
    }
    prevRef.current = { first, last, length: items.length, scrollHeight: el.scrollHeight };
  }, [items, myId]);

  // Typing indicator appearing should not hide the last message.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && typingText && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [typingText]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = distance < NEAR_BOTTOM_PX;
    if (atBottomRef.current && unseen) setUnseen(0);
    prevRef.current.scrollHeight = el.scrollHeight;
    if (el.scrollTop < LOAD_OLDER_PX && entry?.hasMore && !entry.loadingOlder) onLoadOlder();
  };

  let content;
  if (!entry || entry.status === 'idle' || (entry.status === 'loading' && items.length === 0)) {
    content = <LoadingBubbles />;
  } else if (entry.status === 'error' && items.length === 0) {
    content = <ErrorState title="Couldn't load messages" message={entry.error} onRetry={onReload} className="h-full" />;
  } else if (items.length === 0) {
    content = (
      <EmptyState icon={MessageCircle} title="Say hello 👋" description="This is the start of your conversation." className="h-full" />
    );
  } else {
    content = (
      <>
        <div className="flex h-8 items-center justify-center">
          {entry.loadingOlder ? (
            <Loader2 className="h-4 w-4 animate-spin text-brand-600" aria-label="Loading older messages" />
          ) : entry.olderError ? (
            <button type="button" onClick={onLoadOlder} className="text-xs font-semibold text-danger hover:underline">
              Couldn't load older messages · Retry
            </button>
          ) : !entry.hasMore ? (
            <span className="text-[11px] text-ink-subtle">Start of conversation</span>
          ) : null}
        </div>
        {items.map((message, index) => {
          const previous = items[index - 1];
          const senderId = idOf(message.senderId);
          const mine = senderId === myId;
          const newDay = !previous || !isSameDay(new Date(previous.createdAt), new Date(message.createdAt));
          const grouped = !newDay && previous && idOf(previous.senderId) === senderId;
          return (
            <Fragment key={keyOf(message)}>
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
                highlighted={highlightId && message._id === highlightId}
                onRetry={() => onRetry(message.clientId)}
                onPin={() => onPin(message)}
                onUnpin={() => onUnpin(message)}
              />
            </Fragment>
          );
        })}
      </>
    );
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-full overflow-y-auto px-3 pb-3 sm:px-6"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Messages"
      >
        {content}
        {typingText ? <TypingIndicator label={typingText} /> : null}
      </div>
      {unseen > 0 ? (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-pop animate-slide-up hover:bg-brand-700"
        >
          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
          {unseen} new {unseen === 1 ? 'message' : 'messages'}
        </button>
      ) : null}
    </div>
  );
}

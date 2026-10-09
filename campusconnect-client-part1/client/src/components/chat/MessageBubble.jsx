import { AlertCircle, Check, CheckCheck, Clock } from 'lucide-react';
import { formatTime } from '../../lib/format.js';

const TICKS = {
  sending: { Icon: Clock, className: 'text-brand-200', label: 'Sending' },
  sent: { Icon: Check, className: 'text-brand-200', label: 'Sent' },
  delivered: { Icon: CheckCheck, className: 'text-brand-200', label: 'Delivered' },
  read: { Icon: CheckCheck, className: 'text-read', label: 'Read' },
  failed: { Icon: AlertCircle, className: 'text-danger', label: 'Failed to send' },
};

export function ReceiptTicks({ status }) {
  const tick = TICKS[status] || TICKS.sent;
  return <tick.Icon className={`h-3.5 w-3.5 ${tick.className}`} aria-label={tick.label} role="img" />;
}

export default function MessageBubble({ message, mine, status, showSender, groupedWithPrevious }) {
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${groupedWithPrevious ? 'mt-0.5' : 'mt-3'} animate-slide-up`}>
      <div
        className={[
          'max-w-[82%] px-3.5 py-2 text-sm shadow-sm sm:max-w-[70%]',
          'rounded-bubble',
          mine ? 'bg-brand-600 text-white' : 'bg-surface text-ink',
          mine && !groupedWithPrevious ? 'rounded-br-md' : '',
          !mine && !groupedWithPrevious ? 'rounded-bl-md' : '',
        ].join(' ')}
      >
        {showSender ? <p className="mb-0.5 text-xs font-semibold text-brand-700">{message.senderId?.name}</p> : null}
        <p className="break-words whitespace-pre-wrap">{message.text}</p>
        <span className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${mine ? 'text-brand-100' : 'text-ink-subtle'}`}>
          <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
          {mine ? <ReceiptTicks status={status} /> : null}
        </span>
      </div>
    </div>
  );
}

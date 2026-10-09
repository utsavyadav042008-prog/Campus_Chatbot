import { useLayoutEffect, useRef, useState } from 'react';
import { Mic, SendHorizontal } from 'lucide-react';
import Button from '../ui/Button.jsx';

export const MESSAGE_MAX = 4000;
const COUNTER_FROM = 3500;
const MAX_HEIGHT_PX = 160;

export default function Composer({ onSend, disabled }) {
  const [text, setText] = useState('');
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [text]);

  const trimmed = text.trim();
  const tooLong = text.length > MESSAGE_MAX;
  const canSend = trimmed.length > 0 && !tooLong && !disabled;

  const send = () => {
    if (!canSend) return;
    onSend(trimmed);
    setText('');
    ref.current?.focus();
  };

  const onKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };

  return (
    <form
      className="border-t border-border bg-surface px-3 py-3 sm:px-4"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <div className="flex items-end gap-2">
        <div className="relative flex-1">
          <label htmlFor="composer" className="sr-only">Message</label>
          <textarea
            id="composer"
            ref={ref}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a message"
            disabled={disabled}
            className="block max-h-40 w-full resize-none rounded-2xl border border-border bg-canvas px-4 py-2.5 text-sm placeholder:text-ink-subtle focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none"
          />
          {text.length >= COUNTER_FROM ? (
            <span className={`absolute right-3 -top-5 text-[11px] ${tooLong ? 'text-danger' : 'text-ink-subtle'}`} aria-live="polite">
              {text.length}/{MESSAGE_MAX}
            </span>
          ) : null}
        </div>
        {trimmed ? (
          <Button type="submit" size="icon" className="rounded-full" disabled={!canSend} aria-label="Send message">
            <SendHorizontal className="h-4.5 w-4.5" aria-hidden="true" />
          </Button>
        ) : (
          <Button variant="secondary" size="icon" className="rounded-full" disabled aria-label="Record voice note (coming in Part 3)" title="Voice notes arrive in Part 3">
            <Mic className="h-4.5 w-4.5" aria-hidden="true" />
          </Button>
        )}
      </div>
      <p className="mt-1.5 hidden text-[11px] text-ink-subtle sm:block">Enter to send · Shift + Enter for a new line</p>
    </form>
  );
}

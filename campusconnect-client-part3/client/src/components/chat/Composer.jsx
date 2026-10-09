import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Mic, SendHorizontal, Trash2 } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { useTypingEmitter } from '../../hooks/useTypingEmitter.js';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder.js';
import { formatDuration, MAX_VOICE_SECONDS, MIN_VOICE_SECONDS } from '../../lib/media.js';

export const MESSAGE_MAX = 4000;
const COUNTER_FROM = 3500;
const MAX_HEIGHT_PX = 160;
const HOLD_MS = 350; // pressed longer than this = "hold to record, release to send"

function RecordingBar({ elapsed, mode, onCancel, onSend }) {
  return (
    <div className="flex h-11 flex-1 items-center gap-3 rounded-2xl border border-danger/30 bg-danger-soft px-3 animate-fade-in" role="status">
      <span className="h-2.5 w-2.5 rounded-full bg-danger animate-pulse-dot" aria-hidden="true" />
      <span className="text-sm font-semibold tabular-nums text-danger" aria-label={`Recording, ${formatDuration(elapsed)}`}>
        {formatDuration(elapsed)}
      </span>
      <span className="flex-1 truncate text-xs text-ink-muted">
        {mode === 'hold' ? 'Release to send · move away to cancel' : `Recording… max ${formatDuration(MAX_VOICE_SECONDS)}`}
      </span>
      {mode === 'toggle' ? (
        <>
          <Button variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Discard voice note">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button size="icon-sm" className="rounded-full" onClick={onSend} aria-label="Send voice note">
            <SendHorizontal className="h-4 w-4" aria-hidden="true" />
          </Button>
        </>
      ) : null}
    </div>
  );
}

export default function Composer({ conversationId, onSend, onSendVoice, onTypingStart, onTypingStop }) {
  const [text, setText] = useState('');
  const [hint, setHint] = useState('');
  const [mode, setMode] = useState('hold'); // 'hold' | 'toggle'
  const ref = useRef(null);
  const pressRef = useRef({ downAt: 0, cancelled: false, viaPointer: false });
  const typing = useTypingEmitter(conversationId, onTypingStart, onTypingStop);

  const finishRef = useRef(null);
  const recorder = useVoiceRecorder({ onLimit: () => finishRef.current?.() });
  const recording = recorder.state === 'recording' || recorder.state === 'requesting';

  const finish = useCallback(async () => {
    const result = await recorder.stop();
    if (!result) return;
    if (result.duration < MIN_VOICE_SECONDS) {
      setHint('Hold the mic a little longer to record a voice note.');
      return;
    }
    onSendVoice(result);
  }, [recorder, onSendVoice]);
  finishRef.current = finish;

  const clearErrorRef = useRef(recorder.clearError);
  clearErrorRef.current = recorder.clearError;
  useEffect(() => {
    if (!hint && !recorder.error) return undefined;
    const id = setTimeout(() => {
      setHint('');
      clearErrorRef.current();
    }, 4000);
    return () => clearTimeout(id);
  }, [hint, recorder.error]);

  useEffect(() => {
    if (!recording) return undefined;
    const onKey = (event) => event.key === 'Escape' && recorder.cancel();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [recording, recorder]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [text, recording]);

  const trimmed = text.trim();
  const tooLong = text.length > MESSAGE_MAX;
  const canSend = trimmed.length > 0 && !tooLong;

  const send = () => {
    if (!canSend) return;
    typing.stop();
    onSend(trimmed);
    setText('');
    ref.current?.focus();
  };

  // ----- mic: hold to record, or tap to start/stop -----
  const onMicDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pressRef.current = { downAt: Date.now(), cancelled: false, viaPointer: true };
    setHint('');
    setMode('hold');
    typing.stop();
    recorder.start();
  };

  const onMicUp = (event) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const heldFor = Date.now() - pressRef.current.downAt;
    if (pressRef.current.cancelled) return;
    if (heldFor < HOLD_MS || recorder.state === 'requesting') setMode('toggle'); // tap: keep recording, show buttons
    else finish();
  };

  const onMicMove = (event) => {
    if (mode !== 'hold' || recorder.state !== 'recording') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const away = Math.hypot(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2));
    if (away > 120) {
      pressRef.current.cancelled = true;
      recorder.cancel();
      setHint('Voice note cancelled');
    }
  };

  // A click with no pointer press before it (screen readers, switch access) starts tap mode.
  const onMicClick = () => {
    if (pressRef.current.viaPointer) {
      pressRef.current.viaPointer = false;
      return;
    }
    setHint('');
    setMode('toggle');
    if (!recording) recorder.start();
  };

  const onMicKey = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    setMode('toggle');
    if (!recording) recorder.start();
  };

  const message = recorder.error || hint;

  return (
    <form
      className="border-t border-border bg-surface px-3 py-3 sm:px-4"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      {message ? (
        <p className={`mb-2 text-xs ${recorder.error ? 'text-danger' : 'text-ink-muted'}`} role="alert">
          {message}
        </p>
      ) : null}
      <div className="flex items-end gap-2">
        {recording ? (
          <RecordingBar elapsed={recorder.elapsed} mode={mode} onCancel={recorder.cancel} onSend={finish} />
        ) : (
          <div className="relative flex-1">
            <label htmlFor="composer" className="sr-only">Message</label>
            <textarea
              id="composer"
              ref={ref}
              rows={1}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                typing.onInput(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              onBlur={typing.stop}
              placeholder="Type a message"
              aria-invalid={tooLong || undefined}
              className="block max-h-40 w-full resize-none rounded-2xl border border-border bg-canvas px-4 py-2.5 text-sm placeholder:text-ink-subtle focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none"
            />
            {text.length >= COUNTER_FROM ? (
              <span className={`absolute right-3 -top-5 text-[11px] ${tooLong ? 'text-danger' : 'text-ink-subtle'}`} aria-live="polite">
                {text.length}/{MESSAGE_MAX}
              </span>
            ) : null}
          </div>
        )}

        {trimmed && !recording ? (
          <Button type="submit" size="icon" className="rounded-full" disabled={!canSend} aria-label="Send message">
            <SendHorizontal className="h-4.5 w-4.5" aria-hidden="true" />
          </Button>
        ) : mode === 'toggle' && recording ? null : (
          <button
            type="button"
            onPointerDown={onMicDown}
            onPointerUp={onMicUp}
            onPointerMove={onMicMove}
            onKeyDown={onMicKey}
            onClick={onMicClick}
            onContextMenu={(e) => e.preventDefault()}
            aria-label={recording ? 'Recording: release to send' : 'Record voice note: hold, or tap to start'}
            title="Hold to record · tap to start/stop"
            className={`flex h-10 w-10 shrink-0 touch-none items-center justify-center rounded-full transition-colors select-none ${
              recording ? 'scale-110 bg-danger text-white' : 'border border-border bg-surface text-ink-muted hover:bg-surface-muted hover:text-ink'
            }`}
          >
            <Mic className="h-4.5 w-4.5" aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="mt-1.5 hidden text-[11px] text-ink-subtle sm:block">
        Enter to send · Shift + Enter for a new line · hold the mic for a voice note
      </p>
    </form>
  );
}

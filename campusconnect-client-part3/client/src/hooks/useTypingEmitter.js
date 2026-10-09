import { useCallback, useEffect, useRef } from 'react';

const THROTTLE_MS = 2000;
const IDLE_MS = 2000;

/**
 * Typing rules from PROJECT_INSTRUCTIONS §7:
 * emit `typing` at most once per 2 s while typing; `stop_typing` after 2 s idle, on send, or on leaving.
 */
export function useTypingEmitter(conversationId, startTyping, stopTyping) {
  const lastSent = useRef(0);
  const idleTimer = useRef(null);
  const active = useRef(false);

  const stop = useCallback(() => {
    clearTimeout(idleTimer.current);
    if (active.current) stopTyping(conversationId);
    active.current = false;
    lastSent.current = 0;
  }, [conversationId, stopTyping]);

  const onInput = useCallback(
    (text) => {
      if (!text.trim()) {
        stop();
        return;
      }
      const now = Date.now();
      if (now - lastSent.current >= THROTTLE_MS) {
        startTyping(conversationId);
        lastSent.current = now;
        active.current = true;
      }
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(stop, IDLE_MS);
    },
    [conversationId, startTyping, stop],
  );

  useEffect(() => stop, [stop]);

  return { onInput, stop };
}

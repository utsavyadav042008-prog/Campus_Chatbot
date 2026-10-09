// Browser voice recording with MediaRecorder (Phase 3, voice notes).
// Owned by P3 per the split; written so the Composer UI can be built and tested now.

import { useCallback, useEffect, useRef, useState } from 'react';
import { baseMime, MAX_VOICE_SECONDS, pickAudioMime } from '../lib/media.js';

const ERRORS = {
  NotAllowedError: 'Microphone access is blocked. Allow it in your browser’s site settings and try again.',
  SecurityError: 'Microphone access is blocked. Allow it in your browser’s site settings and try again.',
  NotFoundError: 'No microphone was found on this device.',
  NotReadableError: 'Your microphone is being used by another app.',
};

export function isRecordingSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

/**
 * state: 'idle' | 'requesting' | 'recording'
 * start() asks for the mic and records; stop() resolves to { blob, duration, mimeType } (or null);
 * cancel() throws the recording away. onLimit fires when maxSeconds is reached.
 */
export function useVoiceRecorder({ maxSeconds = MAX_VOICE_SECONDS, onLimit } = {}) {
  const [state, setState] = useState('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef(null);
  const cancelledRef = useRef(false);
  const onLimitRef = useRef(onLimit);
  onLimitRef.current = onLimit;

  const cleanup = useCallback(() => {
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setElapsed(0);
    setState('idle');
  }, []);

  const start = useCallback(async () => {
    setError('');
    if (!isRecordingSupported()) {
      setError(
        window.isSecureContext === false
          ? 'Voice notes need a secure (https) connection.'
          : 'Voice recording is not supported in this browser.',
      );
      return false;
    }
    cancelledRef.current = false;
    setState('requesting');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      setError(ERRORS[err?.name] || 'Could not start the microphone.');
      setState('idle');
      return false;
    }
    if (cancelledRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      setState('idle');
      return false;
    }
    const mimeType = pickAudioMime();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => e.data?.size && chunksRef.current.push(e.data);
    streamRef.current = stream;
    recorderRef.current = recorder;
    recorder.start(250);
    startedAtRef.current = Date.now();
    setState('recording');
    timerRef.current = setInterval(() => {
      const seconds = (Date.now() - startedAtRef.current) / 1000;
      setElapsed(seconds);
      if (seconds >= maxSeconds) onLimitRef.current?.();
    }, 200);
    return true;
  }, [maxSeconds]);

  const stop = useCallback(
    () =>
      new Promise((resolve) => {
        const recorder = recorderRef.current;
        if (!recorder || recorder.state === 'inactive') {
          cleanup();
          resolve(null);
          return;
        }
        const duration = Math.min((Date.now() - startedAtRef.current) / 1000, maxSeconds);
        recorder.onstop = () => {
          const mimeType = baseMime(recorder.mimeType || chunksRef.current[0]?.type || 'audio/webm');
          const blob = new Blob(chunksRef.current, { type: mimeType });
          cleanup();
          resolve({ blob, duration, mimeType });
        };
        recorder.stop();
      }),
    [cleanup, maxSeconds],
  );

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = cleanup;
      recorder.stop();
    } else {
      cleanup();
    }
  }, [cleanup]);

  useEffect(() => () => cancel(), [cancel]);

  return { state, elapsed, error, clearError: () => setError(''), start, stop, cancel };
}

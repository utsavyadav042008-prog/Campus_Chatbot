import { useEffect, useId, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { formatDuration } from '../../lib/media.js';

const PLAY_EVENT = 'cc:audio-play';

/**
 * Voice-note bubble player. Uses the duration stored on the message, because browsers
 * often report Infinity for MediaRecorder webm files. Only one note plays at a time.
 */
export default function VoicePlayer({ src, duration = 0, mine }) {
  const id = useId();
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [failed, setFailed] = useState(false);

  const audioDuration = audioRef.current?.duration;
  const total = duration || (Number.isFinite(audioDuration) ? audioDuration : 0);
  const progress = total ? Math.min(1, current / total) : 0;

  useEffect(() => {
    const onOtherPlay = (event) => {
      if (event.detail !== id) audioRef.current?.pause();
    };
    window.addEventListener(PLAY_EVENT, onOtherPlay);
    return () => window.removeEventListener(PLAY_EVENT, onOtherPlay);
  }, [id]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: id }));
    try {
      await audio.play();
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };

  const seek = (event) => {
    const audio = audioRef.current;
    if (!audio || !total) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * total;
    setCurrent(audio.currentTime);
  };

  const onKeyDown = (event) => {
    const audio = audioRef.current;
    if (!audio || !total) return;
    if (event.key === 'ArrowRight') audio.currentTime = Math.min(total, audio.currentTime + 5);
    else if (event.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
    else return;
    event.preventDefault();
    setCurrent(audio.currentTime);
  };

  const Icon = playing ? Pause : Play;

  return (
    <div className="flex w-56 max-w-full items-center gap-3 py-0.5">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onError={() => setFailed(true)}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
          mine ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-brand-100 text-brand-700 hover:bg-brand-200'
        }`}
      >
        <Icon className={`h-4 w-4 ${playing ? '' : 'translate-x-px'}`} aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Voice note position"
          aria-valuemin={0}
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.round(current)}
          aria-valuetext={`${formatDuration(current)} of ${formatDuration(total)}`}
          onClick={seek}
          onKeyDown={onKeyDown}
          className="flex h-5 cursor-pointer items-center"
        >
          <div className={`h-1.5 w-full overflow-hidden rounded-full ${mine ? 'bg-white/25' : 'bg-surface-muted'}`}>
            <div className={`h-full rounded-full ${mine ? 'bg-white' : 'bg-brand-500'}`} style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
        <p className={`text-[11px] ${mine ? 'text-brand-100' : 'text-ink-subtle'}`}>
          {failed ? "Can't play this voice note" : formatDuration(playing || current ? current : total)}
        </p>
      </div>
    </div>
  );
}

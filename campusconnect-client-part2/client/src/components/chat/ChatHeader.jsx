import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Sparkles, Star } from 'lucide-react';
import Avatar from '../ui/Avatar.jsx';
import Button from '../ui/Button.jsx';
import { useNow } from '../../hooks/useNow.js';
import { formatLastSeen } from '../../lib/format.js';
import {
  getConversationAvatar,
  getConversationTitle,
  getOtherParticipant,
  getPresence,
  typingLabel,
} from '../../lib/conversation.js';

export default function ChatHeader({ conversation, myId, presence, typing, onToggleStar }) {
  const now = useNow(30000);
  const [starError, setStarError] = useState(false);
  const isGroup = conversation.type === 'group';
  const avatar = getConversationAvatar(conversation, myId);
  const other = isGroup ? null : getOtherParticipant(conversation, myId);
  const otherPresence = other ? getPresence(presence, other) : null;

  const typingText = typingLabel(typing, isGroup);
  let subtitle;
  let subtitleClass = 'text-ink-subtle';
  if (typingText) {
    subtitle = typingText;
    subtitleClass = 'text-brand-600 font-medium';
  } else if (isGroup) {
    subtitle = `${conversation.participants.length} members`;
  } else if (otherPresence?.online) {
    subtitle = 'online';
    subtitleClass = 'text-success font-medium';
  } else {
    subtitle = formatLastSeen(otherPresence?.lastSeen, now);
  }

  const toggleStar = async () => {
    setStarError(false);
    try {
      await onToggleStar();
    } catch {
      setStarError(true);
      setTimeout(() => setStarError(false), 2500);
    }
  };

  const starred = Boolean(conversation.isStarred);

  return (
    <header className="flex items-center gap-2 border-b border-border bg-surface px-2 py-2.5 sm:px-4">
      <Link
        to="/chat"
        aria-label="Back to conversations"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink-muted hover:bg-surface-muted md:hidden"
      >
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
      </Link>
      <Avatar name={avatar.name} src={avatar.src} size="sm" online={otherPresence ? otherPresence.online : undefined} />
      <div className="min-w-0 flex-1 pl-1">
        <h2 className="truncate text-sm font-semibold">{getConversationTitle(conversation, myId)}</h2>
        <p className={`truncate text-xs ${subtitleClass}`} aria-live="polite">
          {starError ? <span className="text-danger">Couldn't update star. Try again.</span> : subtitle}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleStar}
        aria-label={starred ? 'Unstar chat' : 'Star chat'}
        aria-pressed={starred}
        title={starred ? 'Unstar chat' : 'Star chat'}
      >
        <Star className={`h-4.5 w-4.5 transition-colors ${starred ? 'fill-star text-star' : ''}`} aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Chat Memory" disabled title="Chat Memory arrives in Part 3">
        <Sparkles className="h-4.5 w-4.5" aria-hidden="true" />
      </Button>
    </header>
  );
}

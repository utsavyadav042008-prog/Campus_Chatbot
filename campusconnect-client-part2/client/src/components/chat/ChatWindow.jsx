import { useCallback, useEffect, useRef, useState } from 'react';
import ChatHeader from './ChatHeader.jsx';
import PinnedBar from './PinnedBar.jsx';
import MessageList from './MessageList.jsx';
import Composer from './Composer.jsx';
import ConnectionBanner from './ConnectionBanner.jsx';
import { useChat } from '../../context/ChatStore.jsx';
import { getErrorMessage } from '../../lib/api.js';
import { typingLabel } from '../../lib/conversation.js';

const HIGHLIGHT_MS = 1600;

export default function ChatWindow({ conversation }) {
  const { state, actions, myId, connection } = useChat();
  const id = conversation._id;
  const entry = state.messages[id];
  const pinned = state.pinned[id]?.items || [];
  const typing = state.typing[id];
  const typingText = typingLabel(typing, conversation.type === 'group');

  const [highlightId, setHighlightId] = useState(null);
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef(null);

  const flash = useCallback((text) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 3000);
  }, []);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const jumpTo = (messageId) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) {
      flash('That message is further up. Scroll up to load it.');
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(messageId);
    setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
  };

  const pin = async (message, value) => {
    try {
      await actions.setPinned(message, value);
    } catch (error) {
      flash(getErrorMessage(error, value ? 'Could not pin the message.' : 'Could not unpin the message.'));
    }
  };

  return (
    <div className="flex h-full flex-col bg-canvas">
      <ChatHeader
        conversation={conversation}
        myId={myId}
        presence={state.presence}
        typing={typing}
        onToggleStar={() => actions.toggleStar(id)}
      />
      <ConnectionBanner connection={connection} />
      <PinnedBar pinned={pinned} onJump={jumpTo} onUnpin={(m) => pin(m, false)} />
      {notice ? (
        <div role="status" className="bg-ink px-3 py-1.5 text-center text-xs text-white animate-fade-in">
          {notice}
        </div>
      ) : null}

      <MessageList
        conversation={conversation}
        entry={entry}
        myId={myId}
        typingText={typingText}
        highlightId={highlightId}
        onLoadOlder={() => actions.loadOlder(id)}
        onReload={() => actions.loadMessages(id)}
        onRetry={(clientId) => actions.retryMessage(id, clientId)}
        onPin={(m) => pin(m, true)}
        onUnpin={(m) => pin(m, false)}
      />

      <Composer
        conversationId={id}
        onSend={(text) => actions.sendMessage(id, text)}
        onTypingStart={actions.startTyping}
        onTypingStop={actions.stopTyping}
      />
    </div>
  );
}

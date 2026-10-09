import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessagesSquare, SearchX } from 'lucide-react';
import Sidebar from '../components/sidebar/Sidebar.jsx';
import ChatWindow from '../components/chat/ChatWindow.jsx';
import ConnectionBanner from '../components/chat/ConnectionBanner.jsx';
import { EmptyState, ErrorState, Spinner } from '../components/ui/Feedback.jsx';
import { buttonClass } from '../components/ui/Button.jsx';
import { useChat } from '../context/ChatStore.jsx';
import { getErrorMessage } from '../lib/api.js';

const BASE_TITLE = 'CampusConnect';

export default function Chat() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { state, actions, connection } = useChat();
  const conversation = conversationId ? state.conversations.byId[conversationId] : null;
  const listReady = state.conversations.status === 'ready';

  // 'ok' | 'checking' | 'missing' | 'error'
  const [lookup, setLookup] = useState({ status: 'ok', error: '' });
  const [lookupAttempt, setLookupAttempt] = useState(0);
  const hasConversation = Boolean(conversation);

  // A chat opened from a link may not be in the list yet: fetch it, or show "not found".
  useEffect(() => {
    if (!conversationId || conversation || !listReady) {
      setLookup({ status: 'ok', error: '' });
      return undefined;
    }
    let cancelled = false;
    setLookup({ status: 'checking', error: '' });
    actions
      .fetchConversation(conversationId)
      .then((found) => !cancelled && setLookup({ status: found ? 'ok' : 'missing', error: '' }))
      .catch((error) => !cancelled && setLookup({ status: 'error', error: getErrorMessage(error) }));
    return () => {
      cancelled = true;
    };
  }, [conversationId, conversation, listReady, actions, lookupAttempt]);

  useEffect(() => {
    actions.openConversation(hasConversation ? conversationId : null);
  }, [conversationId, hasConversation, actions]);

  useEffect(() => () => actions.openConversation(null), [actions]);

  // Unread total in the browser tab title.
  const unreadTotal = state.conversations.order.reduce(
    (sum, id) => sum + (state.conversations.byId[id]?.unreadCount || 0),
    0,
  );
  useEffect(() => {
    document.title = unreadTotal ? `(${unreadTotal}) ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [unreadTotal]);

  const showChatOnMobile = Boolean(conversationId);

  let main;
  if (conversation) {
    main = <ChatWindow key={conversation._id} conversation={conversation} />;
  } else if (conversationId && (lookup.status === 'checking' || !listReady)) {
    main = (
      <div className="flex h-full items-center justify-center bg-canvas">
        <Spinner className="h-6 w-6" label="Opening chat" />
      </div>
    );
  } else if (conversationId && lookup.status === 'error') {
    main = <ErrorState title="Couldn't open this chat" message={lookup.error} onRetry={() => setLookupAttempt((n) => n + 1)} className="h-full bg-canvas" />;
  } else if (conversationId) {
    main = (
      <EmptyState
        icon={SearchX}
        title="Conversation not found"
        description="It may have been deleted, or you're not a member."
        action={
          <button type="button" onClick={() => navigate('/chat')} className={buttonClass({ variant: 'secondary' })}>
            Back to chats
          </button>
        }
        className="h-full bg-canvas"
      />
    );
  } else {
    main = (
      <div className="flex h-full flex-col bg-canvas">
        <ConnectionBanner connection={connection} />
        <EmptyState
          icon={MessagesSquare}
          title="Pick a conversation"
          description="Choose a chat on the left, or search for a classmate to start a new one."
          className="flex-1"
        />
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-surface">
      <aside
        className={`${showChatOnMobile ? 'hidden' : 'flex'} w-full flex-col border-r border-border bg-surface md:flex md:w-80 lg:w-96`}
      >
        <Sidebar />
      </aside>
      <main className={`${showChatOnMobile ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col md:flex`}>{main}</main>
    </div>
  );
}

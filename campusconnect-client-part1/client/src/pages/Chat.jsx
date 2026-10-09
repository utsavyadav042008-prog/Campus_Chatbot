import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessagesSquare, SearchX } from 'lucide-react';
import Sidebar from '../components/sidebar/Sidebar.jsx';
import ChatWindow from '../components/chat/ChatWindow.jsx';
import { EmptyState } from '../components/ui/Feedback.jsx';
import { buttonClass } from '../components/ui/Button.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { buildPreviewConversations, buildPreviewMessages, PREVIEW_ME_ID } from '../lib/fixtures.js';

// Part 1: the layout runs on preview fixtures shaped like the real API.
// Part 2 replaces the two useState initialisers with ChatStore + GET /conversations and GET /messages.
export default function Chat() {
  const { user, logout } = useAuth();
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  const myId = PREVIEW_ME_ID;
  const [conversations] = useState(() => buildPreviewConversations(user));
  const [messagesById, setMessagesById] = useState(() => buildPreviewMessages(user));

  const active = useMemo(
    () => conversations.find((c) => c._id === conversationId) || null,
    [conversations, conversationId],
  );

  const onSend = useCallback(
    (text) => {
      if (!active) return;
      const clientId = `tmp_${Date.now()}`;
      const draft = {
        clientId,
        conversationId: active._id,
        senderId: { _id: myId, name: user?.name },
        messageType: 'text',
        text,
        deliveredTo: [],
        readBy: [],
        status: 'sending',
        createdAt: new Date().toISOString(),
      };
      setMessagesById((all) => ({ ...all, [active._id]: [...(all[active._id] || []), draft] }));
      setTimeout(() => {
        setMessagesById((all) => ({
          ...all,
          [active._id]: (all[active._id] || []).map((m) =>
            m.clientId === clientId ? { ...m, _id: `local_${clientId}`, status: undefined } : m,
          ),
        }));
      }, 600);
    },
    [active, myId, user?.name],
  );

  const onLogout = async () => {
    setLoggingOut(true);
    await logout();
    navigate('/login', { replace: true });
  };

  const showChatOnMobile = Boolean(conversationId);

  return (
    <div className="flex h-dvh overflow-hidden bg-surface">
      <aside
        className={`${showChatOnMobile ? 'hidden' : 'flex'} w-full flex-col border-r border-border bg-surface md:flex md:w-80 lg:w-96`}
      >
        <Sidebar
          me={user}
          myId={myId}
          conversations={conversations}
          onLogout={onLogout}
          loggingOut={loggingOut}
          isPreview
        />
      </aside>

      <main className={`${showChatOnMobile ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col md:flex`}>
        {active ? (
          <ChatWindow
            key={active._id}
            conversation={active}
            messages={messagesById[active._id] || []}
            myId={myId}
            onSend={onSend}
          />
        ) : conversationId ? (
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
        ) : (
          <EmptyState
            icon={MessagesSquare}
            title="Pick a conversation"
            description="Choose a chat on the left, or search for a classmate to start a new one."
            className="h-full bg-canvas"
          />
        )}
      </main>
    </div>
  );
}

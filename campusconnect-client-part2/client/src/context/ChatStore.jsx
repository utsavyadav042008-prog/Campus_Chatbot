import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { chatReducer, initialChatState } from '../state/chatReducer.js';
import { useChatSocket } from '../hooks/useChatSocket.js';
import { conversationsApi, getErrorMessage, messagesApi } from '../lib/api.js';
import { emit, emitWithAck } from '../lib/socket.js';
import { tokenStore } from '../lib/storage.js';

const ChatContext = createContext(null);

const newClientId = () => `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const tabVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

export function ChatProvider({ children }) {
  const { user } = useAuth();
  const myId = user?._id;
  const [state, dispatch] = useReducer(chatReducer, initialChatState);

  const stateRef = useRef(state);
  stateRef.current = state;

  // ---------- loading ----------

  const loadConversations = useCallback(async () => {
    dispatch({ type: 'CONVERSATIONS_LOADING' });
    try {
      const { conversations } = await conversationsApi.list();
      dispatch({ type: 'CONVERSATIONS_LOADED', conversations });
    } catch (error) {
      dispatch({ type: 'CONVERSATIONS_FAILED', error: getErrorMessage(error) });
    }
  }, []);

  const fetchConversation = useCallback(async (conversationId) => {
    try {
      const { conversation } = await conversationsApi.get(conversationId);
      dispatch({ type: 'CONVERSATION_UPSERT', conversation });
      return conversation;
    } catch (error) {
      if (error.response?.status === 404 || error.response?.status === 400) return null;
      throw error;
    }
  }, []);

  const loadMessages = useCallback(async (conversationId) => {
    dispatch({ type: 'MESSAGES_LOADING', conversationId });
    try {
      const { messages, hasMore } = await messagesApi.list(conversationId);
      dispatch({ type: 'MESSAGES_LOADED', conversationId, messages, hasMore });
    } catch (error) {
      dispatch({ type: 'MESSAGES_FAILED', conversationId, error: getErrorMessage(error) });
    }
  }, []);

  const loadOlder = useCallback(async (conversationId) => {
    const entry = stateRef.current.messages[conversationId];
    if (!entry || entry.loadingOlder || !entry.hasMore) return;
    const oldest = entry.items.find((m) => m._id);
    if (!oldest) return;
    dispatch({ type: 'MESSAGES_LOADING', conversationId, older: true });
    try {
      const { messages, hasMore } = await messagesApi.list(conversationId, { before: oldest.createdAt });
      dispatch({ type: 'MESSAGES_LOADED', conversationId, messages, hasMore, older: true });
    } catch (error) {
      dispatch({ type: 'MESSAGES_FAILED', conversationId, error: getErrorMessage(error), older: true });
    }
  }, []);

  const loadPinned = useCallback(async (conversationId) => {
    try {
      const { messages } = await messagesApi.pinned(conversationId);
      dispatch({ type: 'PINNED_LOADED', conversationId, messages });
    } catch {
      dispatch({ type: 'PINNED_LOADED', conversationId, messages: [] });
    }
  }, []);

  // ---------- reading ----------

  const markRead = useCallback((conversationId) => {
    if (!conversationId || !tabVisible()) return;
    emit('message_read', { conversationId });
    dispatch({ type: 'MARK_READ_LOCAL', conversationId });
  }, []);

  /** Opens a chat: makes it active, loads history + pinned once, marks it read. */
  const openConversation = useCallback(
    (conversationId) => {
      dispatch({ type: 'SET_ACTIVE', conversationId });
      if (!conversationId) return;
      const entry = stateRef.current.messages[conversationId];
      if (!entry || entry.status === 'error' || entry.status === 'idle') loadMessages(conversationId);
      if (!stateRef.current.pinned[conversationId]) loadPinned(conversationId);
      markRead(conversationId);
    },
    [loadMessages, loadPinned, markRead],
  );

  // ---------- sending ----------

  const deliver = useCallback(
    async (conversationId, clientId, text) => {
      const res = await emitWithAck('send_message', { conversationId, text, clientId });
      if (res.ok && res.message) dispatch({ type: 'MESSAGE_CONFIRMED', clientId, message: res.message });
      else dispatch({ type: 'MESSAGE_FAILED', conversationId, clientId, error: res.error || 'Not sent' });
    },
    [],
  );

  const sendMessage = useCallback(
    (conversationId, text) => {
      const clientId = newClientId();
      dispatch({
        type: 'MESSAGE_OPTIMISTIC',
        message: {
          clientId,
          conversationId,
          senderId: { _id: myId, name: user?.name, profilePicture: user?.profilePicture || '' },
          messageType: 'text',
          text,
          deliveredTo: [],
          readBy: [],
          isPinned: false,
          status: 'sending',
          createdAt: new Date().toISOString(),
        },
      });
      deliver(conversationId, clientId, text);
    },
    [deliver, myId, user?.name, user?.profilePicture],
  );

  const retryMessage = useCallback(
    (conversationId, clientId) => {
      const message = stateRef.current.messages[conversationId]?.items.find((m) => m.clientId === clientId);
      if (!message) return;
      dispatch({ type: 'MESSAGE_RETRYING', conversationId, clientId });
      deliver(conversationId, clientId, message.text);
    },
    [deliver],
  );

  const startTyping = useCallback((conversationId) => emit('typing', { conversationId }), []);
  const stopTyping = useCallback((conversationId) => emit('stop_typing', { conversationId }), []);

  // ---------- organising ----------

  const startConversation = useCallback(async (userId) => {
    const { conversation } = await conversationsApi.openPrivate(userId);
    dispatch({ type: 'CONVERSATION_UPSERT', conversation });
    return conversation;
  }, []);

  /** Optimistic star toggle; rolls back and rethrows if the server refuses. */
  const toggleStar = useCallback(async (conversationId) => {
    const current = Boolean(stateRef.current.conversations.byId[conversationId]?.isStarred);
    dispatch({ type: 'STAR_SET', conversationId, value: !current });
    try {
      if (current) await conversationsApi.unstar(conversationId);
      else await conversationsApi.star(conversationId);
    } catch (error) {
      dispatch({ type: 'STAR_SET', conversationId, value: current });
      throw error;
    }
  }, []);

  const setPinned = useCallback(async (message, pinned) => {
    const { conversationId, _id: messageId } = message;
    if (pinned) {
      const res = await messagesApi.pin(conversationId, messageId);
      dispatch({ type: 'MESSAGE_PINNED', message: res?.message || { ...message, isPinned: true, pinnedAt: new Date().toISOString() } });
    } else {
      await messagesApi.unpin(conversationId, messageId);
      dispatch({ type: 'MESSAGE_UNPINNED', conversationId, messageId });
    }
  }, []);

  // ---------- socket ----------

  const isViewing = useCallback(
    (conversationId) => stateRef.current.activeId === conversationId && tabVisible(),
    [],
  );
  const hasConversation = useCallback((id) => Boolean(stateRef.current.conversations.byId[id]), []);

  // First connect: tell the server we've read the open chat (the REST load may have beaten the socket).
  // Reconnect: we may have missed events while offline, so refetch what's on screen.
  const onConnect = useCallback(
    (isReconnect) => {
      const active = stateRef.current.activeId;
      if (isReconnect) {
        loadConversations();
        if (active) loadMessages(active);
      }
      if (active) markRead(active);
    },
    [loadConversations, loadMessages, markRead],
  );

  const connection = useChatSocket({
    token: tokenStore.get(),
    myId,
    dispatch,
    isViewing,
    hasConversation,
    fetchConversation,
    onConnect,
  });

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Coming back to the tab marks the open chat as read.
  useEffect(() => {
    const onVisible = () => {
      if (tabVisible()) markRead(stateRef.current.activeId);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [markRead]);

  const actions = useMemo(
    () => ({
      loadConversations,
      fetchConversation,
      openConversation,
      loadMessages,
      loadOlder,
      sendMessage,
      retryMessage,
      startTyping,
      stopTyping,
      markRead,
      startConversation,
      toggleStar,
      setPinned,
    }),
    [
      loadConversations,
      fetchConversation,
      openConversation,
      loadMessages,
      loadOlder,
      sendMessage,
      retryMessage,
      startTyping,
      stopTyping,
      markRead,
      startConversation,
      toggleStar,
      setPinned,
    ],
  );

  const value = useMemo(() => ({ state, actions, myId, connection }), [state, actions, myId, connection]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

/** Route layout: everything under /chat shares one store and one socket. */
export function ChatLayout() {
  return (
    <ChatProvider>
      <Outlet />
    </ChatProvider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChat must be used inside <ChatProvider>');
  return context;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { chatReducer, initialChatState } from '../state/chatReducer.js';
import { useChatSocket } from '../hooks/useChatSocket.js';
import { conversationsApi, getErrorMessage, messagesApi } from '../lib/api.js';
import { emit, emitWithAck } from '../lib/socket.js';
import { tokenStore } from '../lib/storage.js';
import { audioExtension, validateAudio } from '../lib/media.js';
import { useToast } from '../components/ui/Toast.jsx';

const ChatContext = createContext(null);

const newClientId = () => `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const tabVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

export function ChatProvider({ children }) {
  const { user } = useAuth();
  const myId = user?._id;
  const [state, dispatch] = useReducer(chatReducer, initialChatState);

  const stateRef = useRef(state);
  stateRef.current = state;
  const toast = useToast();

  // Voice notes waiting to upload (or to retry): clientId -> { conversationId, blob, duration, mimeType, url }
  const pendingMediaRef = useRef(new Map());

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

  const uploadMedia = useCallback(async (clientId) => {
    const pending = pendingMediaRef.current.get(clientId);
    if (!pending) return;
    const { conversationId, blob, duration, mimeType, url } = pending;
    let lastReported = 0;
    try {
      const file = new File([blob], `voice-${Date.now()}.${audioExtension(mimeType)}`, { type: mimeType });
      const res = await messagesApi.uploadMedia(conversationId, { file, duration: Math.round(duration * 10) / 10, clientId }, (p) => {
        if (p - lastReported < 0.1 && p < 1) return;
        lastReported = p;
        dispatch({ type: 'MESSAGE_UPLOAD_PROGRESS', conversationId, clientId, progress: p });
      });
      if (res?.message) dispatch({ type: 'MESSAGE_CONFIRMED', clientId, message: res.message });
      pendingMediaRef.current.delete(clientId);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (error) {
      dispatch({ type: 'MESSAGE_FAILED', conversationId, clientId, error: getErrorMessage(error, 'Upload failed') });
    }
  }, []);

  /** Optimistic voice note: plays from the local recording at once, uploads in the background. */
  const sendVoiceNote = useCallback(
    (conversationId, { blob, duration, mimeType }) => {
      const invalid = validateAudio(blob);
      if (invalid) {
        toast.error(invalid);
        return;
      }
      const clientId = newClientId();
      const url = URL.createObjectURL(blob);
      pendingMediaRef.current.set(clientId, { conversationId, blob, duration, mimeType, url });
      dispatch({
        type: 'MESSAGE_OPTIMISTIC',
        message: {
          clientId,
          conversationId,
          senderId: { _id: myId, name: user?.name, profilePicture: user?.profilePicture || '' },
          messageType: 'voice',
          text: '',
          mediaUrl: url,
          mediaType: mimeType,
          duration,
          deliveredTo: [],
          readBy: [],
          isPinned: false,
          status: 'sending',
          progress: 0,
          createdAt: new Date().toISOString(),
        },
      });
      uploadMedia(clientId);
    },
    [myId, toast, uploadMedia, user?.name, user?.profilePicture],
  );

  const retryMessage = useCallback(
    (conversationId, clientId) => {
      const message = stateRef.current.messages[conversationId]?.items.find((m) => m.clientId === clientId);
      if (!message) return;
      dispatch({ type: 'MESSAGE_RETRYING', conversationId, clientId });
      if (pendingMediaRef.current.has(clientId)) uploadMedia(clientId);
      else deliver(conversationId, clientId, message.text);
    },
    [deliver, uploadMedia],
  );

  useEffect(() => {
    const pending = pendingMediaRef.current;
    return () => pending.forEach(({ url }) => URL.revokeObjectURL(url));
  }, []);

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

  // ---------- groups (Phase 3) ----------

  const upsertFrom = useCallback(
    async (promise, conversationId) => {
      const res = await promise;
      if (res?.conversation) dispatch({ type: 'CONVERSATION_UPSERT', conversation: res.conversation });
      else if (conversationId) await fetchConversation(conversationId);
      return res?.conversation;
    },
    [fetchConversation],
  );

  const createGroup = useCallback(
    (name, memberIds) => upsertFrom(conversationsApi.createGroup({ name, memberIds })),
    [upsertFrom],
  );
  const renameGroup = useCallback(
    (id, groupName) => upsertFrom(conversationsApi.updateGroup(id, { groupName }), id),
    [upsertFrom],
  );
  const uploadGroupPicture = useCallback(
    (id, file, onProgress) => upsertFrom(conversationsApi.uploadGroupPicture(id, file, onProgress), id),
    [upsertFrom],
  );
  const removeGroupPicture = useCallback(
    (id) => upsertFrom(conversationsApi.updateGroup(id, { groupPicture: '' }), id),
    [upsertFrom],
  );
  const addMember = useCallback((id, userId) => upsertFrom(conversationsApi.addMember(id, userId), id), [upsertFrom]);
  const removeMember = useCallback(
    (id, userId) => upsertFrom(conversationsApi.removeMember(id, userId), id),
    [upsertFrom],
  );
  const leaveGroup = useCallback(
    async (id) => {
      await conversationsApi.removeMember(id, myId);
      dispatch({ type: 'CONVERSATION_REMOVE', conversationId: id });
    },
    [myId],
  );

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
    onRemovedFromGroup: (conversationId) => {
      const name = stateRef.current.conversations.byId[conversationId]?.groupName;
      toast.info(name ? `You were removed from ${name}` : 'You were removed from a group');
    },
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
      sendVoiceNote,
      createGroup,
      renameGroup,
      uploadGroupPicture,
      removeGroupPicture,
      addMember,
      removeMember,
      leaveGroup,
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
      sendVoiceNote,
      createGroup,
      renameGroup,
      uploadGroupPicture,
      removeGroupPicture,
      addMember,
      removeMember,
      leaveGroup,
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

// Connects the socket and turns server events into ChatStore actions (PROJECT_INSTRUCTIONS §7).
// Owned by P3; written against the contract so the UI works end to end now.

import { useEffect, useRef, useState } from 'react';
import { connectSocket, disconnectSocket, emit } from '../lib/socket.js';

const TYPING_EXPIRY_MS = 6000;

/**
 * @param {object} opts
 * @param {string} opts.token
 * @param {string} opts.myId
 * @param {Function} opts.dispatch           ChatStore dispatch
 * @param {Function} opts.isViewing          (conversationId) => boolean: chat open and tab visible
 * @param {Function} opts.hasConversation    (conversationId) => boolean
 * @param {Function} opts.fetchConversation  (conversationId) => Promise, for chats we don't know yet
 * @param {Function} opts.onConnect          (isReconnect) => void; refetch after missing events while offline
 * @returns {'connecting'|'connected'|'reconnecting'|'error'}
 */
export function useChatSocket({
  token,
  myId,
  dispatch,
  isViewing,
  hasConversation,
  fetchConversation,
  onConnect,
  onRemovedFromGroup,
}) {
  const [connection, setConnection] = useState('connecting');
  const handlersRef = useRef({});
  handlersRef.current = { isViewing, hasConversation, fetchConversation, onConnect, onRemovedFromGroup };

  useEffect(() => {
    if (!token || !myId) return undefined;
    const socket = connectSocket(token);
    const typingTimers = new Map();
    let everConnected = false;

    const stopTypingLater = (conversationId, userId) => {
      const key = `${conversationId}|${userId}`;
      clearTimeout(typingTimers.get(key));
      typingTimers.set(
        key,
        setTimeout(() => dispatch({ type: 'TYPING_STOP', conversationId, userId }), TYPING_EXPIRY_MS),
      );
    };

    const on = {
      connect: () => {
        setConnection('connected');
        handlersRef.current.onConnect?.(everConnected);
        everConnected = true;
      },
      disconnect: (reason) => {
        setConnection(reason === 'io client disconnect' ? 'connecting' : 'reconnecting');
      },
      connect_error: () => setConnection(everConnected ? 'reconnecting' : 'error'),

      new_message: ({ message }) => {
        if (!message) return;
        const { conversationId } = message;
        const senderId = typeof message.senderId === 'object' ? message.senderId._id : message.senderId;
        const fromOther = senderId !== myId;
        const viewing = handlersRef.current.isViewing(conversationId);
        if (!handlersRef.current.hasConversation(conversationId)) {
          handlersRef.current.fetchConversation(conversationId);
        }
        dispatch({ type: 'MESSAGE_RECEIVED', message, myId, isViewing: viewing });
        if (fromOther) {
          emit('message_delivered', { messageId: message._id });
          if (viewing) emit('message_read', { conversationId });
        }
      },

      conversation_created: ({ conversation }) => {
        if (conversation) dispatch({ type: 'CONVERSATION_UPSERT', conversation });
      },

      typing: ({ conversationId, userId, name }) => {
        if (userId === myId) return;
        dispatch({ type: 'TYPING_START', conversationId, userId, name });
        stopTypingLater(conversationId, userId);
      },
      stop_typing: ({ conversationId, userId }) => {
        clearTimeout(typingTimers.get(`${conversationId}|${userId}`));
        dispatch({ type: 'TYPING_STOP', conversationId, userId });
      },

      user_online: ({ userId }) => dispatch({ type: 'PRESENCE', userId, online: true }),
      user_offline: ({ userId, lastSeen }) => dispatch({ type: 'PRESENCE', userId, online: false, lastSeen }),

      message_delivered: (payload) => dispatch({ type: 'RECEIPT_DELIVERED', ...payload }),
      message_read: (payload) => dispatch({ type: 'RECEIPT_READ', ...payload, myId }),

      message_pinned: ({ message }) => message && dispatch({ type: 'MESSAGE_PINNED', message }),
      message_unpinned: ({ conversationId, messageId }) => dispatch({ type: 'MESSAGE_UNPINNED', conversationId, messageId }),

      // Groups (Phase 3). Payloads are ids only, so refetch the conversation for fresh members.
      group_member_added: ({ conversationId }) => handlersRef.current.fetchConversation(conversationId),
      group_member_removed: ({ conversationId, userId }) => {
        if (userId === myId) {
          handlersRef.current.onRemovedFromGroup?.(conversationId);
          dispatch({ type: 'CONVERSATION_REMOVE', conversationId });
        } else {
          handlersRef.current.fetchConversation(conversationId);
        }
      },
      // PROPOSED event: lets every member see a renamed group or new group picture at once.
      conversation_updated: ({ conversation }) => conversation && dispatch({ type: 'CONVERSATION_UPSERT', conversation }),
    };

    Object.entries(on).forEach(([event, fn]) => socket.on(event, fn));
    if (socket.connected) on.connect();

    return () => {
      typingTimers.forEach(clearTimeout);
      Object.entries(on).forEach(([event, fn]) => socket.off(event, fn));
      disconnectSocket();
    };
  }, [token, myId, dispatch]);

  return connection;
}

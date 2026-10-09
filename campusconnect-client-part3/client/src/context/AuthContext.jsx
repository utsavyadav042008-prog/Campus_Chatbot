import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, setUnauthorizedHandler } from '../lib/api.js';
import { TOKEN_KEY, tokenStore } from '../lib/storage.js';

const AuthContext = createContext(null);

// status: 'checking' (validating a saved token) | 'authed' | 'guest' | 'error' (server unreachable)
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(() => (tokenStore.get() ? 'checking' : 'guest'));

  const clearSession = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setStatus('guest');
  }, []);

  const startSession = useCallback(({ token, user: nextUser }) => {
    tokenStore.set(token);
    setUser(nextUser);
    setStatus('authed');
    return nextUser;
  }, []);

  const checkSession = useCallback(async () => {
    if (!tokenStore.get()) {
      setStatus('guest');
      return;
    }
    setStatus('checking');
    try {
      const { user: me } = await authApi.me();
      setUser(me);
      setStatus('authed');
    } catch (error) {
      if (error.response?.status === 401) clearSession();
      else setStatus('error');
    }
  }, [clearSession]);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Logging out (or in) in one tab updates every other open tab.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== TOKEN_KEY) return;
      if (event.newValue) checkSession();
      else clearSession();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [checkSession, clearSession]);

  const login = useCallback(
    async (credentials) => startSession(await authApi.login(credentials)),
    [startSession],
  );

  const register = useCallback(
    async (details) => startSession(await authApi.register(details)),
    [startSession],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* the token is discarded either way */
    }
    clearSession();
  }, [clearSession]);

  const updateUser = useCallback((patch) => {
    setUser((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const value = useMemo(
    () => ({ user, status, isAuthed: status === 'authed', login, register, logout, updateUser, retry: checkSession }),
    [user, status, login, register, logout, updateUser, checkSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setSessionExpiredHandler } from '../services/api';
import { authService } from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const navigate = useNavigate();

  // Restore the session from the httpOnly refresh cookie on page load.
  useEffect(() => {
    let active = true;
    authService
      .restore()
      .then((u) => active && setUser(u))
      .catch(() => active && setUser(null))
      .finally(() => active && setInitializing(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
      navigate('/login', { replace: true, state: { expired: true } });
    });
  }, [navigate]);

  const login = useCallback(async (username, password) => {
    const u = await authService.login(username, password);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  const value = useMemo(() => ({ user, setUser, initializing, login, logout }), [user, initializing, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

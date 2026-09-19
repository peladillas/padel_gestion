import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { authService } from '../services/api';

const AuthContext = createContext(null);
const INACTIVITY_LIMIT = 30 * 60 * 1000; // 30 min

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);

  const logout = useCallback(() => {
    localStorage.removeItem('bp_token');
    localStorage.removeItem('bp_user');
    setUser(null);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      logout();
      window.location.href = '/login?reason=inactivity';
    }, INACTIVITY_LIMIT);
  }, [logout]);

  useEffect(() => {
    const stored = localStorage.getItem('bp_user');
    const token  = localStorage.getItem('bp_token');
    if (stored && token) {
      setUser(JSON.parse(stored));
      resetTimer();
    }
    setLoading(false);
  }, []);

  // Track user activity
  useEffect(() => {
    if (!user) return;
    const events = ['mousedown','keydown','touchstart','scroll','click'];
    const handler = () => resetTimer();
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    resetTimer();
    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [user, resetTimer]);

  const login = async (email, password) => {
    const res = await authService.login({ email, password });
    localStorage.setItem('bp_token', res.data.token);
    localStorage.setItem('bp_user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    resetTimer();
    return res.data;
  };

  const loginWithSession = (token, userData) => {
    localStorage.setItem('bp_token', token);
    localStorage.setItem('bp_user', JSON.stringify(userData));
    setUser(userData);
    resetTimer();
  };

  const isAdmin      = () => ['ADMIN', 'SUPER_ADMIN'].includes(user?.role);
  const isSuperAdmin = () => user?.role === 'SUPER_ADMIN';

  const updateUser = useCallback((patch) => {
    setUser(prev => {
      const updated = { ...prev, ...patch };
      localStorage.setItem('bp_user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithSession, logout, isAdmin, isSuperAdmin, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

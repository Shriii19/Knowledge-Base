import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { browserLocalPersistence, onIdTokenChanged, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../services/firebase';
import { api } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [disabled, setDisabled] = useState(false);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const current = ++requestId.current;
    if (!auth.currentUser) {
      setUser(null);
      setError('');
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get('/auth/me');
      if (current === requestId.current) {
        setUser(data.user);
        setDisabled(false);
        setError('');
      }
    } catch (failure) {
      if (current === requestId.current) {
        setUser(null);
        setDisabled(failure.response?.data?.code === 'ACCOUNT_DISABLED');
        setError(!failure.response || failure.response.status >= 500 ? 'Unable to reach the authentication service. Try again.' : '');
      }
      throw failure;
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => onIdTokenChanged(auth, () => {
    if (auth.currentUser) setLoading(true);
    refresh().catch(() => {});
  }), [refresh]);

  useEffect(() => {
    const interceptor = api.interceptors.response.use(undefined, (failure) => {
      if (failure.response?.data?.code === 'ACCOUNT_DISABLED') {
        setUser(null);
        setDisabled(true);
      } else if (failure.response?.status === 401) {
        setUser(null);
      }
      return Promise.reject(failure);
    });
    return () => api.interceptors.response.eject(interceptor);
  }, []);

  async function login(email, password) {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithEmailAndPassword(auth, email, password);
    try {
      await refresh();
    } catch (failure) {
      await signOut(auth);
      throw failure;
    }
  }
  async function logout() {
    await signOut(auth);
    setUser(null);
    setDisabled(false);
  }
  async function resetPassword(email) {
    await sendPasswordResetEmail(auth, email);
  }
  return <AuthContext.Provider value={{ user, loading, error, disabled, refresh, login, logout, resetPassword }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

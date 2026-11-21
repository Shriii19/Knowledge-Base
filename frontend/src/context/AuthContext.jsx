import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [disabled, setDisabled] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
      setDisabled(false);
      setError('');
    } catch (failure) {
      setUser(null);
      setDisabled(failure.response?.data?.code === 'ACCOUNT_DISABLED');
      setError(!failure.response || failure.response.status >= 500 ? 'Unable to reach the authentication service. Try again.' : '');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const interceptor = api.interceptors.response.use(undefined, (failure) => {
      if (failure.config?.url !== '/auth/login') {
        if (failure.response?.data?.code === 'ACCOUNT_DISABLED') {
          setUser(null);
          setDisabled(true);
        } else if (failure.response?.status === 401) {
          setUser(null);
        }
      }
      return Promise.reject(failure);
    });
    return () => api.interceptors.response.eject(interceptor);
  }, []);

  async function login(email, password) {
    await api.post('/auth/login', { email, password });
    const { data } = await api.get('/auth/me');
    setUser(data.user);
    setDisabled(false);
    setError('');
  }
  async function logout() {
    await api.post('/auth/logout');
    setUser(null);
  }
  return <AuthContext.Provider value={{ user, setUser, loading, error, disabled, refresh, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

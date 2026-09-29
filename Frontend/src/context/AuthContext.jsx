import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as authApi from '../api/auth';
import { setOnUnauthorized } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true while we attempt the silent refresh on first load

  // If any API call's automatic refresh-on-401 ultimately fails (refresh
  // cookie missing/expired/revoked), drop the user back to a logged-out
  // state so the UI reacts immediately instead of showing stale data.
  useEffect(() => {
    setOnUnauthorized(() => setUser(null));
  }, []);

  // On first load (including a hard page refresh, where our in-memory
  // access token is gone) try to silently exchange the httpOnly refresh
  // cookie for a new access token, so the person doesn't have to log in
  // again every time they reload the page.
  useEffect(() => {
    let cancelled = false;
    authApi
      .refresh()
      .then((freshUser) => {
        if (!cancelled) setUser(freshUser);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username, password) => {
    const loggedInUser = await authApi.login(username, password);
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => {});
    setUser(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    const fresh = await authApi.me();
    setUser((prev) => ({ ...prev, ...fresh }));
    return fresh;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

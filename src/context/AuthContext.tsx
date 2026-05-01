/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserSession } from '../types';
import { getSession, clearSession, saveSession } from '../lib/auth';

interface AuthContextType {
  user: UserSession | null;
  login: (session: UserSession) => void;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(() => getSession());
  const [loading, setLoading] = useState(() => {
    // If we have a session in localStorage, we consider the basic auth "loaded"
    // This prevents flickering on mount.
    return !getSession();
  });

  useEffect(() => {
    // Keep it here in case getSession() logic needs to run on mount
    // or if we add more complex validation later.
    const session = getSession();
    if (session) {
      setUser(session);
    }
    setLoading(false);
  }, []);

  const login = (session: UserSession) => {
    saveSession(session);
    setUser(session);
  };

  const logout = () => {
    clearSession();
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}

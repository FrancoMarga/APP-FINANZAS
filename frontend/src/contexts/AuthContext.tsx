import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { storage } from '@/src/utils/storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL + '/api';
const TOKEN_KEY = 'session_token';

interface User {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  token: string | null;
  processSessionId: (sessionId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const processSessionId = async (sessionId: string) => {
    try {
      const response = await fetch(`${API_URL}/auth/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (response.ok) {
        const data = await response.json();
        await storage.setItem(TOKEN_KEY, data.session_token);
        setToken(data.session_token);
        setUser(data.user);
      }
    } catch (error) {
      console.error('Session processing failed:', error);
    }
  };

  useEffect(() => {
    const init = async () => {
      // Handle web URL fragment first
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const hash = window.location.hash;
        const search = window.location.search;
        const hashMatch = hash.match(/session_id=([^&]+)/);
        const searchMatch = search.match(/session_id=([^&]+)/);
        const sessionId = hashMatch?.[1] || searchMatch?.[1];
        if (sessionId) {
          await processSessionId(sessionId);
          window.history.replaceState(null, '', window.location.pathname);
          setLoading(false);
          return;
        }
      }

      // Check existing session
      try {
        const savedToken = await storage.getItem(TOKEN_KEY);
        if (savedToken) {
          const response = await fetch(`${API_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${savedToken}` },
          });
          if (response.ok) {
            const userData = await response.json();
            setUser(userData);
            setToken(savedToken);
          } else {
            await storage.removeItem(TOKEN_KEY);
          }
        }
      } catch (error) {
        console.error('Session check failed:', error);
      } finally {
        setLoading(false);
      }
    };

    init();

    // Mobile: cold start deep link
    if (Platform.OS !== 'web') {
      Linking.getInitialURL().then((url) => {
        if (url) {
          const match = url.match(/session_id=([^&]+)/);
          if (match) processSessionId(match[1]);
        }
      });

      const sub = Linking.addEventListener('url', ({ url }) => {
        const match = url.match(/session_id=([^&]+)/);
        if (match) processSessionId(match[1]);
      });
      return () => sub.remove();
    }
  }, []);

  const login = async () => {
    const redirectUrl =
      Platform.OS === 'web'
        ? window.location.origin + '/'
        : Linking.createURL('');
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

    if (Platform.OS === 'web') {
      window.location.href = authUrl;
    } else {
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      if (result.type === 'success' && result.url) {
        const match = result.url.match(/session_id=([^&]+)/);
        if (match) await processSessionId(match[1]);
      }
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch (e) {
      console.error('Logout error:', e);
    }
    await storage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, token, processSessionId }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

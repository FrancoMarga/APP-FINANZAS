import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import {
  GoogleSignin,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';
import { storage } from '@/src/utils/storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL + '/api';
const TOKEN_KEY = 'session_token';

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';

GoogleSignin.configure({
  webClientId: GOOGLE_WEB_CLIENT_ID,
  offlineAccess: false,
});

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
  devLogin: () => Promise<void>;
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
    if (!GOOGLE_WEB_CLIENT_ID) {
      console.error('Falta configurar EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID en .env');
      return;
    }

    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();

      if (!isSuccessResponse(response)) {
        console.log('Login cancelado por el usuario');
        return;
      }

      const idToken = response.data.idToken;
      if (!idToken) {
        console.error('Google no devolvió idToken');
        return;
      }

      const backendResponse = await fetch(`${API_URL}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken }),
      });

      if (backendResponse.ok) {
        const data = await backendResponse.json();
        await storage.setItem(TOKEN_KEY, data.session_token);
        setToken(data.session_token);
        setUser(data.user);
      } else {
        console.error('Google login falló en el backend:', await backendResponse.text());
      }
    } catch (error: any) {
      console.error('Google login failed:', error);
    }
  };

  // ⚠️ SOLO DESARROLLO — login sin Google, solo funciona si el backend
  // tiene DEV_MODE=true seteado (si no, el backend devuelve 404).
  // BORRAR esta función y su botón en login.tsx antes de compartir el APK.
  const devLogin = async () => {
    try {
      const response = await fetch(`${API_URL}/auth/dev-login`, { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        await storage.setItem(TOKEN_KEY, data.session_token);
        setToken(data.session_token);
        setUser(data.user);
      } else {
        console.error('Dev login no disponible (¿DEV_MODE no está activo en el backend?)');
      }
    } catch (error) {
      console.error('Dev login failed:', error);
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
      await GoogleSignin.signOut();
    } catch (e) {
      console.error('Logout error:', e);
    }
    await storage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, token, processSessionId, devLogin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

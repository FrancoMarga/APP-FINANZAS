import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState, useRef } from 'react';
import { LogBox, View, ActivityIndicator, StatusBar, AppState, AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useIconFonts } from '@/src/hooks/use-icon-fonts';
import { AuthProvider, useAuth } from '@/src/contexts/AuthContext';
import { setTokenGetter } from '@/src/services/api';
import { colors } from '@/src/theme/colors';
import { getHasPin } from '@/src/utils/appLock';
import AppLockScreen from '@/src/components/AppLockScreen';

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

function InnerNav() {
  const { user, loading, token } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Bloqueo por PIN: se activa al abrir la app (si hay PIN configurado) y
  // al volver de segundo plano SOLO si pasaron más de 15 minutos ahí — así
  // no te pide el PIN cada vez que salís un segundo a otra app.
  const LOCK_TIMEOUT_MS = 15 * 60 * 1000;
  const [isLocked, setIsLocked] = useState(false);
  const [lockChecked, setLockChecked] = useState(false);
  const appState = useRef(AppState.currentState);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      const hasPin = await getHasPin();
      setIsLocked(hasPin);
      setLockChecked(true);
    })();

    const sub = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      const wasActive = appState.current === 'active';
      const goingBackground = nextState.match(/inactive|background/);
      const cameBackActive = appState.current.match(/inactive|background/) && nextState === 'active';

      if (wasActive && goingBackground) {
        backgroundedAt.current = Date.now();
      }

      if (cameBackActive) {
        const hasPin = await getHasPin();
        if (hasPin) {
          const elapsed = backgroundedAt.current ? Date.now() - backgroundedAt.current : Infinity;
          if (elapsed > LOCK_TIMEOUT_MS) setIsLocked(true);
        }
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);

  // Wire token getter for API service
  useEffect(() => {
    setTokenGetter(() => token);
  }, [token]);

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === 'login';

    if (!user && !inAuthGroup) {
      router.replace('/login');
    } else if (user && inAuthGroup) {
      router.replace('/');
    }
  }, [user, loading, segments]);

  if (loading || !lockChecked) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" />
        <Stack.Screen name="categories" options={{ presentation: 'modal' }} />
        <Stack.Screen name="savings-goals" options={{ presentation: 'card' }} />
        <Stack.Screen name="loans" options={{ presentation: 'card' }} />
        <Stack.Screen name="settings" options={{ presentation: 'card' }} />
      </Stack>
      {user && isLocked && <AppLockScreen onUnlock={() => setIsLocked(false)} />}
    </>
  );
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <AuthProvider>
        <InnerNav />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

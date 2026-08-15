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
  // cada vez que vuelve de segundo plano. Es una capa local en el celular,
  // no afecta a la sesión de Google ni al backend.
  const [isLocked, setIsLocked] = useState(false);
  const [lockChecked, setLockChecked] = useState(false);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    (async () => {
      const hasPin = await getHasPin();
      setIsLocked(hasPin);
      setLockChecked(true);
    })();

    const sub = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        const hasPin = await getHasPin();
        if (hasPin) setIsLocked(true);
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

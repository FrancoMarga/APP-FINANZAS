import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { LogBox, View, ActivityIndicator, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useIconFonts } from '@/src/hooks/use-icon-fonts';
import { AuthProvider, useAuth } from '@/src/contexts/AuthContext';
import { setTokenGetter } from '@/src/services/api';
import { colors } from '@/src/theme/colors';

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

function InnerNav() {
  const { user, loading, token } = useAuth();
  const segments = useSegments();
  const router = useRouter();

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

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" />
      <Stack.Screen name="categories" options={{ presentation: 'modal' }} />
      <Stack.Screen name="settings" options={{ presentation: 'card' }} />
    </Stack>
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

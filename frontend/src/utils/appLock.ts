import * as SecureStore from 'expo-secure-store';

const PIN_KEY = 'app_lock_pin';
const BIOMETRIC_KEY = 'app_lock_biometric_enabled';

export async function getHasPin(): Promise<boolean> {
  const pin = await SecureStore.getItemAsync(PIN_KEY);
  return !!pin;
}

export async function setAppPin(pin: string): Promise<void> {
  await SecureStore.setItemAsync(PIN_KEY, pin);
}

export async function removeAppPin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_KEY);
  await SecureStore.deleteItemAsync(BIOMETRIC_KEY);
}

export async function verifyAppPin(pin: string): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(PIN_KEY);
  return stored !== null && stored === pin;
}

export async function getBiometricEnabled(): Promise<boolean> {
  const v = await SecureStore.getItemAsync(BIOMETRIC_KEY);
  return v === 'true';
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(BIOMETRIC_KEY, enabled ? 'true' : 'false');
}

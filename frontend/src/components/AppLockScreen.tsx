import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { colors, spacing, radius, fontSize } from '@/src/theme/colors';
import { verifyAppPin, getBiometricEnabled } from '@/src/utils/appLock';

interface Props {
  onUnlock: () => void;
}

export default function AppLockScreen({ onUnlock }: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const triedOnce = useRef(false);

  useEffect(() => {
    (async () => {
      const bioEnabled = await getBiometricEnabled();
      setBiometricAvailable(bioEnabled);
      if (bioEnabled && !triedOnce.current) {
        triedOnce.current = true;
        tryBiometric();
      }
    })();
  }, []);

  const tryBiometric = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Desbloqueá Mi Economía',
        cancelLabel: 'Usar PIN',
        disableDeviceFallback: false,
      });
      if (result.success) onUnlock();
    } catch {
      // El usuario canceló o no hay biometría configurada — sigue con el PIN
    }
  };

  const handleDigit = async (d: string) => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError(false);
    if (next.length === 4) {
      const ok = await verifyAppPin(next);
      if (ok) {
        onUnlock();
      } else {
        setError(true);
        setTimeout(() => { setPin(''); setError(false); }, 500);
      }
    }
  };

  const handleDelete = () => setPin((p) => p.slice(0, -1));

  return (
    <View style={styles.overlay}>
      <View style={styles.iconWrap}>
        <Ionicons name="lock-closed" size={36} color={colors.primary} />
      </View>
      <Text style={styles.title}>Ingresá tu PIN</Text>

      <View style={styles.dotsRow}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.dot, pin.length > i && styles.dotFilled, error && styles.dotError]} />
        ))}
      </View>
      <Text style={styles.errorText}>{error ? 'PIN incorrecto' : ' '}</Text>

      <View style={styles.keypad}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <TouchableOpacity key={d} style={styles.key} onPress={() => handleDigit(d)} testID={`pin-key-${d}`}>
            <Text style={styles.keyText}>{d}</Text>
          </TouchableOpacity>
        ))}
        {biometricAvailable ? (
          <TouchableOpacity style={styles.key} onPress={tryBiometric} testID="pin-key-biometric">
            <Ionicons name="finger-print" size={26} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.key} />
        )}
        <TouchableOpacity style={styles.key} onPress={() => handleDigit('0')} testID="pin-key-0">
          <Text style={styles.keyText}>0</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.key} onPress={handleDelete} testID="pin-key-delete">
          <Ionicons name="backspace-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  iconWrap: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(212,245,66,0.15)',
    justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg,
  },
  title: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing.lg },
  dotsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colors.border },
  dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotError: { borderColor: colors.danger, backgroundColor: colors.danger },
  errorText: { color: colors.danger, fontSize: fontSize.sm, marginTop: spacing.sm, height: 18 },
  keypad: {
    flexDirection: 'row', flexWrap: 'wrap', width: 260, justifyContent: 'space-between',
    marginTop: spacing.xl,
  },
  key: {
    width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center',
    marginBottom: spacing.md, backgroundColor: colors.bgElevated,
  },
  keyText: { color: colors.text, fontSize: 26, fontWeight: '600' },
});

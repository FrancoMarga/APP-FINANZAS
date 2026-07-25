import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/src/contexts/AuthContext';
import { colors, spacing, radius, fontSize } from '@/src/theme/colors';

export default function LoginScreen() {
  const { login } = useAuth();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <View style={styles.logoCircle}>
            <Ionicons name="wallet" size={64} color={colors.textOnPrimary} />
          </View>
          <Text style={styles.title} testID="app-title">Mi Economía</Text>
          <Text style={styles.subtitle}>
            Controlá tus gastos, ahorros e inversiones{'\n'}en un solo lugar
          </Text>
        </View>

        <View style={styles.features}>
          <Feature icon="lock-closed" text="Datos cifrados en la nube" />
          <Feature icon="sync" text="Sincronización automática" />
          <Feature icon="trending-up" text="Precios de cryptos en tiempo real" />
          <Feature icon="analytics" text="Reportes y análisis avanzados" />
        </View>

        <TouchableOpacity
          style={styles.googleButton}
          onPress={login}
          testID="google-login-button"
          activeOpacity={0.8}
        >
          <Ionicons name="logo-google" size={22} color={colors.textOnPrimary} />
          <Text style={styles.googleButtonText}>Continuar con Google</Text>
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          Al continuar aceptás nuestros términos.{'\n'}
          Tus datos están cifrados en reposo con AES.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function Feature({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.feature}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    justifyContent: 'space-between',
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  logoCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  title: {
    fontSize: fontSize.display,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  features: {
    gap: spacing.md,
    marginVertical: spacing.xl,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    gap: spacing.sm,
  },
  googleButtonText: {
    color: colors.textOnPrimary,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  disclaimer: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 16,
  },
});

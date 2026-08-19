import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Modal, ActivityIndicator, Platform, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuth } from '@/src/contexts/AuthContext';
import { api } from '@/src/services/api';
import { colors, spacing, radius, fontSize } from '@/src/theme/colors';
import Toast from '@/src/components/Toast';
import { useToast } from '@/src/hooks/useToast';
import {
  getHasPin, setAppPin, removeAppPin, verifyAppPin,
  getBiometricEnabled, setBiometricEnabled,
} from '@/src/utils/appLock';

export default function Settings() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  // Bloqueo por PIN
  const [hasPin, setHasPin] = useState(false);
  const [biometricOn, setBiometricOn] = useState(false);
  const [biometricHardwareAvailable, setBiometricHardwareAvailable] = useState(false);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinStep, setPinStep] = useState<'current' | 'new' | 'confirm'>('new');
  const [pinInput, setPinInput] = useState('');
  const [firstNewPin, setFirstNewPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [removePinModalVisible, setRemovePinModalVisible] = useState(false);
  const [removePinInput, setRemovePinInput] = useState('');

  useEffect(() => {
    (async () => {
      setHasPin(await getHasPin());
      setBiometricOn(await getBiometricEnabled());
      const hw = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricHardwareAvailable(hw && enrolled);
    })();
  }, []);

  const openSetPin = () => {
    setPinStep('new'); setPinInput(''); setFirstNewPin(''); setPinError('');
    setPinModalVisible(true);
  };

  const handlePinDigit = async (d: string) => {
    if (pinInput.length >= 4) return;
    const next = pinInput + d;
    setPinInput(next);
    setPinError('');
    if (next.length !== 4) return;

    if (pinStep === 'new') {
      setFirstNewPin(next);
      setPinInput('');
      setPinStep('confirm');
    } else if (pinStep === 'confirm') {
      if (next === firstNewPin) {
        await setAppPin(next);
        setHasPin(true);
        setPinModalVisible(false);
        toast.show('PIN configurado', 'success');
      } else {
        setPinError('Los PIN no coinciden, probá de nuevo');
        setPinInput(''); setFirstNewPin(''); setPinStep('new');
      }
    }
  };

  const handleRemovePinDigit = async (d: string) => {
    if (removePinInput.length >= 4) return;
    const next = removePinInput + d;
    setRemovePinInput(next);
    if (next.length !== 4) return;
    const ok = await verifyAppPin(next);
    if (ok) {
      await removeAppPin();
      setHasPin(false);
      setBiometricOn(false);
      setRemovePinModalVisible(false);
      setRemovePinInput('');
      toast.show('Bloqueo desactivado', 'success');
    } else {
      toast.show('PIN incorrecto', 'error');
      setRemovePinInput('');
    }
  };

  const toggleBiometric = async () => {
    const next = !biometricOn;
    await setBiometricEnabled(next);
    setBiometricOn(next);
  };

  const handleBackup = async () => {
    setExporting(true);
    try {
      const result = await api.exportBackup();
      const filename = `mi-economia-backup-${new Date().toISOString().slice(0, 10)}.emgbak`;

      if (Platform.OS === 'web') {
        // Web: trigger download
        const blob = new Blob([result.encrypted_backup], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        toast.show('Backup descargado (cifrado)', 'success');
      } else {
        const uri = FileSystem.cacheDirectory + filename;
        await FileSystem.writeAsStringAsync(uri, result.encrypted_backup);
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: 'application/octet-stream', dialogTitle: 'Guardar backup cifrado' });
        }
        toast.show(`${result.counts.transactions} movimientos exportados`, 'success');
      }
    } catch (e) {
      console.error(e);
      toast.show('Error al exportar', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={toast.hide} duration={toast.duration} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="settings-back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Configuración</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Profile */}
        <View style={styles.profile}>
          {user?.picture ? (
            <Image source={{ uri: user.picture }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Ionicons name="person" size={32} color={colors.textOnPrimary} />
            </View>
          )}
          <Text style={styles.profileName}>{user?.name}</Text>
          <Text style={styles.profileEmail}>{user?.email}</Text>
          <View style={styles.securityBadge}>
            <Ionicons name="shield-checkmark" size={14} color={colors.success} />
            <Text style={styles.securityText}>Datos cifrados en la nube</Text>
          </View>
        </View>

        {/* Sections */}
        <Text style={styles.sectionTitle}>Gestión</Text>
        <View style={styles.group}>
          <SettingItem
            icon="pricetags"
            label="Categorías"
            hint="Ver, crear, editar y eliminar"
            onPress={() => router.push('/categories')}
            testID="settings-categories"
          />
          <SettingItem
            icon="people"
            label="Préstamos"
            hint="Plata prestada a personas"
            onPress={() => router.push('/loans')}
            testID="settings-loans"
          />
        </View>

        <Text style={styles.sectionTitle}>Seguridad</Text>
        <View style={styles.group}>
          <SettingItem
            icon="keypad"
            label={hasPin ? 'Cambiar PIN' : 'Activar bloqueo con PIN'}
            hint={hasPin ? 'Ya configurado' : 'Pedí un código de 4 dígitos al abrir la app'}
            onPress={openSetPin}
            testID="settings-set-pin"
          />
          {hasPin && (
            <SettingItem
              icon="lock-open-outline"
              label="Desactivar bloqueo"
              hint="Vas a necesitar tu PIN actual"
              onPress={() => { setRemovePinInput(''); setRemovePinModalVisible(true); }}
              testID="settings-remove-pin"
            />
          )}
          {hasPin && biometricHardwareAvailable && (
            <TouchableOpacity style={styles.item} onPress={toggleBiometric} testID="settings-toggle-biometric">
              <View style={styles.itemIcon}>
                <Ionicons name="finger-print" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemLabel}>Huella / Face ID</Text>
                <Text style={styles.itemHint}>{biometricOn ? 'Activado' : 'Desactivado'}</Text>
              </View>
              <View style={[styles.switchTrack, biometricOn && styles.switchTrackOn]}>
                <View style={[styles.switchThumb, biometricOn && styles.switchThumbOn]} />
              </View>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.sectionTitle}>Datos</Text>
        <View style={styles.group}>
          <SettingItem
            icon="cloud-download"
            label="Exportar Backup Cifrado"
            hint="Guardá una copia de seguridad"
            onPress={handleBackup}
            loading={exporting}
            testID="settings-backup"
          />
          <View style={styles.divider} />
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={16} color={colors.info} />
            <Text style={styles.infoText}>
              Tus datos ya están sincronizados en la nube automáticamente.
              Al iniciar sesión en otro dispositivo, se restauran solos.
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Cuenta</Text>
        <View style={styles.group}>
          <SettingItem
            icon="log-out"
            label="Cerrar Sesión"
            danger
            onPress={() => setConfirmLogout(true)}
            testID="settings-logout"
          />
        </View>

        <Text style={styles.footer}>Mi Economía v1.0 · Cifrado AES-256</Text>
      </ScrollView>

      {/* Logout confirmation */}
      <Modal visible={confirmLogout} transparent animationType="fade" onRequestClose={() => setConfirmLogout(false)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>¿Cerrar sesión?</Text>
            <Text style={styles.confirmText}>Tus datos siguen guardados y seguros en tu cuenta de Google.</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity style={styles.confirmCancel} onPress={() => setConfirmLogout(false)}>
                <Text style={styles.confirmCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmYes}
                onPress={async () => { setConfirmLogout(false); await logout(); }}
                testID="confirm-logout"
              >
                <Text style={styles.confirmYesText}>Cerrar Sesión</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Configurar / cambiar PIN */}
      <Modal visible={pinModalVisible} transparent animationType="fade" onRequestClose={() => setPinModalVisible(false)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.pinBox}>
            <TouchableOpacity style={styles.pinClose} onPress={() => setPinModalVisible(false)} testID="close-pin-modal">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            <Ionicons name="keypad" size={32} color={colors.primary} style={{ marginBottom: spacing.sm }} />
            <Text style={styles.confirmTitle}>
              {pinStep === 'new' ? 'Elegí un PIN de 4 dígitos' : 'Repetilo para confirmar'}
            </Text>
            <View style={styles.pinDotsRow}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={[styles.pinDot, pinInput.length > i && styles.pinDotFilled]} />
              ))}
            </View>
            {!!pinError && <Text style={styles.pinErrorText}>{pinError}</Text>}
            <View style={styles.pinKeypad}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <TouchableOpacity key={d} style={styles.pinKey} onPress={() => handlePinDigit(d)}>
                  <Text style={styles.pinKeyText}>{d}</Text>
                </TouchableOpacity>
              ))}
              <View style={styles.pinKey} />
              <TouchableOpacity style={styles.pinKey} onPress={() => handlePinDigit('0')}>
                <Text style={styles.pinKeyText}>0</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pinKey} onPress={() => setPinInput((p) => p.slice(0, -1))}>
                <Ionicons name="backspace-outline" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Desactivar bloqueo (pide el PIN actual) */}
      <Modal visible={removePinModalVisible} transparent animationType="fade" onRequestClose={() => setRemovePinModalVisible(false)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.pinBox}>
            <TouchableOpacity style={styles.pinClose} onPress={() => setRemovePinModalVisible(false)} testID="close-remove-pin-modal">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            <Ionicons name="lock-open-outline" size={32} color={colors.danger} style={{ marginBottom: spacing.sm }} />
            <Text style={styles.confirmTitle}>Ingresá tu PIN para desactivar</Text>
            <View style={styles.pinDotsRow}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={[styles.pinDot, removePinInput.length > i && styles.pinDotFilled]} />
              ))}
            </View>
            <View style={styles.pinKeypad}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <TouchableOpacity key={d} style={styles.pinKey} onPress={() => handleRemovePinDigit(d)}>
                  <Text style={styles.pinKeyText}>{d}</Text>
                </TouchableOpacity>
              ))}
              <View style={styles.pinKey} />
              <TouchableOpacity style={styles.pinKey} onPress={() => handleRemovePinDigit('0')}>
                <Text style={styles.pinKeyText}>0</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pinKey} onPress={() => setRemovePinInput((p) => p.slice(0, -1))}>
                <Ionicons name="backspace-outline" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SettingItem({ icon, label, hint, onPress, loading, danger, testID }: any) {
  return (
    <TouchableOpacity style={styles.item} onPress={onPress} disabled={loading} testID={testID}>
      <View style={[styles.itemIcon, danger && { backgroundColor: 'rgba(248,113,113,0.15)' }]}>
        <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.itemLabel, danger && { color: colors.danger }]}>{label}</Text>
        {hint && <Text style={styles.itemHint}>{hint}</Text>}
      </View>
      {loading ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md, paddingBottom: 40 },
  profile: {
    alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: radius.lg,
    padding: spacing.lg, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  avatar: { width: 80, height: 80, borderRadius: 40, marginBottom: spacing.md },
  avatarPlaceholder: { backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  profileName: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  profileEmail: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 },
  securityBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(74,222,128,0.1)', paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full, marginTop: spacing.md,
  },
  securityText: { color: colors.success, fontSize: fontSize.xs, fontWeight: '600' },
  sectionTitle: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase', marginBottom: spacing.sm, marginTop: spacing.md, marginLeft: spacing.sm, letterSpacing: 1 },
  group: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.md },
  itemIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(212,245,66,0.15)', justifyContent: 'center', alignItems: 'center' },
  itemLabel: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  itemHint: { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.border },
  infoBox: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, alignItems: 'flex-start' },
  infoText: { flex: 1, color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 18 },
  footer: { color: colors.textMuted, fontSize: fontSize.xs, textAlign: 'center', marginTop: spacing.xl },
  confirmOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  confirmBox: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.lg, width: '100%', maxWidth: 340, borderWidth: 1, borderColor: colors.border },
  confirmTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700', marginBottom: spacing.sm },
  confirmText: { color: colors.textSecondary, fontSize: fontSize.sm, marginBottom: spacing.lg, lineHeight: 20 },
  confirmActions: { flexDirection: 'row', gap: spacing.sm },
  confirmCancel: { flex: 1, backgroundColor: colors.bgElevated, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  confirmCancelText: { color: colors.text, fontWeight: '600' },
  confirmYes: { flex: 1, backgroundColor: colors.danger, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  confirmYesText: { color: '#fff', fontWeight: '700' },

  // Switch de biometría
  switchTrack: {
    width: 44, height: 26, borderRadius: 13, backgroundColor: colors.bgElevated,
    borderWidth: 1, borderColor: colors.border, justifyContent: 'center', padding: 2,
  },
  switchTrackOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textSecondary },
  switchThumbOn: { backgroundColor: colors.textOnPrimary, alignSelf: 'flex-end' },

  // Modales de PIN
  pinBox: {
    backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.lg,
    width: '100%', maxWidth: 320, borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  pinClose: { position: 'absolute', top: spacing.md, right: spacing.md },
  pinDotsRow: { flexDirection: 'row', gap: spacing.md, marginVertical: spacing.md },
  pinDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border },
  pinDotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  pinErrorText: { color: colors.danger, fontSize: fontSize.xs, marginBottom: spacing.sm },
  pinKeypad: { flexDirection: 'row', flexWrap: 'wrap', width: 220, justifyContent: 'space-between', marginTop: spacing.sm },
  pinKey: {
    width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center',
    marginBottom: spacing.sm, backgroundColor: colors.bgElevated,
  },
  pinKeyText: { color: colors.text, fontSize: 22, fontWeight: '600' },
});

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Modal, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { useAuth } from '@/src/contexts/AuthContext';
import { api } from '@/src/services/api';
import { colors, spacing, radius, fontSize } from '@/src/theme/colors';
import Toast from '@/src/components/Toast';
import { useToast } from '@/src/hooks/useToast';

export default function Settings() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

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
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={toast.hide} />

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
});

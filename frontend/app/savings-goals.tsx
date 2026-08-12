import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { api } from '@/src/services/api';
import { useAuth } from '@/src/contexts/AuthContext';
import { colors, spacing, radius, fontSize } from '@/src/theme/colors';
import Toast from '@/src/components/Toast';
import { useToast } from '@/src/hooks/useToast';
import { useHideAmounts, maskAmount } from '@/src/hooks/useHideAmounts';
import { formatMoneyInput, parseMoneyInput } from '@/src/utils/currency';

const GOAL_COLORS = ['#4ADE80', '#60A5FA', '#A78BFA', '#F472B6', '#FBBF24', '#F87171', '#818CF8', '#FB923C'];
const GOAL_ICONS = ['flag', 'airplane', 'home', 'car', 'gift', 'school', 'heart', 'star', 'umbrella', 'laptop'];

export default function SavingsGoalsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { token } = useAuth();
  const { hidden: hideAmounts } = useHideAmounts();

  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedGoal, setSelectedGoal] = useState<any>(null);
  const [contributions, setContributions] = useState<any[]>([]);
  const [contribLoading, setContribLoading] = useState(false);

  // Modal: alta/edición de meta
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalColor, setGoalColor] = useState(GOAL_COLORS[0]);
  const [goalIcon, setGoalIcon] = useState(GOAL_ICONS[0]);
  const [goalDeadline, setGoalDeadline] = useState<Date | null>(null);
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);
  const [goalPhoto, setGoalPhoto] = useState<string | null>(null);

  // Modal: aporte
  const [contribModalVisible, setContribModalVisible] = useState(false);
  const [contribAmount, setContribAmount] = useState('');
  const [contribNote, setContribNote] = useState('');
  const [contribIsWithdraw, setContribIsWithdraw] = useState(false);

  const fmt = (n: number) => {
    const formatted = `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return hideAmounts ? maskAmount(formatted) : formatted;
  };

  const loadGoals = async () => {
    if (!token) return;
    try {
      const data = await api.getSavingsGoals();
      setGoals(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadGoals(); }, [token]);

  const loadContributions = async (goalId: string) => {
    setContribLoading(true);
    try {
      const data = await api.getGoalContributions(goalId);
      setContributions(data);
    } catch (e) {
      toast.show('Error al cargar los aportes', 'error');
    } finally {
      setContribLoading(false);
    }
  };

  const openGoal = (goal: any) => {
    setSelectedGoal(goal);
    loadContributions(goal.id);
  };

  const refreshSelectedGoal = async () => {
    const data = await api.getSavingsGoals();
    setGoals(data);
    if (selectedGoal) {
      const updated = data.find((g: any) => g.id === selectedGoal.id);
      if (updated) setSelectedGoal(updated);
    }
  };

  // ---------- Meta: alta / edición ----------
  const openNewGoal = () => {
    setEditingGoalId(null);
    setGoalName(''); setGoalTarget(''); setGoalColor(GOAL_COLORS[0]);
    setGoalIcon(GOAL_ICONS[0]); setGoalDeadline(null); setGoalPhoto(null);
    setGoalModalVisible(true);
  };

  const openEditGoal = (goal: any) => {
    setEditingGoalId(goal.id);
    setGoalName(goal.name);
    setGoalTarget(formatMoneyInput(String(Math.round(goal.target_amount))));
    setGoalColor(goal.color); setGoalIcon(goal.icon);
    setGoalDeadline(goal.deadline ? new Date(goal.deadline) : null);
    setGoalPhoto(goal.photo || null);
    setGoalModalVisible(true);
  };

  const pickGoalImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      toast.show('Necesitamos permiso para acceder a tus fotos', 'error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      setGoalPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const submitGoal = async () => {
    if (!goalName.trim() || !goalTarget) {
      toast.show('Completá el nombre y el monto objetivo', 'error');
      return;
    }
    const payload = {
      name: goalName.trim(),
      target_amount: parseMoneyInput(goalTarget),
      deadline: goalDeadline ? goalDeadline.toISOString() : null,
      color: goalColor,
      icon: goalIcon,
      photo: goalPhoto,
    };
    try {
      if (editingGoalId) {
        await api.updateSavingsGoal(editingGoalId, payload);
        toast.show('Meta actualizada', 'success');
      } else {
        await api.createSavingsGoal(payload);
        toast.show('Meta creada', 'success');
      }
      setGoalModalVisible(false);
      loadGoals();
    } catch (e) {
      toast.show('Error al guardar la meta', 'error');
    }
  };

  const removeGoal = async (goalId: string) => {
    try {
      await api.deleteSavingsGoal(goalId);
      toast.show('Meta eliminada', 'success');
      if (selectedGoal?.id === goalId) setSelectedGoal(null);
      loadGoals();
    } catch (e) {
      toast.show('Error al eliminar', 'error');
    }
  };

  // ---------- Aporte ----------
  const openContribModal = (withdraw = false) => {
    setContribAmount(''); setContribNote(''); setContribIsWithdraw(withdraw);
    setContribModalVisible(true);
  };

  const submitContribution = async () => {
    if (!contribAmount || !selectedGoal) {
      toast.show('Ingresá un monto', 'error');
      return;
    }
    const raw = parseMoneyInput(contribAmount);
    const amount = contribIsWithdraw ? -Math.abs(raw) : Math.abs(raw);
    try {
      const wasCompleted = selectedGoal.is_completed;
      await api.contributeToGoal(selectedGoal.id, { amount, note: contribNote });
      setContribModalVisible(false);
      await refreshSelectedGoal();
      loadContributions(selectedGoal.id);
      const updated = (await api.getSavingsGoals()).find((g: any) => g.id === selectedGoal.id);
      if (updated?.is_completed && !wasCompleted) {
        toast.show(`🎉 ¡Completaste la meta "${selectedGoal.name}"!`, 'success', 6000);
      } else {
        toast.show(contribIsWithdraw ? 'Retiro registrado' : 'Aporte registrado', 'success');
      }
    } catch (e) {
      toast.show('Error al registrar el aporte', 'error');
    }
  };

  const removeContribution = async (id: string) => {
    try {
      await api.deleteContribution(id);
      toast.show('Aporte eliminado', 'success');
      await refreshSelectedGoal();
      if (selectedGoal) loadContributions(selectedGoal.id);
    } catch (e) {
      toast.show('Error al eliminar', 'error');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}><Text style={styles.loadingText}>Cargando...</Text></View>
      </SafeAreaView>
    );
  }

  // ==================== VISTA: DETALLE DE UNA META ====================
  if (selectedGoal) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={toast.hide} duration={toast.duration} />
        <View style={styles.detailHeader}>
          <TouchableOpacity onPress={() => setSelectedGoal(null)} testID="back-to-goals">
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.detailTitle}>{selectedGoal.name}</Text>
          <TouchableOpacity onPress={() => openEditGoal(selectedGoal)} testID="edit-goal-button">
            <Ionicons name="pencil" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.goalHero, { backgroundColor: selectedGoal.color }]}>
            {selectedGoal.photo ? (
              <Image source={{ uri: selectedGoal.photo }} style={styles.goalHeroPhoto} />
            ) : (
              <Ionicons name={selectedGoal.icon as any} size={32} color="rgba(0,0,0,0.7)" />
            )}
            {selectedGoal.is_completed && (
              <View style={styles.completedBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#000" />
                <Text style={styles.completedBadgeText}>Completada</Text>
              </View>
            )}
            <Text style={styles.goalHeroAmount}>{fmt(selectedGoal.current_amount)}</Text>
            <Text style={styles.goalHeroTarget}>de {fmt(selectedGoal.target_amount)}</Text>
            <View style={styles.heroBarBg}>
              <View style={[styles.heroBarFill, { width: `${selectedGoal.percentage}%` }]} />
            </View>
            <Text style={styles.heroPct}>{selectedGoal.percentage.toFixed(0)}% completado</Text>
            {!!selectedGoal.deadline && (
              <Text style={styles.goalDeadline}>
                Objetivo: {new Date(selectedGoal.deadline).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
            )}
          </View>

          <View style={styles.contribBtnRow}>
            <TouchableOpacity style={styles.contribBtn} onPress={() => openContribModal(false)} testID="add-contribution-button">
              <Ionicons name="add-circle" size={20} color={colors.textOnPrimary} />
              <Text style={styles.contribBtnText}>Agregar aporte</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.withdrawBtn} onPress={() => openContribModal(true)} testID="withdraw-button">
              <Ionicons name="remove-circle-outline" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionLabel}>Historial</Text>
          {contribLoading ? (
            <Text style={styles.loadingText}>Cargando...</Text>
          ) : contributions.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="wallet-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyText}>Sin aportes todavía</Text>
            </View>
          ) : (
            contributions.map((c) => (
              <View key={c.id} style={styles.contribRow}>
                <Ionicons
                  name={c.amount >= 0 ? 'arrow-up-circle' : 'arrow-down-circle'}
                  size={22}
                  color={c.amount >= 0 ? colors.success : colors.danger}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.contribAmount}>{c.amount >= 0 ? '+' : ''}{fmt(c.amount)}</Text>
                  <Text style={styles.contribDate}>
                    {new Date(c.date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {c.note ? ` · ${c.note}` : ''}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => removeContribution(c.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="trash" size={16} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))
          )}

          <TouchableOpacity
            style={styles.deleteGoalBtn}
            onPress={() => removeGoal(selectedGoal.id)}
            testID="delete-goal-button"
          >
            <Text style={styles.deleteGoalBtnText}>Eliminar meta</Text>
          </TouchableOpacity>
        </ScrollView>

        {renderContribModal()}
        {renderGoalModal()}
      </SafeAreaView>
    );
  }

  // ==================== VISTA: LISTADO GENERAL ====================
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={toast.hide} duration={toast.duration} />
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} testID="back-button">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Metas de Ahorro</Text>
        <TouchableOpacity onPress={openNewGoal} testID="add-goal-button">
          <Ionicons name="add-circle" size={28} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {goals.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="flag-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyText}>Sin metas todavía</Text>
            <Text style={styles.emptySubtext}>Creá tu primera meta de ahorro</Text>
          </View>
        ) : (
          goals.map((g) => (
            <TouchableOpacity key={g.id} style={styles.goalRow} onPress={() => openGoal(g)} testID={`goal-row-${g.id}`}>
              <View style={[styles.goalIconWrap, { backgroundColor: `${g.color}30` }]}>
                {g.photo ? (
                  <Image source={{ uri: g.photo }} style={styles.goalRowPhoto} />
                ) : (
                  <Ionicons name={g.icon as any} size={22} color={g.color} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.goalRowName}>{g.name}</Text>
                  {g.is_completed && <Ionicons name="checkmark-circle" size={14} color={colors.success} />}
                </View>
                <View style={styles.rowBarBg}>
                  <View style={[styles.rowBarFill, { width: `${g.percentage}%`, backgroundColor: g.color }]} />
                </View>
                <Text style={styles.goalRowAmounts}>{fmt(g.current_amount)} de {fmt(g.target_amount)} · {g.percentage.toFixed(0)}%</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {renderGoalModal()}
    </SafeAreaView>
  );

  // ==================== MODALES ====================
  function renderGoalModal() {
    return (
      <Modal visible={goalModalVisible} animationType="slide" transparent onRequestClose={() => setGoalModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={toast.hide} duration={toast.duration} />
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modal} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingGoalId ? 'Editar' : 'Nueva'} Meta</Text>
              <TouchableOpacity onPress={() => setGoalModalVisible(false)} testID="close-goal-modal">
                <Ionicons name="close" size={26} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Foto (opcional)</Text>
            <TouchableOpacity style={styles.photoPicker} onPress={pickGoalImage} testID="pick-goal-photo">
              {goalPhoto ? (
                <>
                  <Image source={{ uri: goalPhoto }} style={styles.photoPreview} />
                  <TouchableOpacity
                    style={styles.photoRemoveBtn}
                    onPress={(e) => { e.stopPropagation(); setGoalPhoto(null); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={22} color={colors.text} />
                  </TouchableOpacity>
                </>
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="image-outline" size={26} color={colors.textMuted} />
                  <Text style={styles.photoPlaceholderText}>Elegir de la galería</Text>
                </View>
              )}
            </TouchableOpacity>

            <Text style={styles.label}>Nombre</Text>
            <TextInput style={styles.input} placeholder="Viaje a Brasil, Auto nuevo..." placeholderTextColor={colors.textMuted} value={goalName} onChangeText={setGoalName} testID="goal-name-input" />

            <Text style={styles.label}>Monto objetivo (ARS)</Text>
            <TextInput style={styles.input} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={goalTarget} onChangeText={(v) => setGoalTarget(formatMoneyInput(v))} testID="goal-target-input" />

            <Text style={styles.label}>Fecha límite (opcional)</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDeadlinePicker(true)} testID="goal-deadline-button">
              <Ionicons name="calendar" size={18} color={colors.primary} />
              <Text style={styles.dateBtnText}>
                {goalDeadline ? goalDeadline.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Sin fecha límite'}
              </Text>
              {!!goalDeadline && (
                <TouchableOpacity onPress={() => setGoalDeadline(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
            {showDeadlinePicker && (
              <DateTimePicker
                value={goalDeadline || new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={new Date()}
                onChange={(event, date) => {
                  setShowDeadlinePicker(Platform.OS === 'ios');
                  if (date) setGoalDeadline(date);
                }}
                themeVariant="dark"
              />
            )}

            <Text style={styles.label}>Ícono</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {GOAL_ICONS.map((i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.iconChip, goalIcon === i && { backgroundColor: goalColor, borderColor: goalColor }]}
                  onPress={() => setGoalIcon(i)}
                >
                  <Ionicons name={i as any} size={20} color={goalIcon === i ? colors.textOnPrimary : colors.text} />
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.label}>Color</Text>
            <View style={styles.colorRow}>
              {GOAL_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorChip, { backgroundColor: c }, goalColor === c && styles.colorChipActive]}
                  onPress={() => setGoalColor(c)}
                />
              ))}
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={submitGoal} testID="submit-goal-button">
              <Text style={styles.submitBtnText}>{editingGoalId ? 'Actualizar' : 'Crear meta'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  function renderContribModal() {
    return (
      <Modal visible={contribModalVisible} animationType="slide" transparent onRequestClose={() => setContribModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modal} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{contribIsWithdraw ? 'Retirar de la meta' : 'Agregar aporte'}</Text>
              <TouchableOpacity onPress={() => setContribModalVisible(false)} testID="close-contrib-modal">
                <Ionicons name="close" size={26} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Monto (ARS)</Text>
            <TextInput style={styles.input} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={contribAmount} onChangeText={(v) => setContribAmount(formatMoneyInput(v))} testID="contrib-amount-input" />

            <Text style={styles.label}>Nota (opcional)</Text>
            <TextInput style={styles.input} placeholder="Aguinaldo, ahorro del mes..." placeholderTextColor={colors.textMuted} value={contribNote} onChangeText={setContribNote} testID="contrib-note-input" />

            <TouchableOpacity style={styles.submitBtn} onPress={submitContribution} testID="submit-contrib-button">
              <Text style={styles.submitBtnText}>{contribIsWithdraw ? 'Retirar' : 'Agregar'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: colors.textSecondary, fontSize: fontSize.md },

  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },

  goalRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
  },
  goalIconWrap: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  goalRowName: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  goalRowAmounts: { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 4 },
  rowBarBg: { height: 5, backgroundColor: colors.bgElevated, borderRadius: 3, overflow: 'hidden', marginTop: 6 },
  rowBarFill: { height: '100%', borderRadius: 3 },

  empty: { alignItems: 'center', paddingTop: 60, gap: spacing.xs },
  emptyText: { color: colors.text, fontSize: fontSize.md, fontWeight: '600', marginTop: spacing.sm },
  emptySubtext: { color: colors.textSecondary, fontSize: fontSize.sm },

  // Detalle
  detailHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  detailTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  goalHero: { borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, alignItems: 'center' },
  completedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.5)',
    paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full, marginTop: spacing.sm,
  },
  completedBadgeText: { color: '#000', fontSize: fontSize.xs, fontWeight: '700' },
  goalHeroAmount: { color: '#000', fontSize: fontSize.xxl, fontWeight: '800', marginTop: spacing.sm },
  goalHeroTarget: { color: 'rgba(0,0,0,0.6)', fontSize: fontSize.sm, marginTop: 2 },
  heroBarBg: { width: '100%', height: 8, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 4, overflow: 'hidden', marginTop: spacing.md },
  heroBarFill: { height: '100%', backgroundColor: '#000', borderRadius: 4 },
  heroPct: { color: 'rgba(0,0,0,0.7)', fontSize: fontSize.xs, fontWeight: '700', marginTop: 6 },
  goalDeadline: { color: 'rgba(0,0,0,0.6)', fontSize: fontSize.xs, marginTop: spacing.sm },

  contribBtnRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  contribBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md,
  },
  contribBtnText: { color: colors.textOnPrimary, fontSize: fontSize.sm, fontWeight: '700' },
  withdrawBtn: {
    width: 48, justifyContent: 'center', alignItems: 'center',
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },

  sectionLabel: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '700', marginBottom: spacing.sm },
  contribRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
  },
  contribAmount: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  contribDate: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },

  deleteGoalBtn: { alignItems: 'center', padding: spacing.md, marginTop: spacing.md },
  deleteGoalBtnText: { color: colors.danger, fontSize: fontSize.sm, fontWeight: '600' },

  // Modales
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalScroll: { maxHeight: '90%' },
  modal: { backgroundColor: colors.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  label: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600', marginBottom: spacing.xs, marginTop: spacing.md },
  input: { backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.md, fontSize: fontSize.md, color: colors.text, borderWidth: 1, borderColor: colors.border },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  dateBtnText: { flex: 1, color: colors.text, fontSize: fontSize.md },
  iconChip: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  photoPicker: { alignSelf: 'flex-start' },
  photoPreview: { width: 90, height: 90, borderRadius: radius.md },
  photoRemoveBtn: {
    position: 'absolute', top: -8, right: -8, backgroundColor: colors.bg, borderRadius: 12,
  },
  photoPlaceholder: {
    width: 90, height: 90, borderRadius: radius.md, backgroundColor: colors.bgElevated,
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center', gap: 4, padding: 4,
  },
  photoPlaceholderText: { color: colors.textMuted, fontSize: 10, textAlign: 'center' },
  goalRowPhoto: { width: 44, height: 44, borderRadius: 22 },
  goalHeroPhoto: { width: 72, height: 72, borderRadius: radius.md },
  colorRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  colorChip: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent' },
  colorChipActive: { borderColor: colors.text },
  submitBtn: { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.lg },
  submitBtnText: { color: colors.textOnPrimary, fontSize: fontSize.md, fontWeight: '700' },
});

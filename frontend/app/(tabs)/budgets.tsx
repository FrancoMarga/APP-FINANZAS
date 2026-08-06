import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { api } from '@/src/services/api';
import { colors, spacing, radius, fontSize } from '@/src/theme/colors';
import Toast from '@/src/components/Toast';
import { useToast } from '@/src/hooks/useToast';
import { useAuth } from '@/src/contexts/AuthContext';
import { formatMonth } from '@/src/components/MonthPicker';
import { formatMoneyInput, parseMoneyInput } from '@/src/utils/currency';

export default function Budgets() {
  const toast = useToast();
  const { token } = useAuth();
  const [budgets, setBudgets] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [threshold, setThreshold] = useState('80');
  const [loading, setLoading] = useState(true);

  const currentMonth = new Date().toISOString().slice(0, 7);

  const loadData = async () => {
    if (!token) return;
    try {
      const [bgts, cats, alrts] = await Promise.all([
        api.getBudgets(currentMonth),
        api.getCategories('expense'),
        api.getBudgetAlerts(),
      ]);
      setBudgets(bgts); setCategories(cats); setAlerts(alrts);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { loadData(); }, [token]);
  useFocusEffect(useCallback(() => { loadData(); }, [token]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const handleAdd = async () => {
    if (!selectedCategory || !monthlyLimit) {
      toast.show('Completá categoría y límite', 'error');
      return;
    }
    try {
      await api.createBudget({
        category: selectedCategory,
        monthly_limit: parseMoneyInput(monthlyLimit),
        alert_threshold: parseFloat(threshold),
        month: currentMonth,
      });
      toast.show('Presupuesto creado', 'success');
      setModalVisible(false);
      setSelectedCategory(''); setMonthlyLimit(''); setThreshold('80');
      loadData();
    } catch (e: any) {
      toast.show(e.message?.includes('exists') ? 'Ya existe presupuesto para esta categoría' : 'Error al crear', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteBudget(id);
      toast.show('Presupuesto eliminado', 'success');
      loadData();
    } catch { toast.show('Error al eliminar', 'error'); }
  };

  const fmt = (a: number) => `$${a.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const getColor = (pct: number, th: number) => {
    if (pct >= 100) return colors.danger;
    if (pct >= th) return colors.warning;
    return colors.success;
  };

  const availableCats = categories.filter((c) => !budgets.some((b) => b.category === c.name));

  if (loading) return <SafeAreaView style={styles.container}><View style={styles.loading}><Text style={styles.loadingText}>Cargando...</Text></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={toast.hide} />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Presupuestos</Text>
          <Text style={styles.headerSub}>{formatMonth(currentMonth, true)}</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)} testID="add-budget-button">
          <Ionicons name="add" size={24} color={colors.textOnPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {alerts.length > 0 && (
          <View style={styles.alertsBox}>
            <View style={styles.alertsHeader}>
              <Ionicons name="warning" size={18} color={colors.warning} />
              <Text style={styles.alertsTitle}>Alertas Activas</Text>
            </View>
            {alerts.map((a, i) => (
              <Text key={i} style={styles.alertText}>
                <Text style={{ fontWeight: '700' }}>{a.category}</Text>: {a.percentage.toFixed(0)}% usado ({fmt(a.spent)} / {fmt(a.limit)})
              </Text>
            ))}
          </View>
        )}

        {budgets.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="pie-chart-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyText}>Sin presupuestos</Text>
            <Text style={styles.emptySubtext}>Establecé límites por categoría</Text>
          </View>
        ) : (
          budgets.map((b) => {
            const pct = b.monthly_limit > 0 ? (b.current_spent / b.monthly_limit) * 100 : 0;
            const clr = getColor(pct, b.alert_threshold);
            const remaining = b.monthly_limit - b.current_spent;
            return (
              <View key={b.id} style={styles.bgtCard} testID={`budget-${b.id}`}>
                <View style={styles.bgtHeader}>
                  <Text style={styles.bgtCategory}>{b.category}</Text>
                  <TouchableOpacity onPress={() => handleDelete(b.id)} testID={`delete-budget-${b.id}`}>
                    <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
                <View style={styles.bgtAmounts}>
                  <Text style={styles.bgtSpent}>{fmt(b.current_spent)}</Text>
                  <Text style={styles.bgtLimit}>de {fmt(b.monthly_limit)}</Text>
                </View>
                <View style={styles.bgtBar}>
                  <View style={[styles.bgtBarFill, { width: `${Math.min(pct, 100)}%`, backgroundColor: clr }]} />
                </View>
                <View style={styles.bgtFooter}>
                  <Text style={[styles.bgtPct, { color: clr }]}>{pct.toFixed(0)}%</Text>
                  <Text style={[styles.bgtRemaining, { color: remaining >= 0 ? colors.success : colors.danger }]}>
                    {remaining >= 0 ? 'Disponible: ' : 'Excedido: '}{fmt(Math.abs(remaining))}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={toast.hide} />
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modal} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nuevo Presupuesto</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} testID="close-budget-modal">
                <Ionicons name="close" size={26} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Categoría</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.md }}>
              {availableCats.map((c) => {
                const active = selectedCategory === c.name;
                return (
                  <TouchableOpacity
                    key={c.category_id}
                    testID={`bgt-cat-${c.name}`}
                    style={[styles.catChip, active && { backgroundColor: c.color, borderColor: c.color }]}
                    onPress={() => setSelectedCategory(c.name)}
                  >
                    <Text style={[styles.catChipText, active && { color: colors.textOnPrimary, fontWeight: '700' }]}>{c.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {availableCats.length === 0 && <Text style={styles.hint}>Ya tenés presupuesto para todas las categorías</Text>}

            <Text style={styles.label}>Límite mensual (ARS)</Text>
            <TextInput style={styles.input} placeholder="50.000" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={monthlyLimit} onChangeText={(v) => setMonthlyLimit(formatMoneyInput(v))} testID="budget-limit-input" />

            <Text style={styles.label}>Alerta al alcanzar (%)</Text>
            <TextInput style={styles.input} placeholder="80" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={threshold} onChangeText={setThreshold} testID="budget-threshold-input" />

            <TouchableOpacity style={styles.submitBtn} onPress={handleAdd} testID="submit-budget">
              <Text style={styles.submitBtnText}>Crear Presupuesto</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: colors.textSecondary },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  headerTitle: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.text },
  headerSub: { color: colors.textSecondary, fontSize: fontSize.sm, textTransform: 'capitalize', marginTop: 2 },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md, paddingBottom: 40 },
  alertsBox: { backgroundColor: 'rgba(251,191,36,0.1)', borderColor: colors.warning, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  alertsHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  alertsTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  alertText: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { color: colors.text, fontSize: fontSize.md, fontWeight: '600', marginTop: spacing.md },
  emptySubtext: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 4 },
  bgtCard: { backgroundColor: colors.bgCard, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  bgtHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bgtCategory: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  bgtAmounts: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.sm },
  bgtSpent: { color: colors.text, fontSize: fontSize.xl, fontWeight: '800' },
  bgtLimit: { color: colors.textSecondary, fontSize: fontSize.sm },
  bgtBar: { height: 8, backgroundColor: colors.bgElevated, borderRadius: 4, overflow: 'hidden', marginBottom: spacing.sm },
  bgtBarFill: { height: '100%', borderRadius: 4 },
  bgtFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bgtPct: { fontSize: fontSize.sm, fontWeight: '700' },
  bgtRemaining: { fontSize: fontSize.sm, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalScroll: { maxHeight: '92%' },
  modal: { backgroundColor: colors.bgCard, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  label: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600', marginBottom: spacing.sm, marginTop: spacing.md },
  input: { backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.md, fontSize: fontSize.md, color: colors.text, borderWidth: 1, borderColor: colors.border },
  catChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated, height: 36, justifyContent: 'center' },
  catChipText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '500' },
  hint: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 4 },
  submitBtn: { backgroundColor: colors.primary, borderRadius: radius.full, paddingVertical: spacing.md + 2, alignItems: 'center', marginTop: spacing.lg },
  submitBtnText: { color: colors.textOnPrimary, fontSize: fontSize.md, fontWeight: '700' },
});

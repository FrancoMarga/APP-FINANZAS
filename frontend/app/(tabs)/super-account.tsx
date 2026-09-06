import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { api } from '@/src/services/api';
import { useAuth } from '@/src/contexts/AuthContext';
import { colors, spacing, radius, fontSize } from '@/src/theme/colors';
import Toast from '@/src/components/Toast';
import { useToast } from '@/src/hooks/useToast';
import { useHideAmounts, maskAmount } from '@/src/hooks/useHideAmounts';
import { formatMoneyInputDecimal, parseMoneyInputDecimal } from '@/src/utils/currency';

const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function formatCuotaMonth(cuotaMonth?: string): string {
  if (!cuotaMonth) return '';
  const [year, month] = cuotaMonth.split('-').map(Number);
  const name = MONTH_NAMES[(month || 1) - 1] || '';
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

export default function SuperAccountScreen() {
  const toast = useToast();
  const { token } = useAuth();
  const { hidden: hideAmounts } = useHideAmounts();

  const [superSummary, setSuperSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [superExpenseModalVisible, setSuperExpenseModalVisible] = useState(false);
  const [superEditingId, setSuperEditingId] = useState<string | null>(null);
  const [superDesc, setSuperDesc] = useState('');
  const [superAmount, setSuperAmount] = useState('');

  const [superPayModalVisible, setSuperPayModalVisible] = useState(false);
  const [superPayAmount, setSuperPayAmount] = useState('');
  const [superPayReimbursement, setSuperPayReimbursement] = useState('');
  const [superPayCycle, setSuperPayCycle] = useState<string | null>(null); // null = mes actual

  const [superStatementsModalVisible, setSuperStatementsModalVisible] = useState(false);
  const [superStatementsLoading, setSuperStatementsLoading] = useState(false);
  const [superStatements, setSuperStatements] = useState<any[]>([]);
  const [superExpandedCycle, setSuperExpandedCycle] = useState<string | null>(null);

  const fmt = (n: number) => {
    const formatted = `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return hideAmounts ? maskAmount(formatted) : formatted;
  };

  const loadSuperSummary = async () => {
    if (!token) return;
    try {
      const s = await api.getSuperAccountSummary();
      setSuperSummary(s);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadSuperSummary();
    }, [token])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadSuperSummary();
  };

  const openNewSuperExpense = () => {
    setSuperEditingId(null);
    setSuperDesc('');
    setSuperAmount('');
    setSuperExpenseModalVisible(true);
  };

  const openEditSuperExpense = (exp: any) => {
    setSuperEditingId(exp.id);
    setSuperDesc(exp.description);
    setSuperAmount(formatMoneyInputDecimal(String(exp.amount).replace('.', ',')));
    setSuperExpenseModalVisible(true);
  };

  const submitSuperExpense = async () => {
    if (!superAmount) {
      toast.show('Ingresá un monto', 'error');
      return;
    }
    try {
      const payload = {
        description: superDesc || 'Compra del súper',
        amount: parseMoneyInputDecimal(superAmount),
        date: new Date().toISOString(),
      };
      if (superEditingId) {
        await api.updateSuperExpense(superEditingId, payload);
      } else {
        await api.createSuperExpense(payload);
      }
      setSuperExpenseModalVisible(false);
      loadSuperSummary();
      toast.show('Guardado', 'success');
    } catch (e) {
      toast.show('Error al guardar', 'error');
    }
  };

  const removeSuperExpense = async (id: string) => {
    try {
      await api.deleteSuperExpense(id);
      loadSuperSummary();
      toast.show('Gasto eliminado', 'success');
    } catch (e) {
      toast.show('Error al eliminar', 'error');
    }
  };

  const openSuperPayModal = (cycle: string | null = null) => {
    setSuperPayCycle(cycle);
    setSuperPayAmount('');
    setSuperPayReimbursement('');
    setSuperPayModalVisible(true);
  };

  const openSuperStatements = async () => {
    setSuperStatementsModalVisible(true);
    setSuperStatementsLoading(true);
    setSuperExpandedCycle(null);
    try {
      const data = await api.getSuperAccountStatements();
      setSuperStatements(data);
    } catch (e) {
      toast.show('Error al cargar los meses anteriores', 'error');
    } finally {
      setSuperStatementsLoading(false);
    }
  };

  const submitSuperPayment = async () => {
    if (!superPayAmount) {
      toast.show('Ingresá cuánto pagaste', 'error');
      return;
    }
    try {
      await api.paySuperAccount({
        amount_paid: parseMoneyInputDecimal(superPayAmount),
        reimbursement: superPayReimbursement ? parseMoneyInputDecimal(superPayReimbursement) : 0,
        cycle: superPayCycle || undefined,
        date: new Date().toISOString(),
      });
      setSuperPayModalVisible(false);
      setSuperPayAmount('');
      setSuperPayReimbursement('');
      loadSuperSummary();
      if (superStatementsModalVisible) openSuperStatements();
      toast.show('Pago registrado', 'success');
    } catch (e) {
      toast.show('Error al registrar el pago', 'error');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}>
          <Text style={styles.loadingText}>Cargando...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const expenses = superSummary?.expenses || [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={toast.hide} duration={toast.duration} />

      <View style={styles.headerRow}>
        <Text style={styles.title}>Cuenta Super</Text>
        <TouchableOpacity onPress={openSuperStatements} testID="open-super-statements-button">
          <Ionicons name="time-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Resumen tipo Inversiones: total grande arriba, stats abajo */}
        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>Total de la cuenta (histórico)</Text>
          <Text style={styles.summaryAmount}>{fmt(superSummary?.total_all_time || 0)}</Text>
          <View style={styles.summaryRow}>
            <View>
              <Text style={styles.summaryStatLabel}>Este mes</Text>
              <Text style={styles.summaryStatValue}>{fmt(superSummary?.month_total || 0)}</Text>
            </View>
            <View>
              <Text style={styles.summaryStatLabel}>Pagado este mes</Text>
              <Text style={[styles.summaryStatValue, superSummary?.month_is_paid && { color: colors.success }]}>
                {fmt(superSummary?.month_paid || 0)}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
          <TouchableOpacity
            style={[styles.submitBtn, { flex: 1, backgroundColor: colors.success }]}
            onPress={() => openSuperPayModal(null)}
            testID="open-super-pay-button"
          >
            <Text style={styles.submitBtnText}>Pagar este mes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addExpenseBtnOutline, { flex: 1 }]}
            onPress={openNewSuperExpense}
            testID="add-super-expense-button"
          >
            <Ionicons name="add" size={18} color={colors.primary} />
            <Text style={styles.addExpenseBtnOutlineText}>Agregar gasto</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>Gastos de este mes</Text>
        {expenses.length === 0 ? (
          <Text style={styles.hint}>Todavía no cargaste gastos este mes.</Text>
        ) : (
          expenses.map((exp: any) => (
            <View key={exp.id} style={styles.expenseRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.expenseDesc}>{exp.description}</Text>
                <Text style={styles.installmentText}>
                  {new Date(exp.date).toLocaleDateString('es-AR')}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.expenseTotal}>{fmt(exp.amount)}</Text>
                <View style={styles.expenseActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => openEditSuperExpense(exp)} testID={`edit-super-expense-${exp.id}`}>
                    <Ionicons name="pencil" size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => removeSuperExpense(exp.id)} testID={`delete-super-expense-${exp.id}`}>
                    <Ionicons name="trash" size={16} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {renderSuperStatementsModal()}
      {renderSuperExpenseModal()}
      {renderSuperPayModal()}
    </SafeAreaView>
  );

  function renderSuperStatementsModal() {
    return (
      <Modal
        visible={superStatementsModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setSuperStatementsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { maxHeight: '85%' }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Meses anteriores</Text>
              <TouchableOpacity onPress={() => setSuperStatementsModalVisible(false)} testID="close-super-statements-modal">
                <Ionicons name="close" size={26} color={colors.text} />
              </TouchableOpacity>
            </View>

            {superStatementsLoading ? (
              <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
                <Text style={styles.loadingText}>Cargando...</Text>
              </View>
            ) : superStatements.length === 0 ? (
              <Text style={styles.hint}>Todavía no hay meses anteriores cerrados.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 480 }}>
                {superStatements.map((st) => {
                  const isOpen = superExpandedCycle === st.cycle;
                  const paid = !!st.is_paid;
                  const tint = paid ? 'rgba(74,222,128,0.14)' : 'rgba(248,113,113,0.14)';
                  const border = paid ? 'rgba(74,222,128,0.4)' : 'rgba(248,113,113,0.4)';
                  return (
                    <View
                      key={st.cycle}
                      style={{
                        backgroundColor: tint, borderColor: border, borderWidth: 1,
                        borderRadius: radius.md, marginBottom: spacing.sm, overflow: 'hidden',
                      }}
                    >
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md }}
                        onPress={() => setSuperExpandedCycle(isOpen ? null : st.cycle)}
                        testID={`super-statement-cycle-${st.cycle}`}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.expenseDesc}>{formatCuotaMonth(st.cycle)}</Text>
                          <Text style={styles.installmentText}>
                            {paid ? 'Pagado' : 'Sin pagar'}
                            {!paid && st.paid_amount > 0 ? ` · pagaste ${fmt(st.paid_amount)}` : ''}
                          </Text>
                        </View>
                        <Text style={[styles.expenseTotal, { marginRight: spacing.sm }]}>{fmt(st.total)}</Text>
                        <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
                      </TouchableOpacity>

                      {isOpen && (
                        <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>
                          {st.items.map((it: any, idx: number) => (
                            <View
                              key={`${it.expense_id}-${idx}`}
                              style={{
                                flexDirection: 'row', justifyContent: 'space-between',
                                paddingVertical: spacing.xs, borderTopWidth: idx === 0 ? 1 : 0,
                                borderTopColor: 'rgba(255,255,255,0.08)',
                              }}
                            >
                              <Text style={{ color: colors.text, fontSize: fontSize.sm, flex: 1 }}>{it.description}</Text>
                              <Text style={{ color: colors.text, fontSize: fontSize.sm }}>{fmt(it.amount)}</Text>
                            </View>
                          ))}
                          {!paid && (
                            <TouchableOpacity
                              style={[styles.submitBtn, { marginTop: spacing.sm, backgroundColor: colors.success }]}
                              onPress={() => openSuperPayModal(st.cycle)}
                              testID={`pay-super-statement-${st.cycle}`}
                            >
                              <Text style={styles.submitBtnText}>Pagar este mes</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    );
  }

  function renderSuperExpenseModal() {
    return (
      <Modal
        visible={superExpenseModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setSuperExpenseModalVisible(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{superEditingId ? 'Editar gasto' : 'Nuevo gasto del súper'}</Text>
              <TouchableOpacity onPress={() => setSuperExpenseModalVisible(false)} testID="close-super-expense-modal">
                <Ionicons name="close" size={26} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>Descripción</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: Compra semanal"
              placeholderTextColor={colors.textMuted}
              value={superDesc}
              onChangeText={setSuperDesc}
              testID="super-expense-description-input"
            />
            <Text style={styles.label}>Monto</Text>
            <TextInput
              style={styles.input}
              placeholder="$0"
              placeholderTextColor={colors.textMuted}
              value={superAmount}
              onChangeText={(t) => setSuperAmount(formatMoneyInputDecimal(t))}
              keyboardType="numeric"
              testID="super-expense-amount-input"
            />
            <TouchableOpacity style={styles.submitBtn} onPress={submitSuperExpense} testID="submit-super-expense-button">
              <Text style={styles.submitBtnText}>Guardar</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  function renderSuperPayModal() {
    const netPreview = (parseMoneyInputDecimal(superPayAmount || '0') || 0) - (parseMoneyInputDecimal(superPayReimbursement || '0') || 0);
    return (
      <Modal
        visible={superPayModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setSuperPayModalVisible(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Pagar {superPayCycle ? formatCuotaMonth(superPayCycle) : 'este mes'}
              </Text>
              <TouchableOpacity onPress={() => setSuperPayModalVisible(false)} testID="close-super-pay-modal">
                <Ionicons name="close" size={26} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>Cuánto pagaste</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: $300.000"
              placeholderTextColor={colors.textMuted}
              value={superPayAmount}
              onChangeText={(t) => setSuperPayAmount(formatMoneyInputDecimal(t))}
              keyboardType="numeric"
              testID="super-pay-amount-input"
            />
            <Text style={styles.label}>Reintegro por promo (opcional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ej: $90.000"
              placeholderTextColor={colors.textMuted}
              value={superPayReimbursement}
              onChangeText={(t) => setSuperPayReimbursement(formatMoneyInputDecimal(t))}
              keyboardType="numeric"
              testID="super-pay-reimbursement-input"
            />
            <Text style={styles.hint}>
              A la torta del dashboard va a sumar {fmt(Math.max(0, netPreview))} (lo pagado menos el reintegro), como "Cuenta Super".
            </Text>
            <TouchableOpacity style={styles.submitBtn} onPress={submitSuperPayment} testID="submit-super-pay-button">
              <Text style={styles.submitBtnText}>Confirmar pago</Text>
            </TouchableOpacity>
          </View>
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
  title: { color: colors.text, fontSize: fontSize.xl, fontWeight: '800' },

  summary: { backgroundColor: colors.primary, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md },
  summaryLabel: { color: colors.textOnPrimary, opacity: 0.75, fontSize: fontSize.sm, fontWeight: '600' },
  summaryAmount: { color: colors.textOnPrimary, fontSize: fontSize.xxxl, fontWeight: '800', marginVertical: spacing.sm },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  summaryStatLabel: { color: colors.textOnPrimary, opacity: 0.75, fontSize: fontSize.xs, fontWeight: '600' },
  summaryStatValue: { color: colors.textOnPrimary, fontSize: fontSize.md, fontWeight: '700', marginTop: 2 },

  sectionLabel: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '700', marginBottom: spacing.sm },
  hint: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.xs },
  label: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600', marginBottom: spacing.xs, marginTop: spacing.md },
  input: { backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.md, fontSize: fontSize.md, color: colors.text, borderWidth: 1, borderColor: colors.border },

  submitBtn: { backgroundColor: colors.primary, borderRadius: radius.full, paddingVertical: spacing.md + 2, alignItems: 'center' },
  submitBtnText: { color: colors.textOnPrimary, fontSize: fontSize.md, fontWeight: '700' },
  addExpenseBtnOutline: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: radius.full, paddingVertical: spacing.md + 2, borderWidth: 1.5, borderColor: colors.primary,
  },
  addExpenseBtnOutlineText: { color: colors.primary, fontSize: fontSize.md, fontWeight: '700' },

  expenseRow: {
    flexDirection: 'row', backgroundColor: colors.bgCard, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
  },
  expenseDesc: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  installmentText: { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 4 },
  expenseTotal: { color: colors.text, fontSize: fontSize.md, fontWeight: '800' },
  expenseActions: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  actionBtn: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: colors.bgElevated,
    alignItems: 'center', justifyContent: 'center',
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: colors.bgCard, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '800' },
});

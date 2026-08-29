import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { api } from '@/src/services/api';
import { useAuth } from '@/src/contexts/AuthContext';
import { colors, spacing, radius, fontSize } from '@/src/theme/colors';
import Toast from '@/src/components/Toast';
import { useToast } from '@/src/hooks/useToast';
import { useHideAmounts, maskAmount } from '@/src/hooks/useHideAmounts';
import { formatMoneyInputDecimal, parseMoneyInputDecimal } from '@/src/utils/currency';

export default function LoansScreen() {
  const router = useRouter();
  const toast = useToast();
  const { token } = useAuth();
  const { hidden: hideAmounts } = useHideAmounts();

  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedLoan, setSelectedLoan] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  const [loanModalVisible, setLoanModalVisible] = useState(false);
  const [editingLoanId, setEditingLoanId] = useState<string | null>(null);
  const [personName, setPersonName] = useState('');
  const [description, setDescription] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [loanDate, setLoanDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [hasInterest, setHasInterest] = useState(false);
  const [interestRate, setInterestRate] = useState('');

  const [payModalVisible, setPayModalVisible] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');

  const fmt = (n: number) => {
    const formatted = `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return hideAmounts ? maskAmount(formatted) : formatted;
  };

  const loadLoans = async () => {
    if (!token) return;
    try {
      const data = await api.getLoans();
      setLoans(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLoans(); }, [token]);

  const loadPayments = async (loanId: string) => {
    setPaymentsLoading(true);
    try {
      const data = await api.getLoanPayments(loanId);
      setPayments(data);
    } catch (e) {
      toast.show('Error al cargar los pagos', 'error');
    } finally {
      setPaymentsLoading(false);
    }
  };

  const openLoan = (loan: any) => {
    setSelectedLoan(loan);
    loadPayments(loan.id);
  };

  const refreshSelectedLoan = async () => {
    const data = await api.getLoans();
    setLoans(data);
    if (selectedLoan) {
      const updated = data.find((l: any) => l.id === selectedLoan.id);
      if (updated) setSelectedLoan(updated);
    }
  };

  const openNewLoan = () => {
    setEditingLoanId(null);
    setPersonName(''); setDescription(''); setLoanAmount('');
    setLoanDate(new Date()); setHasInterest(false); setInterestRate('');
    setLoanModalVisible(true);
  };

  const openEditLoan = (loan: any) => {
    setEditingLoanId(loan.id);
    setPersonName(loan.person_name); setDescription(loan.description || '');
    setLoanAmount(formatMoneyInputDecimal(String(loan.amount).replace('.', ',')));
    setLoanDate(new Date(loan.date));
    setHasInterest(!!loan.monthly_interest_rate);
    setInterestRate(loan.monthly_interest_rate ? String(loan.monthly_interest_rate).replace('.', ',') : '');
    setLoanModalVisible(true);
  };

  const submitLoan = async () => {
    if (!personName.trim() || !loanAmount) {
      toast.show('Completá el nombre y el monto', 'error');
      return;
    }
    const payload = {
      person_name: personName.trim(),
      description: description.trim(),
      amount: parseMoneyInputDecimal(loanAmount),
      date: loanDate.toISOString(),
      monthly_interest_rate: hasInterest && interestRate ? parseFloat(interestRate.replace(',', '.')) : null,
    };
    try {
      if (editingLoanId) {
        await api.updateLoan(editingLoanId, payload);
        toast.show('Préstamo actualizado', 'success');
      } else {
        await api.createLoan(payload);
        toast.show('Préstamo agregado', 'success');
      }
      setLoanModalVisible(false);
      loadLoans();
    } catch (e) {
      toast.show('Error al guardar', 'error');
    }
  };

  const removeLoan = async (loanId: string) => {
    try {
      await api.deleteLoan(loanId);
      toast.show('Préstamo eliminado', 'success');
      if (selectedLoan?.id === loanId) setSelectedLoan(null);
      loadLoans();
    } catch (e) {
      toast.show('Error al eliminar', 'error');
    }
  };

  const openPayModal = () => {
    setPayAmount(''); setPayNote('');
    setPayModalVisible(true);
  };

  const submitPayment = async () => {
    if (!payAmount || !selectedLoan) {
      toast.show('Ingresá un monto', 'error');
      return;
    }
    try {
      const wasSettled = selectedLoan.is_settled;
      await api.payLoan(selectedLoan.id, { amount: parseMoneyInputDecimal(payAmount), note: payNote });
      setPayModalVisible(false);
      await refreshSelectedLoan();
      loadPayments(selectedLoan.id);
      const updated = (await api.getLoans()).find((l: any) => l.id === selectedLoan.id);
      if (updated?.is_settled && !wasSettled) {
        toast.show(`✅ ${selectedLoan.person_name} ya te pagó todo`, 'success', 6000);
      } else {
        toast.show('Pago registrado', 'success');
      }
    } catch (e) {
      toast.show('Error al registrar el pago', 'error');
    }
  };

  const removePayment = async (id: string) => {
    try {
      await api.deleteLoanPayment(id);
      toast.show('Pago eliminado', 'success');
      await refreshSelectedLoan();
      if (selectedLoan) loadPayments(selectedLoan.id);
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

  if (selectedLoan) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={toast.hide} duration={toast.duration} />
        <View style={styles.detailHeader}>
          <TouchableOpacity onPress={() => setSelectedLoan(null)} testID="back-to-loans">
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.detailTitle}>{selectedLoan.person_name}</Text>
          <TouchableOpacity onPress={() => openEditLoan(selectedLoan)} testID="edit-loan-button">
            <Ionicons name="pencil" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.loanHero}>
            <Ionicons name="person-circle" size={40} color={colors.primary} />
            {selectedLoan.is_settled && (
              <View style={styles.settledBadge}>
                <Ionicons name="checkmark-circle" size={14} color={colors.textOnPrimary} />
                <Text style={styles.settledBadgeText}>Pagado por completo</Text>
              </View>
            )}
            {!!selectedLoan.description && <Text style={styles.loanHeroDesc}>{selectedLoan.description}</Text>}

            <View style={styles.loanHeroStats}>
              <View>
                <Text style={styles.loanHeroStatLabel}>Prestado</Text>
                <Text style={styles.loanHeroStatValue}>{fmt(selectedLoan.amount)}</Text>
              </View>
              {!!selectedLoan.monthly_interest_rate && (
                <View>
                  <Text style={styles.loanHeroStatLabel}>Interés acumulado</Text>
                  <Text style={styles.loanHeroStatValue}>{fmt(selectedLoan.interest_accrued)}</Text>
                </View>
              )}
              <View>
                <Text style={styles.loanHeroStatLabel}>Ya te pagó</Text>
                <Text style={styles.loanHeroStatValue}>{fmt(selectedLoan.total_paid)}</Text>
              </View>
            </View>

            <View style={styles.heroBarBg}>
              <View style={[styles.heroBarFill, { width: `${selectedLoan.percentage}%` }]} />
            </View>
            <Text style={styles.heroPct}>
              {selectedLoan.percentage.toFixed(0)}% pagado
              {!selectedLoan.is_settled ? ` · Falta ${fmt(selectedLoan.remaining)}` : ''}
            </Text>
            {!!selectedLoan.monthly_interest_rate && (
              <Text style={styles.interestHint}>
                💡 Interés simple del {String(selectedLoan.monthly_interest_rate).replace('.', ',')}% mensual sobre el
                monto prestado, aproximado — no compone mes a mes.
              </Text>
            )}
          </View>

          {!selectedLoan.is_settled && (
            <TouchableOpacity style={styles.payBtn} onPress={openPayModal} testID="add-payment-button">
              <Ionicons name="add-circle" size={20} color={colors.textOnPrimary} />
              <Text style={styles.payBtnText}>Registrar pago</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.sectionLabel}>Historial de pagos</Text>
          {paymentsLoading ? (
            <Text style={styles.loadingText}>Cargando...</Text>
          ) : payments.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyText}>Sin pagos todavía</Text>
            </View>
          ) : (
            payments.map((p) => (
              <View key={p.id} style={styles.paymentRow}>
                <Ionicons name="checkmark-circle-outline" size={20} color={colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.paymentAmount}>{fmt(p.amount)}</Text>
                  <Text style={styles.paymentDate}>
                    {new Date(p.date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {p.note ? ` · ${p.note}` : ''}
                  </Text>
                </View>
                <TouchableOpacity style={styles.actionBtn} onPress={() => removePayment(p.id)} testID={`delete-payment-${p.id}`}>
                  <Ionicons name="trash" size={16} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))
          )}

          <TouchableOpacity style={styles.deleteLoanBtn} onPress={() => removeLoan(selectedLoan.id)} testID="delete-loan-button">
            <Text style={styles.deleteLoanBtnText}>Eliminar préstamo</Text>
          </TouchableOpacity>
        </ScrollView>

        {renderPayModal()}
        {renderLoanModal()}
      </SafeAreaView>
    );
  }

  const totalLent = loans.reduce((s, l) => s + l.amount, 0);
  const totalPending = loans.reduce((s, l) => s + l.remaining, 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={toast.hide} duration={toast.duration} />
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} testID="back-button">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Préstamos</Text>
        <TouchableOpacity onPress={openNewLoan} testID="add-loan-button">
          <Ionicons name="add-circle" size={28} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loans.length > 0 && (
          <View style={styles.overallSummary}>
            <View style={styles.overallItem}>
              <Text style={styles.overallLabel}>Prestado en total</Text>
              <Text style={styles.overallValue}>{fmt(totalLent)}</Text>
            </View>
            <View style={styles.overallDivider} />
            <View style={styles.overallItem}>
              <Text style={styles.overallLabel}>Todavía te deben</Text>
              <Text style={styles.overallValue}>{fmt(totalPending)}</Text>
            </View>
          </View>
        )}

        {loans.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyText}>Sin préstamos todavía</Text>
            <Text style={styles.emptySubtext}>Anotá la plata que le prestaste a alguien</Text>
          </View>
        ) : (
          loans.map((l) => (
            <TouchableOpacity key={l.id} style={styles.loanRow} onPress={() => openLoan(l)} testID={`loan-row-${l.id}`}>
              <View style={[styles.loanIconWrap, l.is_settled && { backgroundColor: 'rgba(74,222,128,0.15)' }]}>
                <Ionicons name="person" size={20} color={l.is_settled ? colors.success : colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.loanRowName}>{l.person_name}</Text>
                  {l.is_settled && <Ionicons name="checkmark-circle" size={14} color={colors.success} />}
                  {!!l.monthly_interest_rate && <Ionicons name="trending-up" size={12} color={colors.textMuted} />}
                </View>
                <View style={styles.rowBarBg}>
                  <View style={[styles.rowBarFill, { width: `${l.percentage}%` }]} />
                </View>
                <Text style={styles.loanRowAmounts}>
                  {l.is_settled ? 'Pagado por completo' : `Falta ${fmt(l.remaining)} de ${fmt(l.total_owed)}`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {renderLoanModal()}
    </SafeAreaView>
  );

  function renderLoanModal() {
    return (
      <Modal visible={loanModalVisible} animationType="slide" transparent onRequestClose={() => setLoanModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={toast.hide} duration={toast.duration} />
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modal} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingLoanId ? 'Editar' : 'Nuevo'} Préstamo</Text>
              <TouchableOpacity onPress={() => setLoanModalVisible(false)} testID="close-loan-modal">
                <Ionicons name="close" size={26} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>¿A quién le prestaste?</Text>
            <TextInput style={styles.input} placeholder="Nombre" placeholderTextColor={colors.textMuted} value={personName} onChangeText={setPersonName} testID="loan-person-input" />

            <Text style={styles.label}>Descripción (opcional)</Text>
            <TextInput style={styles.input} placeholder="Para qué era, cuándo se lo prometió devolver..." placeholderTextColor={colors.textMuted} value={description} onChangeText={setDescription} testID="loan-description-input" />

            <Text style={styles.label}>Monto prestado (ARS)</Text>
            <TextInput style={styles.input} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={loanAmount} onChangeText={(v) => setLoanAmount(formatMoneyInputDecimal(v))} testID="loan-amount-input" />

            <Text style={styles.label}>Fecha del préstamo</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)} testID="loan-date-button">
              <Ionicons name="calendar" size={18} color={colors.primary} />
              <Text style={styles.dateBtnText}>{loanDate.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={loanDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date()}
                onChange={(event, date) => {
                  setShowDatePicker(Platform.OS === 'ios');
                  if (date) setLoanDate(date);
                }}
                themeVariant="dark"
              />
            )}

            <TouchableOpacity style={styles.interestToggleRow} onPress={() => setHasInterest((v) => !v)} testID="toggle-interest">
              <View style={[styles.checkbox, hasInterest && styles.checkboxChecked]}>
                {hasInterest && <Ionicons name="checkmark" size={14} color={colors.textOnPrimary} />}
              </View>
              <Text style={styles.interestToggleText}>Tiene interés mensual</Text>
            </TouchableOpacity>

            {hasInterest && (
              <>
                <Text style={styles.label}>Interés mensual (%)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej: 5"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  value={interestRate}
                  onChangeText={setInterestRate}
                  testID="loan-interest-input"
                />
                <Text style={styles.hint}>💡 Interés simple sobre el monto original, aproximado mes a mes — no compone.</Text>
              </>
            )}

            <TouchableOpacity style={styles.submitBtn} onPress={submitLoan} testID="submit-loan-button">
              <Text style={styles.submitBtnText}>{editingLoanId ? 'Actualizar' : 'Agregar préstamo'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  function renderPayModal() {
    return (
      <Modal visible={payModalVisible} animationType="slide" transparent onRequestClose={() => setPayModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modal} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Registrar pago</Text>
              <TouchableOpacity onPress={() => setPayModalVisible(false)} testID="close-pay-modal">
                <Ionicons name="close" size={26} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Monto pagado (ARS)</Text>
            <TextInput style={styles.input} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={payAmount} onChangeText={(v) => setPayAmount(formatMoneyInputDecimal(v))} testID="pay-amount-input" />

            {!!selectedLoan && selectedLoan.remaining > 0 && (
              <TouchableOpacity
                style={styles.payFullDebtBtn}
                onPress={() => setPayAmount(formatMoneyInputDecimal(selectedLoan.remaining.toFixed(2).replace('.', ',')))}
                testID="pay-full-debt-button"
              >
                <Ionicons name="checkmark-done" size={16} color={colors.primary} />
                <Text style={styles.payFullDebtBtnText}>Pagó todo lo que faltaba ({fmt(selectedLoan.remaining)})</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.label}>Nota (opcional)</Text>
            <TextInput style={styles.input} placeholder="Pago parcial, transferencia..." placeholderTextColor={colors.textMuted} value={payNote} onChangeText={setPayNote} testID="pay-note-input" />

            <Text style={styles.hint}>💡 Podés registrar pagos parciales las veces que haga falta — el medidor de progreso se va actualizando solo.</Text>

            <TouchableOpacity style={styles.submitBtn} onPress={submitPayment} testID="submit-pay-button">
              <Text style={styles.submitBtnText}>Confirmar</Text>
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

  overallSummary: {
    flexDirection: 'row', backgroundColor: colors.bgCard, borderRadius: radius.lg,
    padding: spacing.lg, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  overallItem: { flex: 1 },
  overallDivider: { width: 1, backgroundColor: colors.border, marginHorizontal: spacing.md },
  overallLabel: { color: colors.textSecondary, fontSize: fontSize.xs },
  overallValue: { color: colors.text, fontSize: fontSize.lg, fontWeight: '800', marginTop: 4 },

  loanRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
  },
  loanIconWrap: {
    width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(212,245,66,0.15)',
  },
  loanRowName: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  loanRowAmounts: { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 4 },
  rowBarBg: { height: 5, backgroundColor: colors.bgElevated, borderRadius: 3, overflow: 'hidden', marginTop: 6 },
  rowBarFill: { height: '100%', borderRadius: 3, backgroundColor: colors.primary },

  empty: { alignItems: 'center', paddingTop: 60, gap: spacing.xs },
  emptyText: { color: colors.text, fontSize: fontSize.md, fontWeight: '600', marginTop: spacing.sm },
  emptySubtext: { color: colors.textSecondary, fontSize: fontSize.sm },

  detailHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  detailTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  loanHero: {
    backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.lg,
    marginBottom: spacing.lg, alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  settledBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.success,
    paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full, marginTop: spacing.sm,
  },
  settledBadgeText: { color: colors.textOnPrimary, fontSize: fontSize.xs, fontWeight: '700' },
  loanHeroDesc: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: spacing.sm, textAlign: 'center' },
  loanHeroStats: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.lg, flexWrap: 'wrap', justifyContent: 'center' },
  loanHeroStatLabel: { color: colors.textMuted, fontSize: fontSize.xs, textAlign: 'center' },
  loanHeroStatValue: { color: colors.text, fontSize: fontSize.md, fontWeight: '800', marginTop: 2, textAlign: 'center' },
  heroBarBg: { width: '100%', height: 8, backgroundColor: colors.bgElevated, borderRadius: 4, overflow: 'hidden', marginTop: spacing.lg },
  heroBarFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
  heroPct: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '700', marginTop: 6 },
  interestHint: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.sm, textAlign: 'center' },

  payBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg,
  },
  payBtnText: { color: colors.textOnPrimary, fontSize: fontSize.sm, fontWeight: '700' },

  sectionLabel: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '700', marginBottom: spacing.sm },
  paymentRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
  },
  paymentAmount: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  paymentDate: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  actionBtn: {
    width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center',
    backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border,
  },

  deleteLoanBtn: { alignItems: 'center', padding: spacing.md, marginTop: spacing.md },
  deleteLoanBtnText: { color: colors.danger, fontSize: fontSize.sm, fontWeight: '600' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalScroll: { maxHeight: '90%' },
  modal: { backgroundColor: colors.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  label: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600', marginBottom: spacing.xs, marginTop: spacing.md },
  input: { backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.md, fontSize: fontSize.md, color: colors.text, borderWidth: 1, borderColor: colors.border },
  hint: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.xs },
  payFullDebtBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    borderWidth: 1, borderColor: colors.primary, borderStyle: 'dashed',
    borderRadius: radius.md, padding: spacing.sm + 2, marginTop: spacing.sm,
  },
  payFullDebtBtnText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '700' },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  dateBtnText: { flex: 1, color: colors.text, fontSize: fontSize.md },
  interestToggleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  interestToggleText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  submitBtn: { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.lg },
  submitBtnText: { color: colors.textOnPrimary, fontSize: fontSize.md, fontWeight: '700' },
});

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  Modal, TextInput, KeyboardAvoidingView, Platform, BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { api } from '@/src/services/api';
import { useAuth } from '@/src/contexts/AuthContext';
import { colors, spacing, radius, fontSize } from '@/src/theme/colors';
import Toast from '@/src/components/Toast';
import { useToast } from '@/src/hooks/useToast';
import { useHideAmounts, maskAmount } from '@/src/hooks/useHideAmounts';
import { formatMoneyInput, parseMoneyInput, formatMoneyInputDecimal, parseMoneyInputDecimal } from '@/src/utils/currency';

const CARD_COLORS = ['#A78BFA', '#60A5FA', '#F87171', '#FBBF24', '#4ADE80', '#F472B6', '#818CF8', '#FB923C'];

const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function formatCuotaMonth(cuotaMonth?: string): string {
  if (!cuotaMonth) return '';
  const [year, month] = cuotaMonth.split('-').map(Number);
  const name = MONTH_NAMES[(month || 1) - 1] || '';
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

export default function CardsScreen() {
  const toast = useToast();
  const { token } = useAuth();
  const { hidden: hideAmounts } = useHideAmounts();

  const [summary, setSummary] = useState<any>(null);
  const [superSummary, setSuperSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedCard, setSelectedCard] = useState<any>(null); // card object cuando estamos "adentro" de una tarjeta
  const [cardExpenses, setCardExpenses] = useState<any[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(false);

  // Modal: nueva/editar tarjeta
  const [cardModalVisible, setCardModalVisible] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [cardName, setCardName] = useState('');
  const [cardBank, setCardBank] = useState('');
  const [cardLastDigits, setCardLastDigits] = useState('');
  const [cardColor, setCardColor] = useState(CARD_COLORS[0]);
  const [cardClosingDay, setCardClosingDay] = useState('1');
  const [cardDueDay, setCardDueDay] = useState('10');

  // Modal: nuevo/editar gasto en cuotas
  const [expenseModalVisible, setExpenseModalVisible] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [expDescription, setExpDescription] = useState('');
  const [expCategory, setExpCategory] = useState('');
  const [expTotalAmount, setExpTotalAmount] = useState('');
  const [expInstallments, setExpInstallments] = useState('1');
  const [expDate, setExpDate] = useState(new Date());
  const [showExpDatePicker, setShowExpDatePicker] = useState(false);
  const [expCardId, setExpCardId] = useState<string | null>(null);
  const [expIncludeInSummary, setExpIncludeInSummary] = useState(true);

  // Modal: pagar resumen (total o parcial)
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [payIsFull, setPayIsFull] = useState(true);
  const [payAmount, setPayAmount] = useState('');

  // Modal: ver resúmenes anteriores
  const [statementsModalVisible, setStatementsModalVisible] = useState(false);
  const [statementsLoading, setStatementsLoading] = useState(false);
  const [statements, setStatements] = useState<any[]>([]);
  const [expandedCycle, setExpandedCycle] = useState<string | null>(null);

  // Modal: Cuenta Super (cuenta corriente del súper)
  const [superModalVisible, setSuperModalVisible] = useState(false);
  const [superExpenseModalVisible, setSuperExpenseModalVisible] = useState(false);
  const [superEditingId, setSuperEditingId] = useState<string | null>(null);
  const [superDesc, setSuperDesc] = useState('');
  const [superAmount, setSuperAmount] = useState('');
  const [superPayModalVisible, setSuperPayModalVisible] = useState(false);
  const [superPayAmount, setSuperPayAmount] = useState('');
  const [superPayReimbursement, setSuperPayReimbursement] = useState('');

  const fmt = (n: number) => {
    const formatted = `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return hideAmounts ? maskAmount(formatted) : formatted;
  };

  const loadSummary = async () => {
    if (!token) return;
    try {
      const s = await api.getCardsSummary();
      setSummary(s);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadSuperSummary = async () => {
    if (!token) return;
    try {
      const s = await api.getSuperAccountSummary();
      setSuperSummary(s);
    } catch (e) {
      console.error(e);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadSummary();
      loadSuperSummary();
      if (selectedCard) loadCardExpenses(selectedCard.id);
    }, [token])
  );

  // Si estamos "adentro" de una tarjeta, el botón físico/gesto de atrás de
  // Android tiene que volver al listado de tarjetas (no salir del todo a
  // otra pestaña) — sin esto, Android no sabe que hay una "sub-pantalla"
  // interna y te manda directo a lo que había antes en el historial.
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (superModalVisible) {
          setSuperModalVisible(false);
          return true;
        }
        if (selectedCard) {
          setSelectedCard(null);
          return true; // evita que Android siga con su comportamiento por defecto
        }
        return false;
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [selectedCard, superModalVisible])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadSummary();
    loadSuperSummary();
    if (selectedCard) loadCardExpenses(selectedCard.id);
  };

  const loadCardExpenses = async (cardId: string) => {
    setExpensesLoading(true);
    try {
      const data = await api.getCardExpenses(cardId);
      setCardExpenses(data);
    } catch (e) {
      console.error(e);
      toast.show('Error al cargar los gastos de la tarjeta', 'error');
    } finally {
      setExpensesLoading(false);
    }
  };

  const openCard = (card: any) => {
    setSelectedCard(card);
    loadCardExpenses(card.id);
  };

  // ---------- Tarjeta: alta / edición ----------
  const openNewCard = () => {
    setEditingCardId(null);
    setCardName(''); setCardBank(''); setCardLastDigits('');
    setCardColor(CARD_COLORS[0]); setCardClosingDay('1'); setCardDueDay('10');
    setCardModalVisible(true);
  };

  const openEditCard = (card: any) => {
    setEditingCardId(card.id);
    setCardName(card.name); setCardBank(card.bank || ''); setCardLastDigits(card.last_digits || '');
    setCardColor(card.color); setCardClosingDay(String(card.closing_day || 1));
    setCardDueDay(String(card.payment_due_day || 10));
    setCardModalVisible(true);
  };

  const submitCard = async () => {
    if (!cardName.trim()) {
      toast.show('Ponele un nombre a la tarjeta', 'error');
      return;
    }
    const closingDay = Math.min(28, Math.max(1, parseInt(cardClosingDay, 10) || 1));
    const dueDay = Math.min(28, Math.max(1, parseInt(cardDueDay, 10) || 10));
    const payload = {
      name: cardName.trim(),
      bank: cardBank.trim() || null,
      last_digits: cardLastDigits.trim() || null,
      color: cardColor,
      closing_day: closingDay,
      payment_due_day: dueDay,
    };
    try {
      if (editingCardId) {
        await api.updateCard(editingCardId, payload);
        toast.show('Tarjeta actualizada', 'success');
      } else {
        await api.createCard(payload);
        toast.show('Tarjeta agregada', 'success');
      }
      setCardModalVisible(false);
      loadSummary();
    } catch (e) {
      toast.show('Error al guardar la tarjeta', 'error');
    }
  };

  const removeCard = async (cardId: string) => {
    try {
      await api.deleteCard(cardId);
      toast.show('Tarjeta eliminada', 'success');
      if (selectedCard?.id === cardId) setSelectedCard(null);
      loadSummary();
    } catch (e) {
      toast.show('Error al eliminar', 'error');
    }
  };

  // ---------- Gasto en cuotas: alta / edición ----------
  const openNewExpense = (cardId?: string) => {
    setEditingExpenseId(null);
    setExpDescription(''); setExpCategory(''); setExpTotalAmount('');
    setExpInstallments('1'); setExpDate(new Date());
    setExpCardId(cardId || selectedCard?.id || null);
    setExpIncludeInSummary(true);
    setExpenseModalVisible(true);
  };

  const openEditExpense = (exp: any) => {
    setEditingExpenseId(exp.id);
    setExpDescription(exp.description); setExpCategory(exp.category || '');
    setExpTotalAmount(formatMoneyInputDecimal(String(exp.total_amount).replace('.', ',')));
    setExpInstallments(String(exp.installments));
    setExpDate(new Date(exp.purchase_date));
    setExpCardId(exp.card_id);
    setExpIncludeInSummary(exp.include_in_summary !== false);
    setExpenseModalVisible(true);
  };

  const submitExpense = async () => {
    if (!expDescription.trim() || !expTotalAmount || !expCardId) {
      toast.show('Completá descripción, monto y tarjeta', 'error');
      return;
    }
    const installments = Math.max(1, parseInt(expInstallments, 10) || 1);
    const payload = {
      card_id: expCardId,
      description: expDescription.trim(),
      category: expCategory.trim() || null,
      total_amount: parseMoneyInputDecimal(expTotalAmount),
      installments,
      purchase_date: expDate.toISOString(),
      include_in_summary: expIncludeInSummary,
    };
    try {
      if (editingExpenseId) {
        await api.updateCardExpense(editingExpenseId, payload);
        toast.show('Gasto actualizado', 'success');
      } else {
        await api.createCardExpense(payload);
        toast.show('Gasto agregado', 'success');
      }
      setExpenseModalVisible(false);
      loadSummary();
      if (selectedCard) loadCardExpenses(selectedCard.id);
    } catch (e) {
      toast.show('Error al guardar el gasto', 'error');
    }
  };

  const removeExpense = async (id: string) => {
    try {
      await api.deleteCardExpense(id);
      toast.show('Gasto eliminado', 'success');
      loadSummary();
      if (selectedCard) loadCardExpenses(selectedCard.id);
    } catch (e) {
      toast.show('Error al eliminar', 'error');
    }
  };

  const closeExpenseEarly = async (id: string) => {
    try {
      await api.closeCardExpense(id);
      toast.show('Marcado como saldado', 'success');
      loadSummary();
      if (selectedCard) loadCardExpenses(selectedCard.id);
    } catch (e) {
      toast.show('Error al actualizar', 'error');
    }
  };

  const openPayModal = (full: boolean) => {
    setPayIsFull(full);
    if (full && selectedCard) {
      const stat = summary?.cards.find((c: any) => c.card.id === selectedCard.id);
      const pending = stat?.pending_this_cycle ?? stat?.this_month ?? 0;
      setPayAmount(formatMoneyInputDecimal(pending.toFixed(2).replace('.', ',')));
    } else {
      setPayAmount('');
    }
    setPayModalVisible(true);
  };

  const openStatements = async () => {
    if (!selectedCard) return;
    setStatementsModalVisible(true);
    setStatementsLoading(true);
    setExpandedCycle(null);
    try {
      const data = await api.getCardStatements(selectedCard.id);
      setStatements(data);
    } catch (e) {
      toast.show('Error al cargar los resúmenes', 'error');
    } finally {
      setStatementsLoading(false);
    }
  };

  const openSuperAccount = async () => {
    setSuperModalVisible(true);
    await loadSuperSummary();
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

  const submitSuperPayment = async () => {
    if (!superPayAmount) {
      toast.show('Ingresá cuánto pagaste', 'error');
      return;
    }
    try {
      await api.paySuperAccount({
        amount_paid: parseMoneyInputDecimal(superPayAmount),
        reimbursement: superPayReimbursement ? parseMoneyInputDecimal(superPayReimbursement) : 0,
        date: new Date().toISOString(),
      });
      setSuperPayModalVisible(false);
      setSuperPayAmount('');
      setSuperPayReimbursement('');
      loadSuperSummary();
      toast.show('Pago registrado', 'success');
    } catch (e) {
      toast.show('Error al registrar el pago', 'error');
    }
  };

  const submitPayment = async () => {
    if (!selectedCard || !payAmount) {
      toast.show('Ingresá un monto', 'error');
      return;
    }
    try {
      await api.payCardStatement(selectedCard.id, { amount_paid: parseMoneyInputDecimal(payAmount) });
      setPayModalVisible(false);
      toast.show(payIsFull ? 'Resumen marcado como pagado' : 'Pago parcial registrado', 'success');
      loadSummary();
    } catch (e) {
      toast.show('Error al registrar el pago', 'error');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}><Text style={styles.loadingText}>Cargando...</Text></View>
      </SafeAreaView>
    );
  }

  // ==================== VISTA: DETALLE DE UNA TARJETA ====================
  if (selectedCard) {
    const cardStat = summary?.cards.find((c: any) => c.card.id === selectedCard.id);
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={toast.hide} duration={toast.duration} />
        <View style={styles.detailHeader}>
          <TouchableOpacity onPress={() => setSelectedCard(null)} testID="back-to-cards">
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.detailTitle}>{selectedCard.name}</Text>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <TouchableOpacity onPress={openStatements} testID="open-statements-button">
              <Ionicons name="time-outline" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => openEditCard(selectedCard)} testID="edit-card-button">
              <Ionicons name="pencil" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          <View style={[styles.cardHero, { backgroundColor: selectedCard.color }]}>
            <Text style={styles.cardHeroBank}>{selectedCard.bank || 'Tarjeta'}</Text>
            <Text style={styles.cardHeroName}>{selectedCard.name}</Text>
            {!!selectedCard.last_digits && <Text style={styles.cardHeroDigits}>•••• {selectedCard.last_digits}</Text>}
            <View style={styles.cardHeroStats}>
              <View>
                <Text style={styles.cardHeroStatLabel}>Este mes</Text>
                <Text style={styles.cardHeroStatValue}>{fmt(cardStat?.this_month || 0)}</Text>
              </View>
              <View>
                <Text style={styles.cardHeroStatLabel}>Total pendiente</Text>
                <Text style={styles.cardHeroStatValue}>{fmt(cardStat?.pending_total || 0)}</Text>
              </View>
            </View>

            {(cardStat?.this_month || 0) > 0 && (
              <View style={styles.paymentStatusRow}>
                {cardStat?.cycle_paid ? (
                  <View style={styles.paymentStatusBadge}>
                    <Ionicons name="checkmark-circle" size={14} color="#000" />
                    <Text style={styles.paymentStatusText}>Resumen de este mes pagado</Text>
                  </View>
                ) : (
                  <Text style={styles.paymentPendingText}>
                    Pendiente de este resumen: {fmt(cardStat?.pending_this_cycle ?? cardStat?.this_month ?? 0)}
                    {(cardStat?.paid_this_cycle || 0) > 0 ? ` (ya pagaste ${fmt(cardStat.paid_this_cycle)})` : ''}
                  </Text>
                )}
              </View>
            )}
          </View>

          {(cardStat?.this_month || 0) > 0 && !cardStat?.cycle_paid && (
            <View style={styles.payBtnRow}>
              <TouchableOpacity
                style={styles.payFullBtn}
                onPress={() => openPayModal(true)}
                testID="pay-full-button"
              >
                <Ionicons name="checkmark-done" size={18} color={colors.textOnPrimary} />
                <Text style={styles.payFullBtnText}>Pagué el resumen</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.payPartialBtn}
                onPress={() => openPayModal(false)}
                testID="pay-partial-button"
              >
                <Text style={styles.payPartialBtnText}>Pago parcial</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={styles.addExpenseBtn}
            onPress={() => openNewExpense(selectedCard.id)}
            testID="add-card-expense-button"
          >
            <Ionicons name="add-circle" size={20} color={colors.textOnPrimary} />
            <Text style={styles.addExpenseBtnText}>Agregar compra en cuotas</Text>
          </TouchableOpacity>

          {expensesLoading ? (
            <Text style={styles.loadingText}>Cargando gastos...</Text>
          ) : cardExpenses.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="card-outline" size={56} color={colors.textMuted} />
              <Text style={styles.emptyText}>Sin compras registradas</Text>
              <Text style={styles.emptySubtext}>Agregá una compra en cuotas para esta tarjeta</Text>
            </View>
          ) : (
            cardExpenses.map((exp) => {
              const paid = exp.is_finished || exp.cuota_paid;
              const tint = paid ? 'rgba(74,222,128,0.14)' : 'rgba(248,113,113,0.14)';
              const border = paid ? 'rgba(74,222,128,0.4)' : 'rgba(248,113,113,0.4)';
              return (
                <View key={exp.id} style={[styles.expenseRow, { backgroundColor: tint, borderColor: border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.expenseDesc}>{exp.description}</Text>
                    {!!exp.category && <Text style={styles.expenseCategory}>{exp.category}</Text>}
                    <View style={styles.installmentBarWrap}>
                      <View style={styles.installmentBarBg}>
                        <View
                          style={[
                            styles.installmentBarFill,
                            { width: `${Math.min(100, (exp.current_installment / exp.installments) * 100)}%` },
                            paid && { backgroundColor: colors.success },
                          ]}
                        />
                      </View>
                      <Text style={styles.installmentText}>
                        {exp.is_finished ? 'Pagada' : `Cuota ${exp.current_installment} de ${exp.installments}`}
                        {!!exp.cuota_month && ` · ${formatCuotaMonth(exp.cuota_month)}`}
                        {!exp.is_finished && (paid ? ' · Pagada' : ' · Sin pagar')}
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.expenseTotal}>{fmt(exp.total_amount)}</Text>
                    <Text style={styles.expenseInstallmentAmount}>{fmt(exp.installment_amount)}/cuota</Text>
                    <View style={styles.expenseActions}>
                      <TouchableOpacity style={styles.actionBtn} onPress={() => openEditExpense(exp)} testID={`edit-expense-${exp.id}`}>
                        <Ionicons name="pencil" size={16} color={colors.textSecondary} />
                      </TouchableOpacity>
                      {!exp.is_finished && (
                        <TouchableOpacity style={styles.actionBtn} onPress={() => closeExpenseEarly(exp.id)} testID={`close-expense-${exp.id}`}>
                          <Ionicons name="checkmark-done" size={16} color={colors.success} />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={styles.actionBtn} onPress={() => removeExpense(exp.id)} testID={`delete-expense-${exp.id}`}>
                        <Ionicons name="trash" size={16} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {renderExpenseModal()}
        {renderCardModal()}
        {renderPayModal()}
        {renderStatementsModal()}
      </SafeAreaView>
    );
  }

  // ==================== VISTA: LISTADO GENERAL ====================
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={toast.hide} duration={toast.duration} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>Tarjetas</Text>
          <TouchableOpacity onPress={openNewCard} testID="add-card-button">
            <Ionicons name="add-circle" size={30} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.overallSummary}>
          <View style={styles.overallItem}>
            <Text style={styles.overallLabel}>Este mes (todas)</Text>
            <Text style={styles.overallValue}>{fmt(summary?.total_this_month || 0)}</Text>
          </View>
          <View style={styles.overallDivider} />
          <View style={styles.overallItem}>
            <Text style={styles.overallLabel}>Deuda total pendiente</Text>
            <Text style={styles.overallValue}>{fmt(summary?.total_pending || 0)}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.cardRow} onPress={openSuperAccount} testID="open-super-account">
          <View style={[styles.cardDot, { backgroundColor: '#4ADE80' }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardRowName}>Cuenta Super</Text>
            <Text style={styles.cardRowMeta}>Cuenta corriente del súper</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.cardRowAmount}>{fmt(superSummary?.balance || 0)}</Text>
            <Text style={styles.cardRowSub}>debés</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={{ marginLeft: spacing.xs }} />
        </TouchableOpacity>

        {(!summary || summary.cards.length === 0) ? (
          <View style={styles.empty}>
            <Ionicons name="card-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyText}>Sin tarjetas cargadas</Text>
            <Text style={styles.emptySubtext}>Agregá tu primera tarjeta para empezar</Text>
          </View>
        ) : (
          summary.cards.map((c: any) => (
            <TouchableOpacity
              key={c.card.id}
              style={styles.cardRow}
              onPress={() => openCard(c.card)}
              testID={`card-row-${c.card.id}`}
            >
              <View style={[styles.cardDot, { backgroundColor: c.card.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardRowName}>{c.card.name}</Text>
                <Text style={styles.cardRowMeta}>
                  {c.card.bank ? `${c.card.bank} · ` : ''}
                  {c.card.last_digits ? `•••• ${c.card.last_digits}` : ''}
                  {c.expenses_count > 0 ? ` · ${c.expenses_count} compra${c.expenses_count > 1 ? 's' : ''}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.cardRowAmount}>{fmt(c.this_month)}</Text>
                <Text style={styles.cardRowSub}>este mes</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={{ marginLeft: spacing.xs }} />
            </TouchableOpacity>
          ))
        )}

        {summary && summary.cards.length > 0 && (
          <TouchableOpacity
            style={styles.addExpenseBtnOutline}
            onPress={() => openNewExpense()}
            testID="add-expense-any-card-button"
          >
            <Ionicons name="add" size={18} color={colors.primary} />
            <Text style={styles.addExpenseBtnOutlineText}>Agregar compra en cuotas</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {renderCardModal()}
      {renderExpenseModal()}
      {renderSuperAccountModal()}
      {renderSuperExpenseModal()}
      {renderSuperPayModal()}
    </SafeAreaView>
  );

  // ==================== MODALES (compartidos por las 2 vistas) ====================
  function renderCardModal() {
    return (
      <Modal visible={cardModalVisible} animationType="slide" transparent onRequestClose={() => setCardModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={toast.hide} duration={toast.duration} />
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modal} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingCardId ? 'Editar' : 'Nueva'} Tarjeta</Text>
              <TouchableOpacity onPress={() => setCardModalVisible(false)} testID="close-card-modal">
                <Ionicons name="close" size={26} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Nombre</Text>
            <TextInput style={styles.input} placeholder="Visa Galicia, Naranja X..." placeholderTextColor={colors.textMuted} value={cardName} onChangeText={setCardName} testID="card-name-input" />

            <Text style={styles.label}>Banco / Emisor (opcional)</Text>
            <TextInput style={styles.input} placeholder="Banco Galicia" placeholderTextColor={colors.textMuted} value={cardBank} onChangeText={setCardBank} testID="card-bank-input" />

            <Text style={styles.label}>Últimos 4 dígitos (opcional)</Text>
            <TextInput style={styles.input} placeholder="1234" placeholderTextColor={colors.textMuted} value={cardLastDigits} onChangeText={setCardLastDigits} keyboardType="number-pad" maxLength={4} testID="card-digits-input" />

            <Text style={styles.label}>Día de cierre del resumen</Text>
            <TextInput style={styles.input} placeholder="1" placeholderTextColor={colors.textMuted} value={cardClosingDay} onChangeText={setCardClosingDay} keyboardType="number-pad" maxLength={2} testID="card-closing-input" />

            <Text style={styles.label}>Día de vencimiento del pago</Text>
            <TextInput style={styles.input} placeholder="10" placeholderTextColor={colors.textMuted} value={cardDueDay} onChangeText={setCardDueDay} keyboardType="number-pad" maxLength={2} testID="card-due-input" />
            <Text style={styles.hint}>
              💡 El día en que vence el pago del resumen, no el de cierre. Ej: Naranja X cierra el 27 y vence el 10 del mes siguiente.
              Hasta que no vence, una compra no se marca "Pagada" sola.
            </Text>

            <Text style={styles.label}>Color</Text>
            <View style={styles.colorRow}>
              {CARD_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorChip, { backgroundColor: c }, cardColor === c && styles.colorChipActive]}
                  onPress={() => setCardColor(c)}
                />
              ))}
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={submitCard} testID="submit-card-button">
              <Text style={styles.submitBtnText}>{editingCardId ? 'Actualizar' : 'Agregar'}</Text>
            </TouchableOpacity>

            {editingCardId && (
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => { setCardModalVisible(false); removeCard(editingCardId); }}
                testID="delete-card-button"
              >
                <Text style={styles.deleteBtnText}>Eliminar tarjeta</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  function renderExpenseModal() {
    const cardsList: any[] = summary?.cards.map((c: any) => c.card) || [];
    return (
      <Modal visible={expenseModalVisible} animationType="slide" transparent onRequestClose={() => setExpenseModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={toast.hide} duration={toast.duration} />
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modal} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingExpenseId ? 'Editar' : 'Nueva'} Compra en Cuotas</Text>
              <TouchableOpacity onPress={() => setExpenseModalVisible(false)} testID="close-expense-modal">
                <Ionicons name="close" size={26} color={colors.text} />
              </TouchableOpacity>
            </View>

            {!selectedCard && (
              <>
                <Text style={styles.label}>Tarjeta</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
                  {cardsList.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.cardChip, expCardId === c.id && { backgroundColor: c.color, borderColor: c.color }]}
                      onPress={() => setExpCardId(c.id)}
                    >
                      <Text style={[styles.cardChipText, expCardId === c.id && { color: colors.textOnPrimary }]}>{c.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            <Text style={styles.label}>Descripción</Text>
            <TextInput style={styles.input} placeholder="Notebook, zapatillas..." placeholderTextColor={colors.textMuted} value={expDescription} onChangeText={setExpDescription} testID="expense-desc-input" />

            <Text style={styles.label}>Categoría (opcional)</Text>
            <TextInput style={styles.input} placeholder="Tecnología, Ropa..." placeholderTextColor={colors.textMuted} value={expCategory} onChangeText={setExpCategory} testID="expense-category-input" />

            <Text style={styles.label}>Monto total (ARS)</Text>
            <TextInput style={styles.input} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={expTotalAmount} onChangeText={(v) => setExpTotalAmount(formatMoneyInputDecimal(v))} testID="expense-amount-input" />

            <Text style={styles.label}>Cantidad de cuotas</Text>
            <TextInput style={styles.input} placeholder="1" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={expInstallments} onChangeText={setExpInstallments} maxLength={2} testID="expense-installments-input" />
            {!!expTotalAmount && !!expInstallments && parseInt(expInstallments, 10) > 1 && (
              <Text style={styles.hint}>
                💡 {parseInt(expInstallments, 10)} cuotas de {fmt(parseMoneyInputDecimal(expTotalAmount) / (parseInt(expInstallments, 10) || 1))} cada una
              </Text>
            )}

            <Text style={styles.label}>Fecha de compra</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={() => setShowExpDatePicker(true)} testID="expense-date-button">
              <Ionicons name="calendar" size={18} color={colors.primary} />
              <Text style={styles.dateBtnText}>{expDate.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
            {showExpDatePicker && (
              <DateTimePicker
                value={expDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date()}
                onChange={(event, date) => {
                  setShowExpDatePicker(Platform.OS === 'ios');
                  if (date) setExpDate(date);
                }}
                themeVariant="dark"
              />
            )}

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setExpIncludeInSummary(!expIncludeInSummary)}
              testID="expense-include-summary-toggle"
            >
              <View style={[styles.checkbox, expIncludeInSummary && styles.checkboxChecked]}>
                {expIncludeInSummary && <Ionicons name="checkmark" size={14} color="#000" />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.checkboxLabel}>Incluir en la torta del dashboard</Text>
                <Text style={styles.checkboxHint}>
                  Al pagar el resumen, se suma como "Tarjeta" en los gastos por categoría
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.submitBtn} onPress={submitExpense} testID="submit-expense-button">
              <Text style={styles.submitBtnText}>{editingExpenseId ? 'Actualizar' : 'Agregar'}</Text>
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
              <Text style={styles.modalTitle}>{payIsFull ? 'Pagué el resumen' : 'Pago parcial'}</Text>
              <TouchableOpacity onPress={() => setPayModalVisible(false)} testID="close-pay-modal">
                <Ionicons name="close" size={26} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Monto pagado (ARS)</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              value={payAmount}
              onChangeText={(v) => setPayAmount(formatMoneyInputDecimal(v))}
              testID="pay-amount-input"
            />

            <Text style={styles.hint}>
              💡 Esto es un registro informativo — no calcula intereses. Si pagás menos del total,
              la diferencia queda como "pendiente de este resumen". Cualquier interés que te cobre
              el banco por eso, cargalo vos como un gasto aparte cuando te llegue en el resumen real.
            </Text>

            <TouchableOpacity style={styles.submitBtn} onPress={submitPayment} testID="submit-pay-button">
              <Text style={styles.submitBtnText}>Confirmar</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  function renderStatementsModal() {
    return (
      <Modal
        visible={statementsModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setStatementsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { maxHeight: '85%' }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Resúmenes anteriores</Text>
              <TouchableOpacity onPress={() => setStatementsModalVisible(false)} testID="close-statements-modal">
                <Ionicons name="close" size={26} color={colors.text} />
              </TouchableOpacity>
            </View>

            {statementsLoading ? (
              <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
                <Text style={styles.loadingText}>Cargando...</Text>
              </View>
            ) : statements.length === 0 ? (
              <Text style={styles.hint}>Todavía no hay resúmenes cerrados para esta tarjeta.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 480 }}>
                {statements.map((st) => {
                  const isOpen = expandedCycle === st.cycle;
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
                        onPress={() => setExpandedCycle(isOpen ? null : st.cycle)}
                        testID={`statement-cycle-${st.cycle}`}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.expenseDesc}>{formatCuotaMonth(st.cycle)}</Text>
                          <Text style={styles.installmentText}>{paid ? 'Pagado' : 'Sin pagar'}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', marginRight: spacing.sm }}>
                          <Text style={styles.expenseTotal}>{fmt(st.total)}</Text>
                          {!paid && st.paid_amount > 0 && (
                            <Text style={styles.expenseInstallmentAmount}>pagado: {fmt(st.paid_amount)}</Text>
                          )}
                        </View>
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
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: colors.text, fontSize: fontSize.sm }}>{it.description}</Text>
                                <Text style={styles.installmentText}>
                                  Cuota {it.cuota_label}{!!it.category && ` · ${it.category}`}
                                </Text>
                              </View>
                              <Text style={{ color: colors.text, fontSize: fontSize.sm }}>{fmt(it.installment_amount)}</Text>
                            </View>
                          ))}
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

  function renderSuperAccountModal() {
    const expenses = superSummary?.expenses || [];
    const payments = superSummary?.payments || [];
    return (
      <Modal
        visible={superModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setSuperModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { maxHeight: '90%' }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cuenta Super</Text>
              <TouchableOpacity onPress={() => setSuperModalVisible(false)} testID="close-super-modal">
                <Ionicons name="close" size={26} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.overallSummary}>
              <View style={styles.overallItem}>
                <Text style={styles.overallLabel}>Debés</Text>
                <Text style={styles.overallValue}>{fmt(superSummary?.balance || 0)}</Text>
              </View>
              <View style={styles.overallDivider} />
              <View style={styles.overallItem}>
                <Text style={styles.overallLabel}>Acumulado histórico</Text>
                <Text style={styles.overallValue}>{fmt(superSummary?.total_expenses || 0)}</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
              <TouchableOpacity
                style={[styles.submitBtn, { flex: 1, backgroundColor: colors.success }]}
                onPress={() => setSuperPayModalVisible(true)}
                testID="open-super-pay-button"
              >
                <Text style={styles.submitBtnText}>Pagar cuenta</Text>
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

            <ScrollView style={{ maxHeight: 420 }}>
              <Text style={styles.sectionLabel}>Gastos sin pagar</Text>
              {expenses.length === 0 ? (
                <Text style={styles.hint}>Sin gastos cargados todavía.</Text>
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

              {payments.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: spacing.md }]}>Historial de pagos</Text>
                  {payments.map((p: any) => (
                    <View key={p.id} style={[styles.expenseRow, { backgroundColor: 'rgba(74,222,128,0.14)', borderColor: 'rgba(74,222,128,0.4)' }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.expenseDesc}>{new Date(p.date).toLocaleDateString('es-AR')}</Text>
                        <Text style={styles.installmentText}>
                          Pagaste {fmt(p.amount_paid)}
                          {p.reimbursement > 0 ? ` · Reintegro ${fmt(p.reimbursement)}` : ''}
                        </Text>
                      </View>
                      <Text style={styles.expenseTotal}>{fmt(p.net_amount)}</Text>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>
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
              <Text style={styles.modalTitle}>Pagar Cuenta Super</Text>
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

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  title: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.text },

  overallSummary: {
    flexDirection: 'row', backgroundColor: colors.bgCard, borderRadius: radius.lg,
    padding: spacing.lg, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  overallItem: { flex: 1 },
  overallDivider: { width: 1, backgroundColor: colors.border, marginHorizontal: spacing.md },
  overallLabel: { color: colors.textSecondary, fontSize: fontSize.xs },
  overallValue: { color: colors.text, fontSize: fontSize.lg, fontWeight: '800', marginTop: 4 },

  cardRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
  },
  cardDot: { width: 12, height: 12, borderRadius: 6 },
  cardRowName: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  cardRowMeta: { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 },
  cardRowAmount: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  cardRowSub: { color: colors.textMuted, fontSize: fontSize.xs },

  addExpenseBtnOutline: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    borderWidth: 1, borderColor: colors.primary, borderStyle: 'dashed',
    borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm,
  },
  addExpenseBtnOutlineText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '700' },

  empty: { alignItems: 'center', paddingTop: 60, gap: spacing.xs },
  emptyText: { color: colors.text, fontSize: fontSize.md, fontWeight: '600', marginTop: spacing.sm },
  emptySubtext: { color: colors.textSecondary, fontSize: fontSize.sm },

  // Detalle de tarjeta
  detailHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  detailTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  cardHero: { borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  cardHeroBank: { color: 'rgba(0,0,0,0.6)', fontSize: fontSize.xs, fontWeight: '600' },
  cardHeroName: { color: colors.text, fontSize: fontSize.xl, fontWeight: '800', marginTop: 2 },
  cardHeroDigits: { color: 'rgba(0,0,0,0.6)', fontSize: fontSize.sm, marginTop: 4 },
  cardHeroStats: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.lg },
  cardHeroStatLabel: { color: 'rgba(0,0,0,0.6)', fontSize: fontSize.xs, fontWeight: '600' },
  cardHeroStatValue: { color: colors.text, fontSize: fontSize.lg, fontWeight: '800', marginTop: 2 },

  paymentStatusRow: { marginTop: spacing.md },
  paymentStatusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.5)', paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.full,
  },
  paymentStatusText: { color: '#000', fontSize: fontSize.xs, fontWeight: '700' },
  paymentPendingText: { color: 'rgba(0,0,0,0.7)', fontSize: fontSize.xs, fontWeight: '600' },

  payBtnRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  payFullBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    backgroundColor: colors.success, borderRadius: radius.md, padding: spacing.sm + 2,
  },
  payFullBtnText: { color: colors.textOnPrimary, fontSize: fontSize.sm, fontWeight: '700' },
  payPartialBtn: {
    paddingHorizontal: spacing.md, justifyContent: 'center', alignItems: 'center',
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  payPartialBtnText: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600' },

  addExpenseBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg,
  },
  addExpenseBtnText: { color: colors.textOnPrimary, fontSize: fontSize.sm, fontWeight: '700' },

  expenseRow: {
    flexDirection: 'row', backgroundColor: colors.bgCard, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
  },
  expenseDesc: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  expenseCategory: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 1 },
  installmentBarWrap: { marginTop: spacing.sm },
  installmentBarBg: { height: 5, backgroundColor: colors.bgElevated, borderRadius: 3, overflow: 'hidden' },
  installmentBarFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  installmentText: { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 4 },
  expenseTotal: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  expenseInstallmentAmount: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 1 },
  expenseActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  actionBtn: {
    width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center',
    backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border,
  },

  // Modales
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalScroll: { maxHeight: '90%' },
  modal: {
    backgroundColor: colors.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.lg,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  label: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600', marginBottom: spacing.xs, marginTop: spacing.md },
  sectionLabel: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '700', marginBottom: spacing.sm },
  input: { backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.md, fontSize: fontSize.md, color: colors.text, borderWidth: 1, borderColor: colors.border },
  hint: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.xs },
  checkboxRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    marginTop: spacing.lg, padding: spacing.md,
    backgroundColor: colors.bgElevated, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, marginTop: 1,
    borderWidth: 2, borderColor: colors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxLabel: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  checkboxHint: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  dateBtnText: { flex: 1, color: colors.text, fontSize: fontSize.md },
  colorRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  colorChip: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent' },
  colorChipActive: { borderColor: colors.text },
  cardChip: {
    backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  cardChipText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  submitBtn: { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.lg },
  submitBtnText: { color: colors.textOnPrimary, fontSize: fontSize.md, fontWeight: '700' },
  deleteBtn: { alignItems: 'center', padding: spacing.md, marginTop: spacing.xs },
  deleteBtnText: { color: colors.danger, fontSize: fontSize.sm, fontWeight: '600' },
});

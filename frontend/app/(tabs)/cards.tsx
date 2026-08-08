import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  Modal, TextInput, KeyboardAvoidingView, Platform,
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
import { formatMoneyInput, parseMoneyInput } from '@/src/utils/currency';

const CARD_COLORS = ['#A78BFA', '#60A5FA', '#F87171', '#FBBF24', '#4ADE80', '#F472B6', '#818CF8', '#FB923C'];

export default function CardsScreen() {
  const toast = useToast();
  const { token } = useAuth();
  const { hidden: hideAmounts } = useHideAmounts();

  const [summary, setSummary] = useState<any>(null);
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

  useFocusEffect(
    useCallback(() => {
      loadSummary();
      if (selectedCard) loadCardExpenses(selectedCard.id);
    }, [token])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadSummary();
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
    setCardColor(CARD_COLORS[0]); setCardClosingDay('1');
    setCardModalVisible(true);
  };

  const openEditCard = (card: any) => {
    setEditingCardId(card.id);
    setCardName(card.name); setCardBank(card.bank || ''); setCardLastDigits(card.last_digits || '');
    setCardColor(card.color); setCardClosingDay(String(card.closing_day || 1));
    setCardModalVisible(true);
  };

  const submitCard = async () => {
    if (!cardName.trim()) {
      toast.show('Ponele un nombre a la tarjeta', 'error');
      return;
    }
    const closingDay = Math.min(28, Math.max(1, parseInt(cardClosingDay, 10) || 1));
    const payload = {
      name: cardName.trim(),
      bank: cardBank.trim() || null,
      last_digits: cardLastDigits.trim() || null,
      color: cardColor,
      closing_day: closingDay,
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
    setExpenseModalVisible(true);
  };

  const openEditExpense = (exp: any) => {
    setEditingExpenseId(exp.id);
    setExpDescription(exp.description); setExpCategory(exp.category || '');
    setExpTotalAmount(formatMoneyInput(String(Math.round(exp.total_amount))));
    setExpInstallments(String(exp.installments));
    setExpDate(new Date(exp.purchase_date));
    setExpCardId(exp.card_id);
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
      total_amount: parseMoneyInput(expTotalAmount),
      installments,
      purchase_date: expDate.toISOString(),
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
          <TouchableOpacity onPress={() => openEditCard(selectedCard)} testID="edit-card-button">
            <Ionicons name="pencil" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
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
          </View>

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
            cardExpenses.map((exp) => (
              <View key={exp.id} style={styles.expenseRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.expenseDesc}>{exp.description}</Text>
                  {!!exp.category && <Text style={styles.expenseCategory}>{exp.category}</Text>}
                  <View style={styles.installmentBarWrap}>
                    <View style={styles.installmentBarBg}>
                      <View
                        style={[
                          styles.installmentBarFill,
                          { width: `${Math.min(100, (exp.current_installment / exp.installments) * 100)}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.installmentText}>
                      {exp.is_finished ? 'Pagada' : `Cuota ${exp.current_installment} de ${exp.installments}`}
                    </Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.expenseTotal}>{fmt(exp.total_amount)}</Text>
                  <Text style={styles.expenseInstallmentAmount}>{fmt(exp.installment_amount)}/cuota</Text>
                  <View style={styles.expenseActions}>
                    <TouchableOpacity onPress={() => openEditExpense(exp)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="pencil" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                    {!exp.is_finished && (
                      <TouchableOpacity onPress={() => closeExpenseEarly(exp.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="checkmark-done" size={16} color={colors.success} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => removeExpense(exp.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="trash" size={16} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>

        {renderExpenseModal()}
        {renderCardModal()}
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
            <TextInput style={styles.input} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={expTotalAmount} onChangeText={(v) => setExpTotalAmount(formatMoneyInput(v))} testID="expense-amount-input" />

            <Text style={styles.label}>Cantidad de cuotas</Text>
            <TextInput style={styles.input} placeholder="1" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={expInstallments} onChangeText={setExpInstallments} maxLength={2} testID="expense-installments-input" />
            {!!expTotalAmount && !!expInstallments && parseInt(expInstallments, 10) > 1 && (
              <Text style={styles.hint}>
                💡 {parseInt(expInstallments, 10)} cuotas de {fmt(parseMoneyInput(expTotalAmount) / (parseInt(expInstallments, 10) || 1))} cada una
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

            <TouchableOpacity style={styles.submitBtn} onPress={submitExpense} testID="submit-expense-button">
              <Text style={styles.submitBtnText}>{editingExpenseId ? 'Actualizar' : 'Agregar'}</Text>
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
  input: { backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.md, fontSize: fontSize.md, color: colors.text, borderWidth: 1, borderColor: colors.border },
  hint: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.xs },
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

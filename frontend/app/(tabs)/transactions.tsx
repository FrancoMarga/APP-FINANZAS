import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CategoryIcon from '@/src/components/CategoryIcon';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from 'expo-router';
import { api } from '@/src/services/api';
import { colors, spacing, radius, fontSize } from '@/src/theme/colors';
import Toast from '@/src/components/Toast';
import { useToast } from '@/src/hooks/useToast';
import { useAuth } from '@/src/contexts/AuthContext';
import { formatMoneyInput, parseMoneyInput } from '@/src/utils/currency';

export default function Transactions() {
  const toast = useToast();
  const { token } = useAuth();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedType, setSelectedType] = useState<'expense' | 'income' | 'saving'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Recurrentes
  const [recurringModalVisible, setRecurringModalVisible] = useState(false);
  const [recurringList, setRecurringList] = useState<any[]>([]);
  const [recurringLoading, setRecurringLoading] = useState(false);
  const [recFormVisible, setRecFormVisible] = useState(false);
  const [editingRecId, setEditingRecId] = useState<string | null>(null);
  const [recType, setRecType] = useState<'expense' | 'income' | 'saving'>('expense');
  const [recAmount, setRecAmount] = useState('');

  // Búsqueda y filtros
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filterDateFrom, setFilterDateFrom] = useState<Date | null>(null);
  const [filterDateTo, setFilterDateTo] = useState<Date | null>(null);
  const [filterMinAmount, setFilterMinAmount] = useState('');
  const [filterMaxAmount, setFilterMaxAmount] = useState('');
  const [showFilterDateFromPicker, setShowFilterDateFromPicker] = useState(false);
  const [showFilterDateToPicker, setShowFilterDateToPicker] = useState(false);
  const [recCategory, setRecCategory] = useState('');
  const [recDescription, setRecDescription] = useState('');
  const [recDay, setRecDay] = useState('1');

  const loadData = async () => {
    if (!token) return;
    try {
      const [txns, cats] = await Promise.all([
        api.getTransactions(),
        api.getCategories(),
      ]);
      setTransactions(txns);
      setCategories(cats);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadData(); }, [token]);
  useFocusEffect(useCallback(() => { loadData(); }, [token]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const openNewModal = () => {
    setEditingId(null);
    setSelectedType('expense');
    setAmount('');
    setDescription('');
    setSelectedCategory('');
    setSelectedDate(new Date());
    setModalVisible(true);
  };

  const openEditModal = (t: any) => {
    setEditingId(t.id);
    setSelectedType(t.type);
    setAmount(formatMoneyInput(String(t.amount).replace('.', ',')));
    setDescription(t.description || '');
    setSelectedCategory(t.category);
    setSelectedDate(new Date(t.date));
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    if (!amount || !selectedCategory) {
      toast.show('Completá monto y categoría', 'error');
      return;
    }
    try {
      const payload = {
        type: selectedType,
        amount: parseMoneyInput(amount),
        category: selectedCategory,
        description,
        date: selectedDate.toISOString(),
      };
      if (editingId) {
        await api.updateTransaction(editingId, payload);
        toast.show('Movimiento actualizado', 'success');
      } else {
        await api.createTransaction(payload);
        toast.show('Movimiento agregado', 'success');
      }
      setModalVisible(false);
      loadData();
      // Check budget alert
      if (selectedType === 'expense') {
        checkBudgetAlerts(selectedCategory);
      }
    } catch (error: any) {
      toast.show('Error al guardar', 'error');
    }
  };

  const checkBudgetAlerts = async (category: string) => {
    try {
      const alerts = await api.getBudgetAlerts();
      const catAlert = alerts.find((a: any) => a.category === category);
      if (catAlert) {
        if (catAlert.percentage >= 100) {
          toast.show(`⚠️ Presupuesto excedido en ${category}!`, 'error');
        } else {
          toast.show(`⚠️ ${catAlert.percentage.toFixed(0)}% del presupuesto usado en ${category}`, 'warning');
        }
      }
    } catch (e) { /* ignore */ }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteTransaction(id);
      toast.show('Movimiento eliminado', 'success');
      loadData();
    } catch { toast.show('Error al eliminar', 'error'); }
  };

  const formatCurrency = (amount: number) =>
    `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formatDate = (d: Date) => d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });

  const getTypeConfig = (type: string) => {
    if (type === 'expense') return { icon: 'arrow-up-circle', color: colors.danger, label: 'Gasto' };
    if (type === 'income') return { icon: 'arrow-down-circle', color: colors.success, label: 'Ingreso' };
    return { icon: 'save', color: colors.info, label: 'Ahorro' };
  };

  const filteredCats = categories.filter((c) => {
    if (selectedType === 'expense') return c.type === 'expense';
    if (selectedType === 'income') return c.type === 'income';
    return true;
  });

  const filteredRecCats = categories.filter((c) => {
    if (recType === 'expense') return c.type === 'expense';
    if (recType === 'income') return c.type === 'income';
    return true;
  });

  const loadRecurring = async () => {
    setRecurringLoading(true);
    try {
      const data = await api.getRecurring();
      setRecurringList(data);
    } catch (e) {
      toast.show('Error al cargar recurrentes', 'error');
    } finally {
      setRecurringLoading(false);
    }
  };

  const openRecurringModal = () => {
    setRecurringModalVisible(true);
    loadRecurring();
  };

  const openNewRecForm = () => {
    setEditingRecId(null);
    setRecType('expense'); setRecAmount(''); setRecCategory('');
    setRecDescription(''); setRecDay('1');
    setRecFormVisible(true);
  };

  const openEditRecForm = (r: any) => {
    setEditingRecId(r.id);
    setRecType(r.type); setRecAmount(formatMoneyInput(String(Math.round(r.amount))));
    setRecCategory(r.category); setRecDescription(r.description || '');
    setRecDay(String(r.day_of_month));
    setRecFormVisible(true);
  };

  const submitRecurring = async () => {
    if (!recAmount || !recCategory) {
      toast.show('Completá monto y categoría', 'error');
      return;
    }
    const day = Math.max(1, Math.min(28, parseInt(recDay, 10) || 1));
    const payload = {
      type: recType,
      amount: parseMoneyInput(recAmount),
      category: recCategory,
      description: recDescription,
      day_of_month: day,
    };
    try {
      if (editingRecId) {
        await api.updateRecurring(editingRecId, payload);
        toast.show('Recurrente actualizado', 'success');
      } else {
        await api.createRecurring(payload);
        toast.show('Recurrente creado — se generará automáticamente cada mes', 'success');
      }
      setRecFormVisible(false);
      loadRecurring();
      loadData();
    } catch (e) {
      toast.show('Error al guardar', 'error');
    }
  };

  const toggleRec = async (id: string) => {
    try {
      await api.toggleRecurring(id);
      loadRecurring();
    } catch (e) {
      toast.show('Error al actualizar', 'error');
    }
  };

  const deleteRec = async (id: string) => {
    try {
      await api.deleteRecurring(id);
      toast.show('Recurrente eliminado', 'success');
      loadRecurring();
    } catch (e) {
      toast.show('Error al eliminar', 'error');
    }
  };

  const toggleFilterType = (type: string) => {
    setFilterTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  };

  const toggleFilterCategory = (cat: string) => {
    setFilterCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  };

  const clearFilters = () => {
    setFilterTypes([]); setFilterCategories([]);
    setFilterDateFrom(null); setFilterDateTo(null);
    setFilterMinAmount(''); setFilterMaxAmount('');
  };

  const activeFilterCount =
    filterTypes.length + filterCategories.length +
    (filterDateFrom ? 1 : 0) + (filterDateTo ? 1 : 0) +
    (filterMinAmount ? 1 : 0) + (filterMaxAmount ? 1 : 0);

  const filteredTransactions = transactions.filter((t) => {
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const matches = t.category.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q);
      if (!matches) return false;
    }
    if (filterTypes.length > 0 && !filterTypes.includes(t.type)) return false;
    if (filterCategories.length > 0 && !filterCategories.includes(t.category)) return false;
    if (filterDateFrom) {
      const start = new Date(filterDateFrom); start.setHours(0, 0, 0, 0);
      if (new Date(t.date) < start) return false;
    }
    if (filterDateTo) {
      const end = new Date(filterDateTo); end.setHours(23, 59, 59, 999);
      if (new Date(t.date) > end) return false;
    }
    if (filterMinAmount && t.amount < parseMoneyInput(filterMinAmount)) return false;
    if (filterMaxAmount && t.amount > parseMoneyInput(filterMaxAmount)) return false;
    return true;
  });

  if (loading) {
    return <SafeAreaView style={styles.container}><View style={styles.loading}><Text style={styles.loadingText}>Cargando...</Text></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={toast.hide} duration={toast.duration} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Movimientos</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
          <TouchableOpacity style={styles.recurringHeaderBtn} onPress={() => setFiltersVisible(true)} testID="open-filters-button">
            <Ionicons name="filter" size={20} color={colors.textSecondary} />
            {activeFilterCount > 0 && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.recurringHeaderBtn} onPress={() => setRecurringModalVisible(true)} testID="open-recurring-button">
            <Ionicons name="repeat" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={openNewModal} testID="add-transaction-button">
            <Ionicons name="add" size={24} color={colors.textOnPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchBarWrap}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por categoría o descripción..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          testID="search-input"
        />
        {!!searchQuery && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {activeFilterCount > 0 && (
        <TouchableOpacity style={styles.clearFiltersRow} onPress={clearFilters} testID="clear-filters-inline">
          <Text style={styles.clearFiltersText}>{activeFilterCount} filtro{activeFilterCount > 1 ? 's' : ''} activo{activeFilterCount > 1 ? 's' : ''} · Limpiar</Text>
          <Ionicons name="close" size={14} color={colors.primary} />
        </TouchableOpacity>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {filteredTransactions.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyText}>
              {transactions.length === 0 ? 'No hay movimientos' : 'Sin resultados'}
            </Text>
            <Text style={styles.emptySubtext}>
              {transactions.length === 0 ? 'Tocá + para agregar el primero' : 'Probá con otra búsqueda o filtro'}
            </Text>
          </View>
        ) : (
          filteredTransactions.map((t) => {
            const cfg = getTypeConfig(t.type);
            return (
              <TouchableOpacity
                key={t.id}
                style={styles.txn}
                onPress={() => openEditModal(t)}
                testID={`transaction-${t.id}`}
              >
                <View style={[styles.txnIcon, { backgroundColor: `${cfg.color}20` }]}>
                  <Ionicons name={cfg.icon as any} size={22} color={cfg.color} />
                </View>
                <View style={styles.txnInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.txnCategory}>{t.category}</Text>
                    {t.is_recurring && <Ionicons name="repeat" size={13} color={colors.textMuted} />}
                  </View>
                  <Text style={styles.txnDesc}>{t.description || cfg.label}</Text>
                  <Text style={styles.txnDate}>{formatDate(new Date(t.date))}</Text>
                </View>
                <View style={styles.txnRight}>
                  <Text style={[styles.txnAmount, { color: cfg.color }]}>
                    {t.type === 'expense' ? '-' : '+'}
                    {formatCurrency(t.amount)}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleDelete(t.id)}
                    style={styles.deleteBtn}
                    testID={`delete-transaction-${t.id}`}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={toast.hide} duration={toast.duration} />
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modal}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Editar' : 'Nuevo'} Movimiento</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} testID="close-modal">
                <Ionicons name="close" size={26} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Type Selector */}
            <View style={styles.typeRow}>
              {(['expense', 'income', 'saving'] as const).map((t) => {
                const cfg = getTypeConfig(t);
                const active = selectedType === t;
                return (
                  <TouchableOpacity
                    key={t}
                    testID={`type-${t}`}
                    style={[
                      styles.typeBtn,
                      active && { backgroundColor: cfg.color, borderColor: cfg.color },
                    ]}
                    onPress={() => { setSelectedType(t); setSelectedCategory(''); }}
                  >
                    <Ionicons name={cfg.icon as any} size={16} color={active ? colors.textOnPrimary : cfg.color} />
                    <Text style={[styles.typeBtnText, active && { color: colors.textOnPrimary }]}>{cfg.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Amount */}
            <Text style={styles.label}>Monto (ARS)</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              value={amount}
              onChangeText={(v) => setAmount(formatMoneyInput(v))}
              testID="amount-input"
            />

            {/* Date */}
            <Text style={styles.label}>Fecha</Text>
            <TouchableOpacity
              style={styles.dateBtn}
              onPress={() => setShowDatePicker(true)}
              testID="date-picker-button"
            >
              <Ionicons name="calendar" size={18} color={colors.primary} />
              <Text style={styles.dateBtnText}>{formatDate(selectedDate)}</Text>
              <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date(new Date().setFullYear(new Date().getFullYear() + 1))}
                onChange={(event, date) => {
                  setShowDatePicker(Platform.OS === 'ios');
                  if (date) setSelectedDate(date);
                }}
                themeVariant="dark"
              />
            )}

            {/* Category */}
            <Text style={styles.label}>Categoría</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.md }}>
              {filteredCats.map((c) => {
                const active = selectedCategory === c.name;
                return (
                  <TouchableOpacity
                    key={c.category_id}
                    testID={`category-${c.name}`}
                    style={[
                      styles.catChip,
                      active && { backgroundColor: c.color, borderColor: c.color },
                    ]}
                    onPress={() => setSelectedCategory(c.name)}
                  >
                    <CategoryIcon icon={c.icon} size={14} color={active ? colors.textOnPrimary : c.color} />
                    <Text style={[styles.catChipText, active && { color: colors.textOnPrimary, fontWeight: '700' }]}>
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Description */}
            <Text style={styles.label}>Descripción (opcional)</Text>
            <TextInput
              style={[styles.input, { minHeight: 60 }]}
              placeholder="Nota..."
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              testID="description-input"
            />

            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} testID="submit-transaction">
              <Text style={styles.submitBtnText}>{editingId ? 'Actualizar' : 'Agregar'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal: lista de recurrentes */}
      <Modal visible={recurringModalVisible} animationType="slide" transparent onRequestClose={() => setRecurringModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={toast.hide} duration={toast.duration} />
          <View style={styles.recModal}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Recurrentes</Text>
              <TouchableOpacity onPress={() => setRecurringModalVisible(false)} testID="close-recurring-modal">
                <Ionicons name="close" size={26} color={colors.text} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.newRecBtn} onPress={openNewRecForm} testID="new-recurring-button">
              <Ionicons name="add-circle" size={20} color={colors.textOnPrimary} />
              <Text style={styles.newRecBtnText}>Nuevo recurrente</Text>
            </TouchableOpacity>

            <ScrollView style={{ marginTop: spacing.md }}>
              {recurringLoading ? (
                <Text style={styles.loadingText}>Cargando...</Text>
              ) : recurringList.length === 0 ? (
                <View style={styles.empty}>
                  <Ionicons name="repeat-outline" size={48} color={colors.textMuted} />
                  <Text style={styles.emptyText}>Sin recurrentes</Text>
                  <Text style={styles.emptySubtext}>Ideal para alquiler, suscripciones, sueldo fijo...</Text>
                </View>
              ) : (
                recurringList.map((r) => {
                  const cfg = getTypeConfig(r.type);
                  return (
                    <View key={r.id} style={[styles.recRow, !r.active && { opacity: 0.5 }]}>
                      <View style={[styles.txnIcon, { backgroundColor: `${cfg.color}20` }]}>
                        <Ionicons name={cfg.icon as any} size={20} color={cfg.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.txnCategory}>{r.category}</Text>
                        <Text style={styles.txnDesc}>
                          {r.description ? `${r.description} · ` : ''}Día {r.day_of_month} de cada mes
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
                        <Text style={[styles.txnAmount, { color: cfg.color, fontSize: fontSize.sm }]}>
                          {formatCurrency(r.amount)}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                          <TouchableOpacity onPress={() => toggleRec(r.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name={r.active ? 'pause-circle' : 'play-circle'} size={20} color={colors.textSecondary} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => openEditRecForm(r)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="pencil" size={18} color={colors.textSecondary} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => deleteRec(r.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Ionicons name="trash" size={18} color={colors.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Modal: alta/edición de un recurrente */}
      <Modal visible={recFormVisible} animationType="slide" transparent onRequestClose={() => setRecFormVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modal} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingRecId ? 'Editar' : 'Nuevo'} Recurrente</Text>
              <TouchableOpacity onPress={() => setRecFormVisible(false)} testID="close-rec-form">
                <Ionicons name="close" size={26} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.typeRow}>
              <TouchableOpacity style={[styles.typeBtn, recType === 'expense' && styles.typeBtnActiveExpense]} onPress={() => { setRecType('expense'); setRecCategory(''); }}>
                <Ionicons name="arrow-up-circle" size={18} color={recType === 'expense' ? colors.textOnPrimary : colors.danger} />
                <Text style={[styles.typeBtnText, recType === 'expense' && { color: colors.textOnPrimary }]}>Gasto</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.typeBtn, recType === 'income' && styles.typeBtnActiveIncome]} onPress={() => { setRecType('income'); setRecCategory(''); }}>
                <Ionicons name="arrow-down-circle" size={18} color={recType === 'income' ? colors.textOnPrimary : colors.success} />
                <Text style={[styles.typeBtnText, recType === 'income' && { color: colors.textOnPrimary }]}>Ingreso</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.typeBtn, recType === 'saving' && styles.typeBtnActiveSaving]} onPress={() => { setRecType('saving'); setRecCategory(''); }}>
                <Ionicons name="save" size={18} color={recType === 'saving' ? colors.textOnPrimary : colors.info} />
                <Text style={[styles.typeBtnText, recType === 'saving' && { color: colors.textOnPrimary }]}>Ahorro</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Monto (ARS)</Text>
            <TextInput style={styles.input} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={recAmount} onChangeText={(v) => setRecAmount(formatMoneyInput(v))} testID="rec-amount-input" />

            <Text style={styles.label}>Categoría</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {filteredRecCats.map((c) => {
                const active = recCategory === c.name;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.catChip, active && { backgroundColor: c.color, borderColor: c.color }]}
                    onPress={() => setRecCategory(c.name)}
                  >
                    <CategoryIcon icon={c.icon} size={14} color={active ? colors.textOnPrimary : c.color} />
                    <Text style={[styles.catChipText, active && { color: colors.textOnPrimary }]}>{c.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.label}>Descripción (opcional)</Text>
            <TextInput style={styles.input} placeholder="Alquiler, Netflix..." placeholderTextColor={colors.textMuted} value={recDescription} onChangeText={setRecDescription} testID="rec-description-input" />

            <Text style={styles.label}>Día del mes en que se repite</Text>
            <TextInput style={styles.input} placeholder="1" placeholderTextColor={colors.textMuted} keyboardType="number-pad" value={recDay} onChangeText={setRecDay} maxLength={2} testID="rec-day-input" />
            <Text style={styles.hint}>💡 Se va a generar solo cada mes cuando llegue ese día (no hace falta que abras la app justo ese día, se pone al día apenas entrás después)</Text>

            <TouchableOpacity style={styles.submitBtn} onPress={submitRecurring} testID="submit-rec-button">
              <Text style={styles.submitBtnText}>{editingRecId ? 'Actualizar' : 'Crear'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal: filtros */}
      <Modal visible={filtersVisible} animationType="slide" transparent onRequestClose={() => setFiltersVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modal} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filtros</Text>
              <TouchableOpacity onPress={() => setFiltersVisible(false)} testID="close-filters-modal">
                <Ionicons name="close" size={26} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Tipo</Text>
            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[styles.typeBtn, filterTypes.includes('expense') && styles.typeBtnActiveExpense]}
                onPress={() => toggleFilterType('expense')}
              >
                <Text style={[styles.typeBtnText, filterTypes.includes('expense') && { color: colors.textOnPrimary }]}>Gasto</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, filterTypes.includes('income') && styles.typeBtnActiveIncome]}
                onPress={() => toggleFilterType('income')}
              >
                <Text style={[styles.typeBtnText, filterTypes.includes('income') && { color: colors.textOnPrimary }]}>Ingreso</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, filterTypes.includes('saving') && styles.typeBtnActiveSaving]}
                onPress={() => toggleFilterType('saving')}
              >
                <Text style={[styles.typeBtnText, filterTypes.includes('saving') && { color: colors.textOnPrimary }]}>Ahorro</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Categorías</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {categories.map((c) => {
                const active = filterCategories.includes(c.name);
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.catChip, active && { backgroundColor: c.color, borderColor: c.color }]}
                    onPress={() => toggleFilterCategory(c.name)}
                  >
                    <CategoryIcon icon={c.icon} size={14} color={active ? colors.textOnPrimary : c.color} />
                    <Text style={[styles.catChipText, active && { color: colors.textOnPrimary }]}>{c.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={styles.label}>Rango de fechas</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TouchableOpacity style={[styles.dateBtn, { flex: 1 }]} onPress={() => setShowFilterDateFromPicker(true)} testID="filter-date-from-button">
                <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                <Text style={styles.dateBtnText}>{filterDateFrom ? filterDateFrom.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : 'Desde'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.dateBtn, { flex: 1 }]} onPress={() => setShowFilterDateToPicker(true)} testID="filter-date-to-button">
                <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                <Text style={styles.dateBtnText}>{filterDateTo ? filterDateTo.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) : 'Hasta'}</Text>
              </TouchableOpacity>
            </View>
            {showFilterDateFromPicker && (
              <DateTimePicker
                value={filterDateFrom || new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, date) => {
                  setShowFilterDateFromPicker(Platform.OS === 'ios');
                  if (date) setFilterDateFrom(date);
                }}
                themeVariant="dark"
              />
            )}
            {showFilterDateToPicker && (
              <DateTimePicker
                value={filterDateTo || new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, date) => {
                  setShowFilterDateToPicker(Platform.OS === 'ios');
                  if (date) setFilterDateTo(date);
                }}
                themeVariant="dark"
              />
            )}

            <Text style={styles.label}>Rango de monto (ARS)</Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Mínimo"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                value={filterMinAmount}
                onChangeText={(v) => setFilterMinAmount(formatMoneyInput(v))}
                testID="filter-min-amount"
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Máximo"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                value={filterMaxAmount}
                onChangeText={(v) => setFilterMaxAmount(formatMoneyInput(v))}
                testID="filter-max-amount"
              />
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={() => setFiltersVisible(false)} testID="apply-filters-button">
              <Text style={styles.submitBtnText}>Ver {filteredTransactions.length} resultado{filteredTransactions.length !== 1 ? 's' : ''}</Text>
            </TouchableOpacity>

            {activeFilterCount > 0 && (
              <TouchableOpacity style={styles.clearAllFiltersBtn} onPress={clearFilters} testID="clear-filters-button">
                <Text style={styles.clearAllFiltersBtnText}>Limpiar todos los filtros</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: colors.textSecondary, fontSize: fontSize.md },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  headerTitle: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.text },
  addBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  recurringHeaderBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bgElevated,
    borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center',
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3,
  },
  filterBadgeText: { color: colors.textOnPrimary, fontSize: 10, fontWeight: '800' },
  searchBarWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, marginHorizontal: spacing.md,
    marginBottom: spacing.sm, height: 44,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: fontSize.sm },
  clearFiltersRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    marginHorizontal: spacing.md, marginBottom: spacing.sm,
  },
  clearFiltersText: { color: colors.primary, fontSize: fontSize.xs, fontWeight: '600' },
  clearAllFiltersBtn: { alignItems: 'center', padding: spacing.md, marginTop: spacing.xs },
  clearAllFiltersBtnText: { color: colors.danger, fontSize: fontSize.sm, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md, paddingBottom: 40 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { color: colors.text, fontSize: fontSize.md, fontWeight: '600', marginTop: spacing.md },
  emptySubtext: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 4 },
  txn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bgCard, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  txnIcon: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center', marginRight: spacing.md,
  },
  txnInfo: { flex: 1 },
  txnCategory: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  txnDesc: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 },
  txnDate: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  txnRight: { alignItems: 'flex-end' },
  txnAmount: { fontSize: fontSize.md, fontWeight: '700', marginBottom: spacing.xs },
  deleteBtn: { padding: 4 },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalScroll: { maxHeight: '92%' },
  modal: {
    backgroundColor: colors.bgCard, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    padding: spacing.lg, paddingBottom: 40,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  typeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  typeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.sm + 2, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated,
    gap: spacing.xs,
  },
  typeBtnText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  label: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600', marginBottom: spacing.sm, marginTop: spacing.md },
  input: {
    backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.md,
    fontSize: fontSize.md, color: colors.text,
    borderWidth: 1, borderColor: colors.border,
  },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
  },
  dateBtnText: { flex: 1, color: colors.text, fontSize: fontSize.md, fontWeight: '500' },
  catChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.bgElevated, gap: spacing.xs, height: 36,
  },
  catChipText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '500' },
  submitBtn: {
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingVertical: spacing.md + 2, alignItems: 'center', marginTop: spacing.lg,
  },
  submitBtnText: { color: colors.textOnPrimary, fontSize: fontSize.md, fontWeight: '700' },

  // Recurrentes
  hint: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.xs },
  typeBtnActiveExpense: { backgroundColor: colors.danger, borderColor: colors.danger },
  typeBtnActiveIncome: { backgroundColor: colors.success, borderColor: colors.success },
  typeBtnActiveSaving: { backgroundColor: colors.info, borderColor: colors.info },
  recModal: {
    backgroundColor: colors.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.lg, maxHeight: '80%', minHeight: '45%',
  },
  newRecBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md,
  },
  newRecBtnText: { color: colors.textOnPrimary, fontSize: fontSize.sm, fontWeight: '700' },
  recRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
  },
});

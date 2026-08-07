import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { api } from '@/src/services/api';
import { colors, spacing, radius, fontSize } from '@/src/theme/colors';
import Toast from '@/src/components/Toast';
import { useToast } from '@/src/hooks/useToast';
import { useHideAmounts, maskAmount } from '@/src/hooks/useHideAmounts';
import { useAuth } from '@/src/contexts/AuthContext';
import { formatMoneyInput, parseMoneyInput } from '@/src/utils/currency';

export default function Investments() {
  const toast = useToast();
  const { token } = useAuth();
  const [investments, setInvestments] = useState<any[]>([]);
  const [totalStats, setTotalStats] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedType, setSelectedType] = useState<'crypto' | 'stock' | 'other'>('crypto');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [coinId, setCoinId] = useState<string | null>(null);
  const [priceUsdRef, setPriceUsdRef] = useState<number | null>(null);
  const [amountMode, setAmountMode] = useState<'quantity' | 'usd'>('quantity');
  const [usdAmount, setUsdAmount] = useState('');
  const [cryptoSearchQuery, setCryptoSearchQuery] = useState('');
  const [cryptoResults, setCryptoResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayCurrency, setDisplayCurrency] = useState<'ARS' | 'USD'>('ARS');

  const loadData = async () => {
    if (!token) return;
    try {
      const [invs, stats] = await Promise.all([
        api.getInvestments(), api.getInvestmentsTotal(),
      ]);
      setInvestments(invs);
      setTotalStats(stats);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { loadData(); }, [token]);
  useFocusEffect(useCallback(() => { loadData(); }, [token]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const openNew = () => {
    setEditingId(null); setSelectedType('crypto'); setName('');
    setQuantity(''); setPurchasePrice(''); setCurrentPrice('');
    setCoinId(null); setCryptoSearchQuery(''); setCryptoResults([]);
    setPriceUsdRef(null); setAmountMode('quantity'); setUsdAmount('');
    setModalVisible(true);
  };

  const openEdit = (inv: any) => {
    setEditingId(inv.id); setSelectedType(inv.type); setName(inv.name);
    setQuantity(String(inv.quantity)); setPurchasePrice(String(inv.purchase_price));
    setCurrentPrice(String(inv.current_price)); setCoinId(inv.coin_id || null);
    setCryptoSearchQuery(''); setCryptoResults([]);
    setPriceUsdRef(null); setAmountMode('quantity'); setUsdAmount('');
    setModalVisible(true);
  };

  const searchCrypto = async (q: string) => {
    setCryptoSearchQuery(q);
    if (q.length < 2) { setCryptoResults([]); return; }
    setSearching(true);
    try {
      const results = await api.searchCrypto(q);
      setCryptoResults(results);
    } catch { /* ignore */ }
    finally { setSearching(false); }
  };

  const selectCrypto = async (coin: any) => {
    setName(`${coin.name} (${coin.symbol})`);
    setCoinId(coin.id);
    setCryptoResults([]);
    setCryptoSearchQuery('');
    // Fetch current price
    try {
      const price = await api.getCryptoPrice(coin.id);
      setCurrentPrice(String(price.price_ars));
      if (!purchasePrice) setPurchasePrice(String(price.price_ars));
      setPriceUsdRef(price.price_usd || null);
      // Si ya había un monto en USD cargado, recalculamos la cantidad con el precio nuevo
      if (amountMode === 'usd' && usdAmount && price.price_usd) {
        const usd = parseFloat(usdAmount.replace(',', '.'));
        if (!isNaN(usd) && usd > 0) setQuantity(String(usd / price.price_usd));
      }
    } catch { /* ignore */ }
  };

  // Cuando el usuario ingresa el monto en USD, calculamos la cantidad de cripto sola
  const handleUsdAmountChange = (v: string) => {
    setUsdAmount(v);
    const usd = parseFloat(v.replace(',', '.'));
    if (!isNaN(usd) && usd > 0 && priceUsdRef) {
      setQuantity(String(usd / priceUsdRef));
    } else {
      setQuantity('');
    }
  };

  const handleSyncPrices = async () => {
    setSyncing(true);
    try {
      const result = await api.syncCryptoPrices();
      toast.show(`${result.updated} precios actualizados`, 'success');
      loadData();
    } catch { toast.show('Error al sincronizar', 'error'); }
    finally { setSyncing(false); }
  };

  const handleSubmit = async () => {
    if (!name || !quantity || !purchasePrice || (editingId && !currentPrice)) {
      toast.show('Completá todos los campos', 'error');
      return;
    }
    try {
      const parsedPurchase = parseMoneyInput(purchasePrice);
      const payload = {
        name, type: selectedType,
        quantity: parseFloat(quantity.replace(',', '.')),
        purchase_price: parsedPurchase,
        // Al crear, el precio actual arranca igual al de compra (se actualiza
        // después con el botón de sync, o editando manualmente).
        current_price: editingId ? parseMoneyInput(currentPrice) : parsedPurchase,
        coin_id: selectedType === 'crypto' ? coinId : null,
        date: new Date().toISOString(),
      };
      if (editingId) {
        await api.updateInvestment(editingId, payload);
        toast.show('Inversión actualizada', 'success');
      } else {
        await api.createInvestment(payload);
        toast.show('Inversión agregada', 'success');
      }
      setModalVisible(false);
      loadData();
    } catch { toast.show('Error al guardar', 'error'); }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteInvestment(id);
      toast.show('Inversión eliminada', 'success');
      loadData();
    } catch { toast.show('Error al eliminar', 'error'); }
  };

  const { hidden: hideAmounts, toggle: toggleHideAmounts } = useHideAmounts();
  const exchangeRate: number | undefined = totalStats?.exchange_rate_ars_usd;

  // Convierte un monto en ARS a la moneda de visualización actual (si hay tasa disponible).
  const toDisplay = (arsAmount: number) => {
    if (displayCurrency === 'USD' && exchangeRate) return arsAmount / exchangeRate;
    return arsAmount;
  };

  const fmt = (arsAmount: number) => {
    const value = toDisplay(arsAmount);
    const symbol = displayCurrency === 'USD' ? 'US$' : '$';
    const formatted = `${symbol}${value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return hideAmounts ? maskAmount(formatted) : formatted;
  };
  // Si el porcentaje es absurdo (ej: precio de compra guardado casi en 0),
  // mostramos un tope en vez de un número gigante ilegible.
  const formatPct = (p: number) => {
    const abs = Math.abs(p);
    if (abs > 9999) return '999,9%+';
    return `${p.toFixed(2)}%`;
  };

  const getTypeIcon = (t: string) => t === 'crypto' ? 'logo-bitcoin' : t === 'stock' ? 'trending-up' : 'wallet';
  const getTypeLabel = (t: string) => t === 'crypto' ? 'Crypto' : t === 'stock' ? 'Acción' : 'Otro';

  if (loading) return <SafeAreaView style={styles.container}><View style={styles.loading}><Text style={styles.loadingText}>Cargando...</Text></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={toast.hide} duration={toast.duration} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Inversiones</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <TouchableOpacity
            style={styles.syncBtn}
            onPress={handleSyncPrices}
            disabled={syncing}
            testID="sync-prices-button"
          >
            {syncing ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="refresh" size={20} color={colors.primary} />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={openNew} testID="add-investment-button">
            <Ionicons name="add" size={24} color={colors.textOnPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {totalStats && investments.length > 0 && (
          <View style={styles.summary}>
            <View style={styles.summaryLabelRow}>
              <Text style={styles.summaryLabel}>Valor Total del Portfolio</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                {!!exchangeRate && (
                  <TouchableOpacity
                    style={styles.currencyToggle}
                    onPress={() => setDisplayCurrency((c) => (c === 'ARS' ? 'USD' : 'ARS'))}
                    testID="toggle-display-currency"
                  >
                    <Text style={styles.currencyToggleText}>{displayCurrency}</Text>
                    <Ionicons name="swap-horizontal" size={14} color={colors.text} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={toggleHideAmounts}
                  testID="toggle-hide-amounts-investments"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={hideAmounts ? 'eye-off' : 'eye'}
                    size={20}
                    color={colors.text}
                  />
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.summaryAmount}>{fmt(totalStats.total_current_value)}</Text>
            <View style={styles.summaryRow}>
              <View>
                <Text style={styles.summaryStatLabel}>Invertido</Text>
                <Text style={styles.summaryStatValue}>{fmt(totalStats.total_invested)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.summaryStatLabel}>Ganancia/Pérdida</Text>
                <Text style={[styles.summaryStatValue, {
                  color: totalStats.profit_loss >= 0 ? colors.success : colors.danger,
                }]}>
                  {totalStats.profit_loss >= 0 ? '+' : ''}{fmt(totalStats.profit_loss)}
                </Text>
                <Text style={[styles.summaryStatPct, {
                  color: totalStats.profit_loss >= 0 ? colors.success : colors.danger,
                }]}>
                  {totalStats.profit_loss >= 0 ? '+' : ''}{formatPct(totalStats.profit_loss_percentage)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {investments.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="trending-up-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyText}>Sin inversiones aún</Text>
            <Text style={styles.emptySubtext}>Agregá cryptos, acciones u otras</Text>
          </View>
        ) : (
          investments.map((inv) => {
            const invested = inv.quantity * inv.purchase_price;
            const current = inv.quantity * inv.current_price;
            const profit = current - invested;
            const pct = invested > 0 ? (profit / invested) * 100 : 0;
            const isPos = profit >= 0;
            return (
              <TouchableOpacity
                key={inv.id}
                style={styles.invCard}
                onPress={() => openEdit(inv)}
                testID={`investment-${inv.id}`}
              >
                <View style={styles.invHeader}>
                  <View style={styles.invIcon}>
                    <Ionicons name={getTypeIcon(inv.type) as any} size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.invName}>{inv.name}</Text>
                    <Text style={styles.invType}>{getTypeLabel(inv.type)} · {inv.quantity}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDelete(inv.id)} testID={`delete-investment-${inv.id}`}>
                    <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
                <View style={styles.invBottom}>
                  <View>
                    <Text style={styles.invStatLabel}>Actual</Text>
                    <Text style={styles.invStatValue}>{fmt(current)}</Text>
                    {inv.type === 'crypto' && !!exchangeRate && !hideAmounts && (
                      <Text style={styles.invUsdPrice}>
                        1 {inv.name.split(' ')[0]} ≈ US${(inv.current_price / exchangeRate).toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.invBadge, { backgroundColor: isPos ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)' }]}>
                    <Ionicons name={isPos ? 'trending-up' : 'trending-down'} size={14} color={isPos ? colors.success : colors.danger} />
                    <Text style={[styles.invBadgeText, { color: isPos ? colors.success : colors.danger }]}>
                      {isPos ? '+' : ''}{formatPct(pct)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={toast.hide} duration={toast.duration} />
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modal} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Editar' : 'Nueva'} Inversión</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} testID="close-inv-modal">
                <Ionicons name="close" size={26} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.typeRow}>
              {(['crypto', 'stock', 'other'] as const).map((t) => {
                const active = selectedType === t;
                return (
                  <TouchableOpacity
                    key={t}
                    testID={`inv-type-${t}`}
                    style={[styles.typeBtn, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={() => setSelectedType(t)}
                  >
                    <Ionicons name={getTypeIcon(t) as any} size={16} color={active ? colors.textOnPrimary : colors.primary} />
                    <Text style={[styles.typeBtnText, active && { color: colors.textOnPrimary }]}>{getTypeLabel(t)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {selectedType === 'crypto' && !editingId && (
              <>
                <Text style={styles.label}>Buscar crypto (CoinGecko)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ej: Bitcoin, Ethereum..."
                  placeholderTextColor={colors.textMuted}
                  value={cryptoSearchQuery}
                  onChangeText={searchCrypto}
                  testID="crypto-search-input"
                />
                {searching && <ActivityIndicator style={{ marginTop: 8 }} color={colors.primary} />}
                {cryptoResults.length > 0 && (
                  <ScrollView style={styles.cryptoResults} nestedScrollEnabled>
                    {cryptoResults.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={styles.cryptoResult}
                        onPress={() => selectCrypto(c)}
                        testID={`crypto-result-${c.id}`}
                      >
                        <Text style={styles.cryptoResultName}>{c.name}</Text>
                        <Text style={styles.cryptoResultSym}>{c.symbol}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </>
            )}

            <Text style={styles.label}>Nombre</Text>
            <TextInput style={styles.input} placeholder="Bitcoin, Apple..." placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} testID="inv-name-input" />

            {selectedType === 'crypto' && !editingId && priceUsdRef && (
              <>
                <Text style={styles.label}>¿Cómo querés ingresarlo?</Text>
                <View style={styles.typeRow}>
                  <TouchableOpacity
                    style={[styles.typeBtn, amountMode === 'quantity' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={() => setAmountMode('quantity')}
                    testID="amount-mode-quantity"
                  >
                    <Text style={[styles.typeBtnText, amountMode === 'quantity' && { color: colors.textOnPrimary }]}>Por cantidad</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.typeBtn, amountMode === 'usd' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                    onPress={() => setAmountMode('usd')}
                    testID="amount-mode-usd"
                  >
                    <Text style={[styles.typeBtnText, amountMode === 'usd' && { color: colors.textOnPrimary }]}>Por monto en USD</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {amountMode === 'usd' && selectedType === 'crypto' && !editingId ? (
              <>
                <Text style={styles.label}>Monto invertido (USD)</Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={usdAmount} onChangeText={handleUsdAmountChange} testID="inv-usd-amount-input" />
                {!!quantity && (
                  <Text style={styles.hint}>≈ {quantity} {name.split(' ')[0] || 'unidades'}</Text>
                )}
              </>
            ) : (
              <>
                <Text style={styles.label}>Cantidad</Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={quantity} onChangeText={setQuantity} testID="inv-quantity-input" />
              </>
            )}

            <Text style={styles.label}>Precio de compra (ARS){amountMode === 'usd' ? ' — por unidad' : ''}</Text>
            <TextInput style={styles.input} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={purchasePrice} onChangeText={(v) => setPurchasePrice(formatMoneyInput(v))} testID="inv-purchase-input" />

            {editingId && (
              <>
                <Text style={styles.label}>Precio actual (ARS)</Text>
                <TextInput style={styles.input} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={currentPrice} onChangeText={(v) => setCurrentPrice(formatMoneyInput(v))} testID="inv-current-input" />
                {coinId && <Text style={styles.hint}>💡 Podés actualizar el precio automáticamente con el botón sync</Text>}
              </>
            )}
            {!editingId && (
              <Text style={styles.hint}>💡 El precio actual arranca igual al de compra. Después lo actualizás con el botón de sync o editando la inversión.</Text>
            )}

            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} testID="submit-investment">
              <Text style={styles.submitBtnText}>{editingId ? 'Actualizar' : 'Agregar'}</Text>
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
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  syncBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bgElevated, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md, paddingBottom: 40 },
  summary: { backgroundColor: colors.primary, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.md },
  summaryLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  currencyToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.15)', paddingHorizontal: spacing.sm, paddingVertical: 4,
    borderRadius: radius.full,
  },
  currencyToggleText: { color: colors.text, fontSize: fontSize.xs, fontWeight: '700' },
  summaryLabel: { color: colors.textOnPrimary, opacity: 0.75, fontSize: fontSize.sm, fontWeight: '600' },
  summaryAmount: { color: colors.textOnPrimary, fontSize: fontSize.xxxl, fontWeight: '800', marginVertical: spacing.sm },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  summaryStatLabel: { color: colors.textOnPrimary, opacity: 0.75, fontSize: fontSize.xs, fontWeight: '600' },
  summaryStatValue: { color: colors.textOnPrimary, fontSize: fontSize.md, fontWeight: '700', marginTop: 2 },
  summaryStatPct: { fontSize: fontSize.xs, fontWeight: '600', marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { color: colors.text, fontSize: fontSize.md, fontWeight: '600', marginTop: spacing.md },
  emptySubtext: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 4 },
  invCard: { backgroundColor: colors.bgCard, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  invHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  invIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(212,245,66,0.15)', justifyContent: 'center', alignItems: 'center' },
  invName: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  invType: { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 },
  invBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  invStatLabel: { color: colors.textSecondary, fontSize: fontSize.xs },
  invStatValue: { color: colors.text, fontSize: fontSize.md, fontWeight: '700', marginTop: 2 },
  invUsdPrice: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  invBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm + 2, paddingVertical: 4, borderRadius: radius.full },
  invBadgeText: { fontSize: fontSize.sm, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalScroll: { maxHeight: '92%' },
  modal: { backgroundColor: colors.bgCard, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  typeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  typeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm + 2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated, gap: spacing.xs },
  typeBtnText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  label: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600', marginBottom: spacing.sm, marginTop: spacing.md },
  input: { backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.md, fontSize: fontSize.md, color: colors.text, borderWidth: 1, borderColor: colors.border },
  hint: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 4 },
  cryptoResults: { maxHeight: 200, marginTop: spacing.sm, backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  cryptoResult: { flexDirection: 'row', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  cryptoResultName: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  cryptoResultSym: { color: colors.textSecondary, fontSize: fontSize.xs },
  submitBtn: { backgroundColor: colors.primary, borderRadius: radius.full, paddingVertical: spacing.md + 2, alignItems: 'center', marginTop: spacing.lg },
  submitBtnText: { color: colors.textOnPrimary, fontSize: fontSize.md, fontWeight: '700' },
});

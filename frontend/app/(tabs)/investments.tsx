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
import { useAuth } from '@/src/contexts/AuthContext';

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
  const [cryptoSearchQuery, setCryptoSearchQuery] = useState('');
  const [cryptoResults, setCryptoResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
    setModalVisible(true);
  };

  const openEdit = (inv: any) => {
    setEditingId(inv.id); setSelectedType(inv.type); setName(inv.name);
    setQuantity(String(inv.quantity)); setPurchasePrice(String(inv.purchase_price));
    setCurrentPrice(String(inv.current_price)); setCoinId(inv.coin_id || null);
    setCryptoSearchQuery(''); setCryptoResults([]);
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
    } catch { /* ignore */ }
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
    if (!name || !quantity || !purchasePrice || !currentPrice) {
      toast.show('Completá todos los campos', 'error');
      return;
    }
    try {
      const payload = {
        name, type: selectedType,
        quantity: parseFloat(quantity),
        purchase_price: parseFloat(purchasePrice),
        current_price: parseFloat(currentPrice),
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

  const fmt = (a: number) => `$${a.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const getTypeIcon = (t: string) => t === 'crypto' ? 'logo-bitcoin' : t === 'stock' ? 'trending-up' : 'wallet';
  const getTypeLabel = (t: string) => t === 'crypto' ? 'Crypto' : t === 'stock' ? 'Acción' : 'Otro';

  if (loading) return <SafeAreaView style={styles.container}><View style={styles.loading}><Text style={styles.loadingText}>Cargando...</Text></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={toast.hide} />

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
            <Text style={styles.summaryLabel}>Valor Total del Portfolio</Text>
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
                  {totalStats.profit_loss >= 0 ? '+' : ''}{totalStats.profit_loss_percentage.toFixed(2)}%
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
                  </View>
                  <View style={[styles.invBadge, { backgroundColor: isPos ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)' }]}>
                    <Ionicons name={isPos ? 'trending-up' : 'trending-down'} size={14} color={isPos ? colors.success : colors.danger} />
                    <Text style={[styles.invBadgeText, { color: isPos ? colors.success : colors.danger }]}>
                      {isPos ? '+' : ''}{pct.toFixed(2)}%
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
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

            <Text style={styles.label}>Cantidad</Text>
            <TextInput style={styles.input} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={quantity} onChangeText={setQuantity} testID="inv-quantity-input" />

            <Text style={styles.label}>Precio de compra (ARS)</Text>
            <TextInput style={styles.input} placeholder="0.00" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={purchasePrice} onChangeText={setPurchasePrice} testID="inv-purchase-input" />

            <Text style={styles.label}>Precio actual (ARS)</Text>
            <TextInput style={styles.input} placeholder="0.00" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={currentPrice} onChangeText={setCurrentPrice} testID="inv-current-input" />
            {coinId && <Text style={styles.hint}>💡 Podés actualizar el precio automáticamente con el botón sync</Text>}

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

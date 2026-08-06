import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart, BarChart } from 'react-native-gifted-charts';
import { useFocusEffect } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { api } from '@/src/services/api';
import { colors, spacing, radius, fontSize } from '@/src/theme/colors';
import Toast from '@/src/components/Toast';
import { useToast } from '@/src/hooks/useToast';
import { useAuth } from '@/src/contexts/AuthContext';

const { width } = Dimensions.get('window');

export default function Reports() {
  const toast = useToast();
  const { user, token } = useAuth();
  const [trends, setTrends] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [categoryColors, setCategoryColors] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    if (!token) return;
    try {
      const [t, e, d, cats] = await Promise.all([
        api.getTrends(6),
        api.getExpensesByCategory('month'),
        api.getDashboard('month'),
        api.getCategories('expense'),
      ]);
      setTrends(t); setExpenses(e); setDashboard(d);
      const colorMap: Record<string, string> = {};
      (cats || []).forEach((c: any) => { colorMap[c.name] = c.color; });
      setCategoryColors(colorMap);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { loadData(); }, [token]);
  useFocusEffect(useCallback(() => { loadData(); }, [token]));

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const fmt = (a: number) => {
    if (Math.abs(a) >= 1000000) return `$${(a / 1000000).toFixed(1)}M`;
    if (Math.abs(a) >= 1000) return `$${(a / 1000).toFixed(1)}K`;
    return `$${a.toFixed(0)}`;
  };
  const fmtFull = (a: number) => `$${a.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const trendData = trends.map((t) => ({
    value: t.balance, label: t.period.split(' ')[0],
  }));

  const FALLBACK_COLORS = ['#D4F542', '#F87171', '#FBBF24', '#A78BFA', '#60A5FA'];
  const expensesData = expenses.slice(0, 5).map((e, i) => {
    return {
      value: e.total,
      label: e.category.length > 8 ? e.category.substring(0, 8) : e.category,
      frontColor: categoryColors[e.category] || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
    };
  });

  const exportPDF = async () => {
    try {
      const html = `
        <html>
          <head><meta charset="utf-8"><style>
            body { font-family: -apple-system, sans-serif; padding: 24px; color: #111; }
            h1 { color: #0A0A0A; border-bottom: 3px solid #D4F542; padding-bottom: 12px; }
            h2 { color: #333; margin-top: 24px; }
            .summary { background: #f7f7f7; padding: 16px; border-radius: 12px; margin: 16px 0; }
            .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
            .row:last-child { border-bottom: none; }
            .amount { font-weight: bold; }
            .positive { color: #22c55e; }
            .negative { color: #ef4444; }
            .meta { color: #888; font-size: 12px; }
          </style></head>
          <body>
            <h1>Reporte Financiero</h1>
            <p class="meta">Usuario: ${user?.name || ''} · ${user?.email || ''}</p>
            <p class="meta">Generado: ${new Date().toLocaleString('es-AR')}</p>
            
            <h2>Resumen del Mes (${dashboard?.period || ''})</h2>
            <div class="summary">
              <div class="row"><span>Ingresos</span><span class="amount positive">${fmtFull(dashboard?.total_income || 0)}</span></div>
              <div class="row"><span>Gastos</span><span class="amount negative">${fmtFull(dashboard?.total_expenses || 0)}</span></div>
              <div class="row"><span>Ahorros</span><span class="amount">${fmtFull(dashboard?.total_savings || 0)}</span></div>
              <div class="row"><span>Inversiones</span><span class="amount">${fmtFull(dashboard?.total_investments || 0)}</span></div>
              <div class="row"><span><b>Balance</b></span><span class="amount ${(dashboard?.balance || 0) >= 0 ? 'positive' : 'negative'}"><b>${fmtFull(dashboard?.balance || 0)}</b></span></div>
            </div>

            <h2>Gastos por Categoría</h2>
            <div class="summary">
              ${expenses.map((e) => `
                <div class="row"><span>${e.category} (${e.percentage.toFixed(1)}%)</span><span class="amount">${fmtFull(e.total)}</span></div>
              `).join('')}
              ${expenses.length === 0 ? '<div>No hay gastos registrados</div>' : ''}
            </div>

            <h2>Tendencia (Últimos 6 meses)</h2>
            <div class="summary">
              ${trends.map((t) => `
                <div class="row"><span>${t.period}</span><span class="amount ${t.balance >= 0 ? 'positive' : 'negative'}">${fmtFull(t.balance)}</span></div>
              `).join('')}
            </div>
          </body>
        </html>
      `;
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Compartir Reporte' });
      } else {
        toast.show(`PDF guardado en ${uri}`, 'info');
      }
    } catch (e) {
      console.error(e);
      toast.show('Error al generar PDF', 'error');
    }
  };

  if (loading) return <SafeAreaView style={styles.container}><View style={styles.loading}><Text style={styles.loadingText}>Cargando...</Text></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={toast.hide} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reportes</Text>
        <TouchableOpacity style={styles.exportBtn} onPress={exportPDF} testID="export-pdf-button">
          <Ionicons name="share-outline" size={20} color={colors.textOnPrimary} />
          <Text style={styles.exportBtnText}>PDF</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {trends.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Tendencia de Balance</Text>
            <Text style={styles.cardSub}>Últimos 6 meses</Text>
            <View style={styles.chartWrap}>
              <LineChart
                data={trendData}
                width={width - 80}
                height={180}
                color={colors.primary}
                thickness={3}
                dataPointsColor={colors.primary}
                dataPointsRadius={5}
                yAxisTextStyle={{ fontSize: 9, color: colors.textSecondary }}
                xAxisLabelTextStyle={{ fontSize: 9, color: colors.textSecondary }}
                noOfSections={4}
                curved
                areaChart
                startFillColor={colors.primary}
                endFillColor={colors.primary}
                startOpacity={0.3}
                endOpacity={0.05}
                initialSpacing={20}
                spacing={45}
                yAxisColor={colors.border}
                xAxisColor={colors.border}
                rulesColor={colors.border}
              />
            </View>
          </View>
        )}

        {expenses.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Top Gastos por Categoría</Text>
            <View style={styles.chartWrap}>
              <BarChart
                data={expensesData}
                width={width - 80}
                height={180}
                barWidth={30}
                spacing={16}
                yAxisTextStyle={{ fontSize: 9, color: colors.textSecondary }}
                xAxisLabelTextStyle={{ fontSize: 9, color: colors.textSecondary }}
                noOfSections={4}
                initialSpacing={16}
                yAxisColor={colors.border}
                xAxisColor={colors.border}
                rulesColor={colors.border}
              />
            </View>
            <View style={styles.list}>
              {expenses.slice(0, 5).map((e, i) => (
                <View key={i} style={styles.listItem}>
                  <View style={[styles.rank, { backgroundColor: 'rgba(212,245,66,0.15)' }]}>
                    <Text style={styles.rankText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.listCat}>{e.category}</Text>
                  <Text style={styles.listAmount}>{fmt(e.total)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {trends.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Estadísticas</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statLbl}>Prom. Ingresos</Text>
                <Text style={styles.statVal}>{fmt(trends.reduce((s, t) => s + t.income, 0) / trends.length)}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLbl}>Prom. Gastos</Text>
                <Text style={styles.statVal}>{fmt(trends.reduce((s, t) => s + t.expenses, 0) / trends.length)}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLbl}>Mejor Mes</Text>
                <Text style={styles.statVal}>{trends.reduce((m, t) => t.balance > m.balance ? t : m, trends[0]).period}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLbl}>Balance Prom.</Text>
                <Text style={styles.statVal}>{fmt(trends.reduce((s, t) => s + t.balance, 0) / trends.length)}</Text>
              </View>
            </View>
          </View>
        )}

        {expenses.length === 0 && trends.every((t) => t.income === 0 && t.expenses === 0) && (
          <View style={styles.empty}>
            <Ionicons name="stats-chart-outline" size={64} color={colors.textMuted} />
            <Text style={styles.emptyText}>Sin datos suficientes</Text>
            <Text style={styles.emptySubtext}>Agregá movimientos para ver reportes</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: colors.textSecondary },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.md },
  headerTitle: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.text },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderRadius: radius.full },
  exportBtnText: { color: colors.textOnPrimary, fontSize: fontSize.sm, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md, paddingBottom: 40 },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  cardSub: { color: colors.textSecondary, fontSize: fontSize.xs, marginTop: 2 },
  chartWrap: { alignItems: 'center', marginTop: spacing.md },
  list: { marginTop: spacing.md, gap: spacing.sm },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rank: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  rankText: { color: colors.primary, fontSize: fontSize.xs, fontWeight: '700' },
  listCat: { flex: 1, color: colors.text, fontSize: fontSize.sm },
  listAmount: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  statBox: { flex: 1, minWidth: '45%', backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.md },
  statLbl: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '600' },
  statVal: { color: colors.text, fontSize: fontSize.md, fontWeight: '700', marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { color: colors.text, fontSize: fontSize.md, fontWeight: '600', marginTop: spacing.md },
  emptySubtext: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 4 },
});

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PieChart } from 'react-native-gifted-charts';
import { useRouter, useFocusEffect } from 'expo-router';
import { api } from '@/src/services/api';
import { useAuth } from '@/src/contexts/AuthContext';
import { colors, spacing, radius, fontSize } from '@/src/theme/colors';
import MonthPicker, { formatMonth } from '@/src/components/MonthPicker';
import Toast from '@/src/components/Toast';
import { useToast } from '@/src/hooks/useToast';
import { useHideAmounts, maskAmount } from '@/src/hooks/useHideAmounts';

const { width } = Dimensions.get('window');
const CHART_COLORS = ['#D4F542', '#F87171', '#FBBF24', '#A78BFA', '#60A5FA', '#F472B6', '#4ADE80'];

export default function Dashboard() {
  const router = useRouter();
  const { user, token } = useAuth();
  const toast = useToast();
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [expensesByCategory, setExpensesByCategory] = useState<any[]>([]);
  const [categoryColors, setCategoryColors] = useState<Record<string, string>>({});
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [monthPickerVisible, setMonthPickerVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    if (!token) return;
    try {
      const [dashboard, expenses, months, categories] = await Promise.all([
        api.getDashboard('month', selectedMonth),
        api.getExpensesByCategory('month', selectedMonth),
        api.getAvailableMonths(),
        api.getCategories('expense'),
      ]);
      setDashboardData(dashboard);
      setExpensesByCategory(expenses);
      setAvailableMonths(months);
      const colorMap: Record<string, string> = {};
      (categories || []).forEach((c: any) => { colorMap[c.name] = c.color; });
      setCategoryColors(colorMap);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedMonth, token]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [selectedMonth, token])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const { hidden: hideAmounts, toggle: toggleHideAmounts } = useHideAmounts();

  const formatCurrency = (amount: number) => {
    const formatted = `$${Math.abs(amount).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return hideAmounts ? maskAmount(formatted) : formatted;
  };

  const getCategoryColor = (categoryName: string, index: number) =>
    categoryColors[categoryName] || CHART_COLORS[index % CHART_COLORS.length];

  const chartData = expensesByCategory.slice(0, 6).map((item, index) => ({
    value: item.total,
    color: getCategoryColor(item.category, index),
    text: `${item.percentage.toFixed(0)}%`,
    textColor: colors.textOnPrimary,
    textSize: 11,
  }));

  const totalExpensesInChart = expensesByCategory.reduce((sum, e) => sum + e.total, 0);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Cargando...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={toast.hide} duration={toast.duration} />
      <MonthPicker
        visible={monthPickerVisible}
        months={availableMonths}
        selectedMonth={selectedMonth}
        onSelect={setSelectedMonth}
        onClose={() => setMonthPickerVisible(false)}
      />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerHi}>Hola, {user?.name?.split(' ')[0] || 'usuario'} 👋</Text>
          <Text style={styles.headerSubtitle}>Tu resumen financiero</Text>
        </View>
        <TouchableOpacity
          style={styles.settingsBtn}
          onPress={() => router.push('/settings')}
          testID="settings-button"
        >
          <Ionicons name="settings-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Month Selector */}
        <TouchableOpacity
          style={styles.monthSelector}
          onPress={() => setMonthPickerVisible(true)}
          testID="month-selector-button"
        >
          <Ionicons name="calendar" size={18} color={colors.primary} />
          <Text style={styles.monthSelectorText}>{formatMonth(selectedMonth, true)}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceLabelRow}>
            <Text style={styles.balanceLabel}>Balance del período</Text>
            <TouchableOpacity
              onPress={toggleHideAmounts}
              testID="toggle-hide-amounts"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={hideAmounts ? 'eye-off' : 'eye'}
                size={20}
                color={colors.textOnPrimary}
              />
            </TouchableOpacity>
          </View>
          <Text
            style={[
              styles.balanceAmount,
              { color: (dashboardData?.balance || 0) >= 0 ? colors.textOnPrimary : colors.danger },
            ]}
            testID="balance-amount"
          >
            {!hideAmounts && (dashboardData?.balance || 0) < 0 ? '-' : ''}
            {formatCurrency(dashboardData?.balance || 0)}
          </Text>
          <View style={styles.balanceRow}>
            <View style={styles.balanceItem}>
              <View style={styles.balanceItemIcon}>
                <Ionicons name="arrow-down" size={14} color={colors.success} />
              </View>
              <View>
                <Text style={styles.balanceItemLabel}>Ingresos</Text>
                <Text style={styles.balanceItemAmount}>
                  {formatCurrency(dashboardData?.total_income || 0)}
                </Text>
              </View>
            </View>
            <View style={styles.balanceItem}>
              <View style={[styles.balanceItemIcon, { backgroundColor: 'rgba(248,113,113,0.15)' }]}>
                <Ionicons name="arrow-up" size={14} color={colors.danger} />
              </View>
              <View>
                <Text style={styles.balanceItemLabel}>Gastos</Text>
                <Text style={styles.balanceItemAmount}>
                  {formatCurrency(dashboardData?.total_expenses || 0)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={styles.statIcon}>
              <Ionicons name="trending-up" size={20} color={colors.primary} />
            </View>
            <Text style={styles.statLabel}>Inversiones</Text>
            <Text style={styles.statValue} testID="investments-total">
              {formatCurrency(dashboardData?.total_investments || 0)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: 'rgba(74,222,128,0.15)' }]}>
              <Ionicons name="save" size={20} color={colors.success} />
            </View>
            <Text style={styles.statLabel}>Ahorros</Text>
            <Text style={styles.statValue}>
              {formatCurrency(dashboardData?.total_savings || 0)}
            </Text>
          </View>
        </View>

        {/* Expenses by Category */}
        {expensesByCategory.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Gastos por Categoría</Text>
            </View>
            <View style={styles.chartContainer}>
              <PieChart
                data={chartData}
                donut
                radius={90}
                innerRadius={55}
                showText
                textColor={colors.textOnPrimary}
                textSize={11}
                innerCircleColor={colors.bgCard}
                centerLabelComponent={() => (
                  <View style={styles.chartCenter}>
                    <Text style={styles.chartCenterLabel}>Total</Text>
                    <Text style={styles.chartCenterValue}>
                      {formatCurrency(totalExpensesInChart)}
                    </Text>
                  </View>
                )}
              />
            </View>
            <View style={styles.legend}>
              {expensesByCategory.slice(0, 6).map((item, index) => (
                <View key={item.category} style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendDot,
                      { backgroundColor: getCategoryColor(item.category, index) },
                    ]}
                  />
                  <Text style={styles.legendCategory}>{item.category}</Text>
                  <Text style={styles.legendAmount}>{formatCurrency(item.total)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {expensesByCategory.length === 0 && (
          <View style={styles.emptyCard}>
            <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>No hay gastos en este mes</Text>
            <Text style={styles.emptySubtext}>Agregá tu primer movimiento</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: fontSize.md, color: colors.textSecondary },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  headerHi: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text },
  headerSubtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  settingsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: { flex: 1 },
  scrollContent: { padding: spacing.md, paddingBottom: 40 },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  monthSelectorText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  balanceCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  balanceLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balanceLabel: { fontSize: fontSize.sm, color: colors.textOnPrimary, opacity: 0.75, fontWeight: '600' },
  balanceAmount: { fontSize: fontSize.display, fontWeight: '800', marginTop: spacing.xs, marginBottom: spacing.md, color: colors.textOnPrimary },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  balanceItem: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: spacing.sm },
  balanceItemIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(74,222,128,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceItemLabel: { fontSize: fontSize.xs, color: colors.textOnPrimary, opacity: 0.75, fontWeight: '600' },
  balanceItemAmount: { fontSize: fontSize.md, fontWeight: '700', color: colors.textOnPrimary, marginTop: 1 },
  statsGrid: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  statCard: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(212,245,66,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statLabel: { fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: '600' },
  statValue: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text, marginTop: 2 },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { marginBottom: spacing.md },
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.text },
  chartContainer: { alignItems: 'center', marginVertical: spacing.sm },
  chartCenter: { justifyContent: 'center', alignItems: 'center' },
  chartCenterLabel: { fontSize: fontSize.xs, color: colors.textSecondary },
  chartCenterValue: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text, marginTop: 2 },
  legend: { marginTop: spacing.md, gap: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  legendCategory: { flex: 1, color: colors.text, fontSize: fontSize.sm },
  legendAmount: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600' },
  emptyCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: { color: colors.text, fontSize: fontSize.md, fontWeight: '600', marginTop: spacing.md },
  emptySubtext: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 4 },
});

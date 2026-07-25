import React, { useEffect, useState } from 'react';
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
import { VictoryPie } from 'victory-native';
import { api } from '@/src/services/api';
import { useFinanceStore } from '@/src/store/financeStore';

const { width } = Dimensions.get('window');

export default function Dashboard() {
  const { dashboardData, setDashboardData, selectedPeriod, setSelectedPeriod } = useFinanceStore();
  const [expensesByCategory, setExpensesByCategory] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const [dashboard, expenses] = await Promise.all([
        api.getDashboard(selectedPeriod),
        api.getExpensesByCategory(selectedPeriod),
      ]);
      setDashboardData(dashboard);
      setExpensesByCategory(expenses);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedPeriod]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const periods = [
    { key: 'day', label: 'Día' },
    { key: 'week', label: 'Semana' },
    { key: 'month', label: 'Mes' },
  ];

  const chartData = expensesByCategory.slice(0, 5).map((item, index) => ({
    x: item.category,
    y: item.total,
    color: ['#EF4444', '#F59E0B', '#8B5CF6', '#EC4899', '#10B981'][index] || '#6B7280',
  }));

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
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Mi Economía</Text>
          <Text style={styles.headerSubtitle}>{dashboardData?.period || ''}</Text>
        </View>

        {/* Period Selector */}
        <View style={styles.periodSelector}>
          {periods.map((period) => (
            <TouchableOpacity
              key={period.key}
              style={[
                styles.periodButton,
                selectedPeriod === period.key && styles.periodButtonActive,
              ]}
              onPress={() => setSelectedPeriod(period.key as any)}
            >
              <Text
                style={[
                  styles.periodButtonText,
                  selectedPeriod === period.key && styles.periodButtonTextActive,
                ]}
              >
                {period.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceHeader}>
            <Ionicons name="wallet" size={24} color="#FFFFFF" />
            <Text style={styles.balanceLabel}>Balance Total</Text>
          </View>
          <Text style={styles.balanceAmount}>
            {formatCurrency(dashboardData?.balance || 0)}
          </Text>
          <View style={styles.balanceRow}>
            <View style={styles.balanceItem}>
              <Ionicons name="arrow-down" size={16} color="#10B981" />
              <Text style={styles.balanceItemLabel}>Ingresos</Text>
              <Text style={styles.balanceItemAmount}>
                {formatCurrency(dashboardData?.total_income || 0)}
              </Text>
            </View>
            <View style={styles.balanceItem}>
              <Ionicons name="arrow-up" size={16} color="#EF4444" />
              <Text style={styles.balanceItemLabel}>Gastos</Text>
              <Text style={styles.balanceItemAmount}>
                {formatCurrency(dashboardData?.total_expenses || 0)}
              </Text>
            </View>
          </View>
        </View>

        {/* Investments Summary */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="trending-up" size={20} color="#6366F1" />
            <Text style={styles.cardTitle}>Inversiones</Text>
          </View>
          <Text style={styles.investmentAmount}>
            {formatCurrency(dashboardData?.total_investments || 0)}
          </Text>
          <Text style={styles.investmentLabel}>Valor actual del portfolio</Text>
        </View>

        {/* Expenses by Category */}
        {expensesByCategory.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="pie-chart" size={20} color="#6366F1" />
              <Text style={styles.cardTitle}>Gastos por Categoría</Text>
            </View>
            <View style={styles.chartContainer}>
              <VictoryPie
                data={chartData}
                width={width - 80}
                height={200}
                colorScale={chartData.map((d) => d.color)}
                innerRadius={50}
                labelRadius={70}
                style={{
                  labels: { fontSize: 12, fill: '#374151', fontWeight: 'bold' },
                }}
              />
            </View>
            <View style={styles.legendContainer}>
              {expensesByCategory.slice(0, 5).map((item, index) => (
                <View key={item.category} style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendDot,
                      { backgroundColor: chartData[index]?.color || '#6B7280' },
                    ]}
                  />
                  <Text style={styles.legendText}>{item.category}</Text>
                  <Text style={styles.legendAmount}>{formatCurrency(item.total)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Savings */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="save" size={20} color="#6366F1" />
            <Text style={styles.cardTitle}>Ahorros</Text>
          </View>
          <Text style={styles.savingsAmount}>
            {formatCurrency(dashboardData?.total_savings || 0)}
          </Text>
          <Text style={styles.savingsLabel}>Total ahorrado</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: '#6366F1',
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  periodButtonTextActive: {
    color: '#FFFFFF',
  },
  balanceCard: {
    backgroundColor: '#6366F1',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
  },
  balanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  balanceLabel: {
    fontSize: 16,
    color: '#E0E7FF',
    marginLeft: 8,
  },
  balanceAmount: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  balanceItem: {
    flex: 1,
    alignItems: 'flex-start',
  },
  balanceItemLabel: {
    fontSize: 14,
    color: '#E0E7FF',
    marginTop: 4,
  },
  balanceItemAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginLeft: 8,
  },
  investmentAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#10B981',
    marginBottom: 4,
  },
  investmentLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  chartContainer: {
    alignItems: 'center',
    marginVertical: 8,
  },
  legendContainer: {
    marginTop: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  legendText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
  },
  legendAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  savingsAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#8B5CF6',
    marginBottom: 4,
  },
  savingsLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
});
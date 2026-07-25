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
import { VictoryChart, VictoryBar, VictoryTheme, VictoryAxis, VictoryLine } from 'victory-native';
import { api } from '@/src/services/api';
import { useFinanceStore } from '@/src/store/financeStore';

const { width } = Dimensions.get('window');

export default function Reports() {
  const { selectedPeriod, setSelectedPeriod } = useFinanceStore();
  const [trends, setTrends] = useState<any[]>([]);
  const [expensesByCategory, setExpensesByCategory] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const [trendsData, expensesData] = await Promise.all([
        api.getTrends('month', 6),
        api.getExpensesByCategory(selectedPeriod),
      ]);
      setTrends(trendsData);
      setExpensesByCategory(expensesData);
    } catch (error) {
      console.error('Error loading reports:', error);
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
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    }
    if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(1)}K`;
    }
    return `$${amount.toFixed(0)}`;
  };

  const periods = [
    { key: 'day', label: 'Día' },
    { key: 'week', label: 'Semana' },
    { key: 'month', label: 'Mes' },
  ];

  const trendChartData = trends.map((item) => ({
    x: item.period,
    y: item.balance,
  }));

  const expensesChartData = expensesByCategory.slice(0, 5).map((item) => ({
    x: item.category,
    y: item.total,
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
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reportes</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
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

        {/* Trends Chart */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="trending-up" size={20} color="#6366F1" />
            <Text style={styles.cardTitle}>Tendencia de Balance (últimos 6 meses)</Text>
          </View>
          {trends.length > 0 ? (
            <VictoryChart
              theme={VictoryTheme.material}
              width={width - 64}
              height={250}
              domainPadding={{ x: 20 }}
            >
              <VictoryAxis
                style={{
                  tickLabels: { fontSize: 10, angle: -45, textAnchor: 'end' },
                }}
              />
              <VictoryAxis
                dependentAxis
                tickFormat={(value) => formatCurrency(value)}
                style={{
                  tickLabels: { fontSize: 10 },
                }}
              />
              <VictoryLine
                data={trendChartData}
                style={{
                  data: { stroke: '#6366F1', strokeWidth: 3 },
                }}
              />
            </VictoryChart>
          ) : (
            <Text style={styles.noDataText}>No hay datos suficientes</Text>
          )}
        </View>

        {/* Top Expenses by Category */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="bar-chart" size={20} color="#6366F1" />
            <Text style={styles.cardTitle}>Top Gastos por Categoría</Text>
          </View>
          {expensesByCategory.length > 0 ? (
            <>
              <VictoryChart
                theme={VictoryTheme.material}
                width={width - 64}
                height={250}
                domainPadding={{ x: 30 }}
              >
                <VictoryAxis
                  style={{
                    tickLabels: { fontSize: 10, angle: -45, textAnchor: 'end' },
                  }}
                />
                <VictoryAxis
                  dependentAxis
                  tickFormat={(value) => formatCurrency(value)}
                  style={{
                    tickLabels: { fontSize: 10 },
                  }}
                />
                <VictoryBar
                  data={expensesChartData}
                  style={{
                    data: { fill: '#EF4444' },
                  }}
                />
              </VictoryChart>
              <View style={styles.expensesList}>
                {expensesByCategory.slice(0, 5).map((item, index) => (
                  <View key={index} style={styles.expenseItem}>
                    <View style={styles.expenseRank}>
                      <Text style={styles.expenseRankText}>{index + 1}</Text>
                    </View>
                    <View style={styles.expenseInfo}>
                      <Text style={styles.expenseName}>{item.category}</Text>
                      <View style={styles.expenseBar}>
                        <View
                          style={[
                            styles.expenseBarFill,
                            { width: `${item.percentage}%` },
                          ]}
                        />
                      </View>
                    </View>
                    <View style={styles.expenseAmount}>
                      <Text style={styles.expenseValue}>
                        {formatCurrency(item.total).replace('K', 'k').replace('M', 'm')}
                      </Text>
                      <Text style={styles.expensePercentage}>{item.percentage.toFixed(0)}%</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Text style={styles.noDataText}>No hay gastos en este período</Text>
          )}
        </View>

        {/* Income vs Expenses Comparison */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="swap-vertical" size={20} color="#6366F1" />
            <Text style={styles.cardTitle}>Comparativa Mensual</Text>
          </View>
          {trends.length > 0 ? (
            <>
              <VictoryChart
                theme={VictoryTheme.material}
                width={width - 64}
                height={250}
                domainPadding={{ x: 20 }}
              >
                <VictoryAxis
                  style={{
                    tickLabels: { fontSize: 10, angle: -45, textAnchor: 'end' },
                  }}
                />
                <VictoryAxis
                  dependentAxis
                  tickFormat={(value) => formatCurrency(value)}
                  style={{
                    tickLabels: { fontSize: 10 },
                  }}
                />
                <VictoryBar
                  data={trends.map((item) => ({ x: item.period, y: item.income }))}
                  style={{ data: { fill: '#10B981' } }}
                />
                <VictoryBar
                  data={trends.map((item) => ({ x: item.period, y: item.expenses }))}
                  style={{ data: { fill: '#EF4444' } }}
                />
              </VictoryChart>
              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
                  <Text style={styles.legendText}>Ingresos</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
                  <Text style={styles.legendText}>Gastos</Text>
                </View>
              </View>
            </>
          ) : (
            <Text style={styles.noDataText}>No hay datos suficientes</Text>
          )}
        </View>

        {/* Summary Statistics */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="analytics" size={20} color="#6366F1" />
            <Text style={styles.cardTitle}>Estadísticas del Período</Text>
          </View>
          {trends.length > 0 && (
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Promedio Ingresos</Text>
                <Text style={styles.statValue}>
                  {formatCurrency(
                    trends.reduce((sum, t) => sum + t.income, 0) / trends.length
                  )}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Promedio Gastos</Text>
                <Text style={styles.statValue}>
                  {formatCurrency(
                    trends.reduce((sum, t) => sum + t.expenses, 0) / trends.length
                  )}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Mejor Mes</Text>
                <Text style={styles.statValue}>
                  {trends.reduce((max, t) => (t.balance > max.balance ? t : max), trends[0])
                    .period}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Balance Promedio</Text>
                <Text style={styles.statValue}>
                  {formatCurrency(
                    trends.reduce((sum, t) => sum + t.balance, 0) / trends.length
                  )}
                </Text>
              </View>
            </View>
          )}
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
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
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
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
    marginLeft: 8,
  },
  noDataText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingVertical: 32,
  },
  expensesList: {
    marginTop: 16,
  },
  expenseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  expenseRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  expenseRankText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#6366F1',
  },
  expenseInfo: {
    flex: 1,
    marginRight: 12,
  },
  expenseName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  expenseBar: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
  },
  expenseBarFill: {
    height: '100%',
    backgroundColor: '#EF4444',
    borderRadius: 2,
  },
  expenseAmount: {
    alignItems: 'flex-end',
  },
  expenseValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111827',
  },
  expensePercentage: {
    fontSize: 12,
    color: '#6B7280',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
    gap: 24,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  legendText: {
    fontSize: 14,
    color: '#374151',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 16,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
});
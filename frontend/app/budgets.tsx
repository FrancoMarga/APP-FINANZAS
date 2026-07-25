import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/src/services/api';

interface Budget {
  _id: string;
  category: string;
  monthly_limit: number;
  current_spent: number;
  alert_threshold: number;
  month: string;
}

interface Category {
  _id: string;
  name: string;
  type: string;
}

export default function Budgets() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [alertThreshold, setAlertThreshold] = useState('80');
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const [budgetsData, categoriesData, alertsData] = await Promise.all([
        api.getBudgets(currentMonth),
        api.getCategories('expense'),
        api.getBudgetAlerts(),
      ]);
      setBudgets(budgetsData);
      setCategories(categoriesData);
      setAlerts(alertsData);
    } catch (error) {
      console.error('Error loading budgets:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleAddBudget = async () => {
    if (!selectedCategory || !monthlyLimit) {
      Alert.alert('Error', 'Por favor completa todos los campos');
      return;
    }

    const currentMonth = new Date().toISOString().slice(0, 7);

    try {
      await api.createBudget({
        category: selectedCategory,
        monthly_limit: parseFloat(monthlyLimit),
        alert_threshold: parseFloat(alertThreshold),
        month: currentMonth,
      });
      setModalVisible(false);
      setSelectedCategory('');
      setMonthlyLimit('');
      setAlertThreshold('80');
      loadData();
    } catch (error: any) {
      console.error('Error creating budget:', error);
      Alert.alert('Error', error.message || 'No se pudo crear el presupuesto');
    }
  };

  const handleDeleteBudget = async (id: string) => {
    Alert.alert(
      'Eliminar Presupuesto',
      '¿Estás seguro de que quieres eliminar este presupuesto?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteBudget(id);
              loadData();
            } catch (error) {
              console.error('Error deleting budget:', error);
              Alert.alert('Error', 'No se pudo eliminar el presupuesto');
            }
          },
        },
      ]
    );
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const calculatePercentage = (budget: Budget) => {
    return (budget.current_spent / budget.monthly_limit) * 100;
  };

  const getProgressColor = (percentage: number, threshold: number) => {
    if (percentage >= 100) return '#EF4444';
    if (percentage >= threshold) return '#F59E0B';
    return '#10B981';
  };

  const availableCategories = categories.filter(
    (cat) => !budgets.some((b) => b.category === cat.name)
  );

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
        <Text style={styles.headerTitle}>Presupuestos</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Alerts Section */}
        {alerts.length > 0 && (
          <View style={styles.alertsContainer}>
            <View style={styles.alertsHeader}>
              <Ionicons name="warning" size={20} color="#F59E0B" />
              <Text style={styles.alertsTitle}>Alertas de Presupuesto</Text>
            </View>
            {alerts.map((alert, index) => (
              <View key={index} style={styles.alertCard}>
                <Text style={styles.alertCategory}>{alert.category}</Text>
                <Text style={styles.alertText}>
                  Has gastado {formatCurrency(alert.spent)} de {formatCurrency(alert.limit)}
                </Text>
                <Text style={styles.alertPercentage}>{alert.percentage.toFixed(0)}% utilizado</Text>
              </View>
            ))}
          </View>
        )}

        {/* Budgets List */}
        {budgets.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="pie-chart-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>No hay presupuestos</Text>
            <Text style={styles.emptySubtext}>Crea tu primer presupuesto mensual</Text>
          </View>
        ) : (
          budgets.map((budget) => {
            const percentage = calculatePercentage(budget);
            const color = getProgressColor(percentage, budget.alert_threshold);
            const remaining = budget.monthly_limit - budget.current_spent;

            return (
              <View key={budget._id} style={styles.budgetCard}>
                <View style={styles.budgetHeader}>
                  <View style={styles.budgetInfo}>
                    <Text style={styles.budgetCategory}>{budget.category}</Text>
                    <Text style={styles.budgetMonth}>
                      {new Date(budget.month + '-01').toLocaleDateString('es-AR', {
                        month: 'long',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDeleteBudget(budget._id)}
                    style={styles.deleteButton}
                  >
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>

                <View style={styles.budgetAmounts}>
                  <View style={styles.amountItem}>
                    <Text style={styles.amountLabel}>Gastado</Text>
                    <Text style={[styles.amountValue, { color }]}>
                      {formatCurrency(budget.current_spent)}
                    </Text>
                  </View>
                  <View style={styles.amountItem}>
                    <Text style={styles.amountLabel}>Límite</Text>
                    <Text style={styles.amountValue}>
                      {formatCurrency(budget.monthly_limit)}
                    </Text>
                  </View>
                  <View style={styles.amountItem}>
                    <Text style={styles.amountLabel}>Disponible</Text>
                    <Text style={[styles.amountValue, { color: remaining >= 0 ? '#10B981' : '#EF4444' }]}>
                      {formatCurrency(Math.abs(remaining))}
                    </Text>
                  </View>
                </View>

                <View style={styles.progressContainer}>
                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.min(percentage, 100)}%`,
                          backgroundColor: color,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.progressText, { color }]}>
                    {percentage.toFixed(0)}%
                  </Text>
                </View>

                {percentage >= budget.alert_threshold && (
                  <View style={styles.warningBadge}>
                    <Ionicons name="warning" size={14} color="#F59E0B" />
                    <Text style={styles.warningText}>
                      {percentage >= 100
                        ? 'Presupuesto excedido'
                        : 'Cerca del límite'}
                    </Text>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nuevo Presupuesto</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Categoría</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.categoryList}>
                  {availableCategories.map((cat) => (
                    <TouchableOpacity
                      key={cat._id}
                      style={[
                        styles.categoryButton,
                        selectedCategory === cat.name && styles.categoryButtonActive,
                      ]}
                      onPress={() => setSelectedCategory(cat.name)}
                    >
                      <Text
                        style={[
                          styles.categoryButtonText,
                          selectedCategory === cat.name && styles.categoryButtonTextActive,
                        ]}
                      >
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Límite Mensual (ARS)</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                keyboardType="decimal-pad"
                value={monthlyLimit}
                onChangeText={setMonthlyLimit}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Umbral de Alerta (%)</Text>
              <TextInput
                style={styles.input}
                placeholder="80"
                keyboardType="number-pad"
                value={alertThreshold}
                onChangeText={setAlertThreshold}
              />
              <Text style={styles.inputHelp}>
                Recibirás una alerta cuando alcances este porcentaje del límite
              </Text>
            </View>

            <TouchableOpacity style={styles.submitButton} onPress={handleAddBudget}>
              <Text style={styles.submitButtonText}>Crear Presupuesto</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  addButton: {
    backgroundColor: '#6366F1',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
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
  alertsContainer: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  alertsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  alertsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#92400E',
    marginLeft: 8,
  },
  alertCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  alertCategory: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  alertText: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 2,
  },
  alertPercentage: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F59E0B',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
  budgetCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  budgetInfo: {
    flex: 1,
  },
  budgetCategory: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 2,
  },
  budgetMonth: {
    fontSize: 14,
    color: '#6B7280',
    textTransform: 'capitalize',
  },
  deleteButton: {
    padding: 8,
  },
  budgetAmounts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  amountItem: {
    flex: 1,
    alignItems: 'center',
  },
  amountLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    marginRight: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    fontWeight: 'bold',
    width: 45,
    textAlign: 'right',
  },
  warningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  warningText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400E',
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#111827',
  },
  inputHelp: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  categoryList: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  categoryButtonActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  categoryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  categoryButtonTextActive: {
    color: '#FFFFFF',
  },
  submitButton: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
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
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Investment {
  _id: string;
  name: string;
  type: 'crypto' | 'stock' | 'other';
  quantity: number;
  purchase_price: number;
  current_price: number;
  date: string;
}

export default function Investments() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [totalStats, setTotalStats] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedType, setSelectedType] = useState<'crypto' | 'stock' | 'other'>('crypto');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const [investmentsData, stats] = await Promise.all([
        api.getInvestments(),
        api.getInvestmentsTotal(),
      ]);
      setInvestments(investmentsData);
      setTotalStats(stats);
    } catch (error) {
      console.error('Error loading investments:', error);
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

  const handleAddInvestment = async () => {
    if (!name || !quantity || !purchasePrice || !currentPrice) {
      Alert.alert('Error', 'Por favor completa todos los campos');
      return;
    }

    try {
      await api.createInvestment({
        name,
        type: selectedType,
        quantity: parseFloat(quantity),
        purchase_price: parseFloat(purchasePrice),
        current_price: parseFloat(currentPrice),
        date: new Date().toISOString(),
      });
      setModalVisible(false);
      setName('');
      setQuantity('');
      setPurchasePrice('');
      setCurrentPrice('');
      loadData();
    } catch (error) {
      console.error('Error creating investment:', error);
      Alert.alert('Error', 'No se pudo crear la inversión');
    }
  };

  const handleDeleteInvestment = async (id: string) => {
    Alert.alert(
      'Eliminar Inversión',
      '¿Estás seguro de que quieres eliminar esta inversión?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteInvestment(id);
              loadData();
            } catch (error) {
              console.error('Error deleting investment:', error);
              Alert.alert('Error', 'No se pudo eliminar la inversión');
            }
          },
        },
      ]
    );
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'crypto':
        return 'Crypto';
      case 'stock':
        return 'Acción';
      case 'other':
        return 'Otro';
      default:
        return type;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'crypto':
        return 'logo-bitcoin';
      case 'stock':
        return 'trending-up';
      case 'other':
        return 'wallet';
      default:
        return 'cash';
    }
  };

  const calculateProfit = (investment: Investment) => {
    const invested = investment.quantity * investment.purchase_price;
    const current = investment.quantity * investment.current_price;
    return current - invested;
  };

  const calculateProfitPercentage = (investment: Investment) => {
    const invested = investment.quantity * investment.purchase_price;
    const profit = calculateProfit(investment);
    return invested > 0 ? (profit / invested) * 100 : 0;
  };

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
        <Text style={styles.headerTitle}>Inversiones</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Ionicons name="add" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Summary Card */}
        {totalStats && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <Ionicons name="trending-up" size={24} color="#FFFFFF" />
              <Text style={styles.summaryLabel}>Portfolio Total</Text>
            </View>
            <Text style={styles.summaryAmount}>
              {formatCurrency(totalStats.total_current_value)}
            </Text>
            <View style={styles.summaryStats}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Invertido</Text>
                <Text style={styles.statValue}>
                  {formatCurrency(totalStats.total_invested)}
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Ganancia/Pérdida</Text>
                <Text
                  style={[
                    styles.statValue,
                    { color: totalStats.profit_loss >= 0 ? '#10B981' : '#EF4444' },
                  ]}
                >
                  {totalStats.profit_loss >= 0 ? '+' : ''}
                  {formatCurrency(totalStats.profit_loss)}
                </Text>
                <Text
                  style={[
                    styles.statPercentage,
                    { color: totalStats.profit_loss >= 0 ? '#10B981' : '#EF4444' },
                  ]}
                >
                  {totalStats.profit_loss >= 0 ? '+' : ''}
                  {totalStats.profit_loss_percentage.toFixed(2)}%
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Investments List */}
        {investments.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="trending-up-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>No hay inversiones</Text>
            <Text style={styles.emptySubtext}>Agrega tu primera inversión</Text>
          </View>
        ) : (
          investments.map((investment) => {
            const profit = calculateProfit(investment);
            const profitPercentage = calculateProfitPercentage(investment);
            const isPositive = profit >= 0;

            return (
              <View key={investment._id} style={styles.investmentCard}>
                <View style={styles.investmentHeader}>
                  <View style={styles.investmentIcon}>
                    <Ionicons
                      name={getTypeIcon(investment.type)}
                      size={24}
                      color="#6366F1"
                    />
                  </View>
                  <View style={styles.investmentInfo}>
                    <Text style={styles.investmentName}>{investment.name}</Text>
                    <Text style={styles.investmentType}>{getTypeLabel(investment.type)}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDeleteInvestment(investment._id)}
                    style={styles.deleteButton}
                  >
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>

                <View style={styles.investmentDetails}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Cantidad:</Text>
                    <Text style={styles.detailValue}>{investment.quantity}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Precio compra:</Text>
                    <Text style={styles.detailValue}>
                      {formatCurrency(investment.purchase_price)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Precio actual:</Text>
                    <Text style={styles.detailValue}>
                      {formatCurrency(investment.current_price)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Valor total:</Text>
                    <Text style={styles.detailValue}>
                      {formatCurrency(investment.quantity * investment.current_price)}
                    </Text>
                  </View>
                </View>

                <View style={styles.profitContainer}>
                  <View
                    style={[
                      styles.profitBadge,
                      { backgroundColor: isPositive ? '#D1FAE5' : '#FEE2E2' },
                    ]}
                  >
                    <Ionicons
                      name={isPositive ? 'trending-up' : 'trending-down'}
                      size={16}
                      color={isPositive ? '#10B981' : '#EF4444'}
                    />
                    <Text
                      style={[
                        styles.profitText,
                        { color: isPositive ? '#10B981' : '#EF4444' },
                      ]}
                    >
                      {isPositive ? '+' : ''}
                      {formatCurrency(profit)}
                    </Text>
                    <Text
                      style={[
                        styles.profitPercentage,
                        { color: isPositive ? '#10B981' : '#EF4444' },
                      ]}
                    >
                      ({isPositive ? '+' : ''}
                      {profitPercentage.toFixed(2)}%)
                    </Text>
                  </View>
                </View>

                <Text style={styles.investmentDate}>
                  Agregado el {format(new Date(investment.date), "d 'de' MMMM, yyyy", { locale: es })}
                </Text>
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
              <Text style={styles.modalTitle}>Nueva Inversión</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.typeSelector}>
              {(['crypto', 'stock', 'other'] as const).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeButton,
                    selectedType === type && styles.typeButtonActive,
                  ]}
                  onPress={() => setSelectedType(type)}
                >
                  <Ionicons
                    name={getTypeIcon(type)}
                    size={20}
                    color={selectedType === type ? '#FFFFFF' : '#6B7280'}
                  />
                  <Text
                    style={[
                      styles.typeButtonText,
                      selectedType === type && styles.typeButtonTextActive,
                    ]}
                  >
                    {getTypeLabel(type)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Nombre</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: Bitcoin, Apple, etc."
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Cantidad</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                keyboardType="decimal-pad"
                value={quantity}
                onChangeText={setQuantity}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Precio de Compra (ARS)</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                keyboardType="decimal-pad"
                value={purchasePrice}
                onChangeText={setPurchasePrice}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Precio Actual (ARS)</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                keyboardType="decimal-pad"
                value={currentPrice}
                onChangeText={setCurrentPrice}
              />
            </View>

            <TouchableOpacity style={styles.submitButton} onPress={handleAddInvestment}>
              <Text style={styles.submitButtonText}>Agregar Inversión</Text>
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
  summaryCard: {
    backgroundColor: '#8B5CF6',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 16,
    color: '#EDE9FE',
    marginLeft: 8,
  },
  summaryAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
    color: '#EDE9FE',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statPercentage: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
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
  investmentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  investmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  investmentIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  investmentInfo: {
    flex: 1,
  },
  investmentName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 2,
  },
  investmentType: {
    fontSize: 14,
    color: '#6B7280',
  },
  deleteButton: {
    padding: 8,
  },
  investmentDetails: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  profitContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  profitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  profitText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  profitPercentage: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  investmentDate: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
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
  typeSelector: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 8,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    gap: 4,
  },
  typeButtonActive: {
    backgroundColor: '#6366F1',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  typeButtonTextActive: {
    color: '#FFFFFF',
  },
  inputGroup: {
    marginBottom: 16,
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
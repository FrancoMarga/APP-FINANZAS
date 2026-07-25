import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, fontSize } from '@/src/theme/colors';

interface MonthPickerProps {
  visible: boolean;
  months: string[];
  selectedMonth: string;
  onSelect: (month: string) => void;
  onClose: () => void;
}

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTH_NAMES_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function formatMonth(month: string, full: boolean = false): string {
  const [year, mo] = month.split('-');
  const names = full ? MONTH_NAMES_FULL : MONTH_NAMES;
  return `${names[parseInt(mo) - 1]} ${year}`;
}

export default function MonthPicker({ visible, months, selectedMonth, onSelect, onClose }: MonthPickerProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Seleccionar mes</Text>
            <TouchableOpacity onPress={onClose} testID="month-picker-close">
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.list}>
            {months.map((m) => (
              <TouchableOpacity
                key={m}
                testID={`month-option-${m}`}
                style={[
                  styles.item,
                  m === selectedMonth && styles.itemSelected,
                ]}
                onPress={() => {
                  onSelect(m);
                  onClose();
                }}
              >
                <Text style={[
                  styles.itemText,
                  m === selectedMonth && styles.itemTextSelected,
                ]}>
                  {formatMonth(m, true)}
                </Text>
                {m === selectedMonth && (
                  <Ionicons name="checkmark" size={20} color={colors.textOnPrimary} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  container: {
    width: '100%',
    maxWidth: 340,
    maxHeight: '70%',
    backgroundColor: colors.bgCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
  },
  list: {
    padding: spacing.sm,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  itemSelected: {
    backgroundColor: colors.primary,
  },
  itemText: {
    fontSize: fontSize.md,
    color: colors.text,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  itemTextSelected: {
    color: colors.textOnPrimary,
    fontWeight: '700',
  },
});

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { api } from '@/src/services/api';
import { colors, spacing, radius, fontSize } from '@/src/theme/colors';
import Toast from '@/src/components/Toast';
import { useToast } from '@/src/hooks/useToast';
import { useAuth } from '@/src/contexts/AuthContext';
import CategoryIcon from '@/src/components/CategoryIcon';
import { PREDEFINED_ICONS as ICONS, isPredefinedIcon } from '@/src/utils/categoryIcon';

const COLORS = ['#D4F542', '#F87171', '#FBBF24', '#A78BFA', '#60A5FA', '#F472B6', '#4ADE80', '#FB923C', '#818CF8', '#A855F7'];

export default function CategoriesScreen() {
  const router = useRouter();
  const toast = useToast();
  const { token } = useAuth();
  const [categories, setCategories] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [icon, setIcon] = useState('wallet');
  const [color, setColor] = useState('#D4F542');

  const loadData = async () => {
    if (!token) return;
    try {
      const cats = await api.getCategories();
      setCategories(cats);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { loadData(); }, [token]);

  const openNew = () => {
    setEditingId(null); setName(''); setType('expense'); setIcon('wallet'); setColor('#D4F542');
    setModalVisible(true);
  };

  const openEdit = (c: any) => {
    setEditingId(c.category_id); setName(c.name); setType(c.type); setIcon(c.icon); setColor(c.color);
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    if (!name) { toast.show('Ingresá un nombre', 'error'); return; }
    try {
      const payload = { name, type, icon, color };
      if (editingId) {
        await api.updateCategory(editingId, payload);
        toast.show('Categoría actualizada', 'success');
      } else {
        await api.createCategory(payload);
        toast.show('Categoría creada', 'success');
      }
      setModalVisible(false);
      loadData();
    } catch { toast.show('Error al guardar', 'error'); }
  };

  const handleDelete = async (id: string, isCustom: boolean) => {
    if (!isCustom) {
      toast.show('No podés eliminar categorías predefinidas. Podés editarlas.', 'warning');
      return;
    }
    try {
      await api.deleteCategory(id);
      toast.show('Categoría eliminada', 'success');
      loadData();
    } catch { toast.show('Error al eliminar', 'error'); }
  };

  const expenseCats = categories.filter((c) => c.type === 'expense');
  const incomeCats = categories.filter((c) => c.type === 'income');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Toast message={toast.message} type={toast.type} visible={toast.visible} onHide={toast.hide} duration={toast.duration} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="categories-back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Categorías</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openNew} testID="add-category-button">
          <Ionicons name="add" size={22} color={colors.textOnPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionTitle}>Gastos ({expenseCats.length})</Text>
        {expenseCats.map((c) => (
          <CatRow key={c.category_id} cat={c} onEdit={() => openEdit(c)} onDelete={() => handleDelete(c.category_id, c.is_custom)} />
        ))}

        <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Ingresos ({incomeCats.length})</Text>
        {incomeCats.map((c) => (
          <CatRow key={c.category_id} cat={c} onEdit={() => openEdit(c)} onDelete={() => handleDelete(c.category_id, c.is_custom)} />
        ))}
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modal} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingId ? 'Editar' : 'Nueva'} Categoría</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={26} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Nombre</Text>
            <TextInput style={styles.input} placeholder="Ej: Gimnasio" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} testID="cat-name-input" />

            <Text style={styles.label}>Tipo</Text>
            <View style={styles.typeRow}>
              {(['expense', 'income'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeBtn, type === t && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => setType(t)}
                  testID={`cat-type-${t}`}
                >
                  <Text style={[styles.typeBtnText, type === t && { color: colors.textOnPrimary }]}>
                    {t === 'expense' ? 'Gasto' : 'Ingreso'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Ícono</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
              {ICONS.map((i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.iconChip, icon === i && { backgroundColor: color, borderColor: color }]}
                  onPress={() => setIcon(i)}
                >
                  <Ionicons name={i as any} size={20} color={icon === i ? colors.textOnPrimary : colors.text} />
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.label}>O elegí un emoji</Text>
            <View style={styles.emojiRow}>
              <View
                style={[
                  styles.emojiPreview,
                  !isPredefinedIcon(icon) && { backgroundColor: color, borderColor: color },
                ]}
              >
                <Text style={styles.emojiPreviewText}>{!isPredefinedIcon(icon) ? icon : '😀'}</Text>
              </View>
              <TextInput
                style={styles.emojiInput}
                placeholder="Tocá acá y elegí un emoji con el teclado"
                placeholderTextColor={colors.textMuted}
                value={!isPredefinedIcon(icon) ? icon : ''}
                onChangeText={(v) => {
                  // Nos quedamos solo con el último "carácter" (soporta emojis compuestos)
                  const chars = Array.from(v.trim());
                  if (chars.length > 0) setIcon(chars[chars.length - 1]);
                }}
                testID="cat-emoji-input"
                maxLength={4}
              />
            </View>
            <Text style={styles.hint}>💡 En el teclado de tu celular, tocá el ícono de emojis (🙂 o 🌐) para elegir uno</Text>

            <Text style={styles.label}>Color</Text>
            <View style={styles.colorRow}>
              {COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorChip, { backgroundColor: c }, color === c && styles.colorChipActive]}
                  onPress={() => setColor(c)}
                />
              ))}
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} testID="submit-category">
              <Text style={styles.submitBtnText}>{editingId ? 'Actualizar' : 'Crear'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function CatRow({ cat, onEdit, onDelete }: any) {
  return (
    <View style={styles.catRow}>
      <View style={[styles.catIcon, { backgroundColor: `${cat.color}30` }]}>
        <CategoryIcon icon={cat.icon} size={18} color={cat.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.catName}>{cat.name}</Text>
        {!cat.is_custom && <Text style={styles.catBadge}>Predefinida</Text>}
      </View>
      <TouchableOpacity onPress={onEdit} testID={`edit-cat-${cat.name}`} style={styles.iconBtn}>
        <Ionicons name="create-outline" size={18} color={colors.primary} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onDelete} testID={`delete-cat-${cat.name}`} style={styles.iconBtn}>
        <Ionicons name="trash-outline" size={18} color={cat.is_custom ? colors.danger : colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md, paddingBottom: 40 },
  sectionTitle: { color: colors.textSecondary, fontSize: fontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm },
  catRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  catIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  catName: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  catBadge: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  iconBtn: { padding: 6 },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalScroll: { maxHeight: '92%' },
  modal: { backgroundColor: colors.bgCard, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  label: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600', marginTop: spacing.md, marginBottom: spacing.sm },
  input: { backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.md, fontSize: fontSize.md, color: colors.text, borderWidth: 1, borderColor: colors.border },
  typeRow: { flexDirection: 'row', gap: spacing.sm },
  typeBtn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated, alignItems: 'center' },
  typeBtnText: { color: colors.text, fontSize: fontSize.sm, fontWeight: '600' },
  iconChip: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  emojiRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  emojiPreview: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
  emojiPreviewText: { fontSize: 20 },
  emojiInput: {
    flex: 1, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    color: colors.text, fontSize: fontSize.md,
  },
  hint: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.xs },
  colorRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  colorChip: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'transparent' },
  colorChipActive: { borderColor: colors.text },
  submitBtn: { backgroundColor: colors.primary, borderRadius: radius.full, paddingVertical: spacing.md + 2, alignItems: 'center', marginTop: spacing.lg },
  submitBtnText: { color: colors.textOnPrimary, fontSize: fontSize.md, fontWeight: '700' },
});

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  SafeAreaView,
  Alert,
  Switch,
} from 'react-native';
import { colors, fonts, typography, spacing, borderRadius } from '../constants/theme';
import { lightTap } from '../utils/haptics';
import Button from './Button';
import Sticker from './Sticker';
import StickerPickerModal from './StickerPickerModal';
import type { Modifier } from '../db/queries';

interface ModifierEditModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: { name: string; priceCents: number; stickerId?: string; isDefault: boolean; isAvailable: boolean }) => void;
  onDelete?: () => void;
  editModifier?: Modifier | null;
  // Group context — modifiers always live inside a group post-v10. Parent
  // supplies the name + select_type so the editor can tailor copy (e.g.
  // single-select groups can't have multiple defaults; we warn).
  groupName: string;
  groupSelectType: 'single' | 'multi';
}

export default function ModifierEditModal({
  visible,
  onClose,
  onSave,
  onDelete,
  editModifier,
  groupName,
  groupSelectType,
}: ModifierEditModalProps) {
  const [name, setName] = useState('');
  // Calculator-style price entry: every keystroke shifts the buffer left
  // (00 → 01 → 15 → 1.50). Same pattern as the item price field.
  const [cents, setCents] = useState(0);
  const [stickerId, setStickerId] = useState<string | null>(null);
  const [isDefault, setIsDefault] = useState(false);
  // 86'd flag for this individual modifier. Default available. When ON,
  // the customer-facing CustomizeItemModal filters this modifier out of
  // the choices; the merchant editor still shows it so the toggle remains
  // reachable to flip back tomorrow.
  const [isAvailable, setIsAvailable] = useState(true);
  const [errors, setErrors] = useState<{ name?: string }>({});
  const [showStickerPicker, setShowStickerPicker] = useState(false);

  const priceDisplay = (cents / 100).toFixed(2);

  useEffect(() => {
    if (!visible) return;
    if (editModifier) {
      setName(editModifier.name);
      setCents(editModifier.price_cents);
      setStickerId(editModifier.sticker_id);
      setIsDefault(editModifier.is_default === 1);
      setIsAvailable(editModifier.is_available !== 0);
    } else {
      setName('');
      setCents(0);
      setStickerId(null);
      setIsDefault(false);
      setIsAvailable(true);
    }
    setErrors({});
  }, [editModifier, visible]);

  const handlePriceChange = (text: string) => {
    if (text.length > priceDisplay.length) {
      const last = text[text.length - 1];
      if (/\d/.test(last)) {
        const next = cents * 10 + parseInt(last, 10);
        if (next <= 99999999) setCents(next);
      }
    } else if (text.length < priceDisplay.length) {
      setCents(Math.floor(cents / 10));
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setErrors({ name: 'Name is required' });
      return;
    }
    await lightTap();
    onSave({
      name: name.trim(),
      priceCents: cents,
      stickerId: stickerId ?? undefined,
      isDefault,
      isAvailable,
    });
  };

  const handleDelete = () => {
    if (!onDelete) return;
    Alert.alert(
      'Delete modifier?',
      'This modifier will no longer appear on the customize screen. Past orders that used it keep their record.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            onPress={onClose}
            style={styles.backButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Text style={styles.backText}>Cancel</Text>
          </TouchableOpacity>

          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>
              {editModifier ? 'Edit option' : 'Add option'}
            </Text>
            <Text style={styles.subtitle}>
              In group · {groupName.toUpperCase()}
            </Text>

            {/* Name */}
            <View style={styles.field}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={[styles.input, errors.name ? styles.inputError : null]}
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  if (errors.name) setErrors({});
                }}
                placeholder="Avocado, No onions, Extra bacon"
                placeholderTextColor={colors.textMuted}
                autoFocus={!editModifier}
                maxLength={40}
              />
              {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}
            </View>

            {/* Price delta — calculator style. Zero means free swap. */}
            <View style={styles.field}>
              <Text style={styles.label}>Extra charge (optional)</Text>
              <TextInput
                style={styles.input}
                value={priceDisplay}
                onChangeText={handlePriceChange}
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                selection={{ start: priceDisplay.length, end: priceDisplay.length }}
              />
              <Text style={styles.hint}>
                Leave at 0.00 for free swaps (like &ldquo;No onions&rdquo; or &ldquo;Lettuce wrap&rdquo;).
              </Text>
            </View>

            {/* Default selection — pre-selects in the customize sheet */}
            <View style={[styles.field, styles.row]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Default</Text>
                <Text style={styles.hint}>
                  {groupSelectType === 'single'
                    ? 'Pre-selected when the customize sheet opens. Only one option in this group should be the default.'
                    : 'Pre-selected when the customize sheet opens. Customer can uncheck it.'}
                </Text>
              </View>
              <Switch
                value={isDefault}
                onValueChange={setIsDefault}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.surface}
              />
            </View>

            {/* Sold out today — hides this modifier from the customer-facing
                customize sheet. Stays in the editor so toggling back is one
                tap. Mid-shift use: "we just ran out of oat milk" without
                deleting the option or hiding the whole item. */}
            <View style={[styles.field, styles.row]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Sold out today</Text>
                <Text style={styles.hint}>
                  Hides this option from the customize sheet until you toggle back. Doesn&rsquo;t affect past orders.
                </Text>
              </View>
              <Switch
                value={!isAvailable}
                onValueChange={(soldOut) => setIsAvailable(!soldOut)}
                trackColor={{ false: colors.border, true: colors.warning }}
                thumbColor={colors.surface}
                accessibilityLabel="Mark this modifier sold out today"
              />
            </View>

            {/* Live preview */}
            <View style={styles.previewRow}>
              <Text style={styles.label}>Preview</Text>
              <View style={styles.previewCard}>
                {stickerId && stickerId !== 'custom' ? (
                  <Sticker id={stickerId} size={48} />
                ) : (
                  <Text style={styles.previewGlyph}>
                    {(name?.[0] ?? '·').toUpperCase()}
                  </Text>
                )}
              </View>
            </View>

            {/* Sticker trigger — opens StickerPickerModal where the merchant
                browses + searches all 190+ stickers. Curated visuals only —
                no photo upload per OSPOS philosophy. */}
            <View style={styles.field}>
              <Text style={styles.label}>Sticker</Text>
              <TouchableOpacity
                style={styles.stickerTriggerRow}
                onPress={() => setShowStickerPicker(true)}
                accessibilityRole="button"
                accessibilityLabel={stickerId ? 'Change sticker' : 'Choose a sticker'}
              >
                <View style={styles.stickerTriggerThumb}>
                  {stickerId ? (
                    <Sticker id={stickerId} size={36} />
                  ) : (
                    <Text style={styles.stickerTriggerPlus}>+</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stickerTriggerLabel}>
                    {stickerId ? 'Sticker chosen' : 'Choose a sticker'}
                  </Text>
                  <Text style={styles.stickerTriggerHint}>
                    {stickerId ? 'Tap to browse or change' : 'Browse the library'}
                  </Text>
                </View>
                <Text style={styles.stickerTriggerChevron}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Save / Cancel */}
            <View style={styles.actions}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" variant="ghost" size="md" onPress={onClose} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Save" variant="primary" size="md" onPress={handleSave} />
              </View>
            </View>

            {editModifier && onDelete ? (
              <View style={{ marginTop: spacing.md }}>
                <Button label="Delete modifier" variant="destructive" size="md" onPress={handleDelete} />
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <StickerPickerModal
        visible={showStickerPicker}
        currentStickerId={stickerId}
        onClose={() => setShowStickerPicker(false)}
        onSelect={(id) => {
          setStickerId(id);
          setShowStickerPicker(false);
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scrollContent: {
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxxl,
  },
  backButton: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    alignSelf: 'flex-start',
  },
  backText: {
    ...typography.body,
    color: colors.primary,
  },
  title: {
    ...typography.title1,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.xs,
    marginBottom: spacing.xxl,
  },
  field: { marginBottom: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  label: {
    ...typography.caption,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputError: { borderColor: colors.danger },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  previewRow: { alignItems: 'center', marginBottom: spacing.lg },
  previewCard: {
    width: 84,
    height: 84,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  previewGlyph: {
    fontFamily: 'Bitter_500Medium_Italic',
    fontSize: 44,
    color: colors.primary,
    lineHeight: 48,
  },
  // Tap-to-open sticker trigger — opens StickerPickerModal
  stickerTriggerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  stickerTriggerThumb: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerTriggerPlus: {
    fontFamily: fonts.num,
    fontSize: 30,
    color: colors.primary,
  },
  stickerTriggerLabel: {
    ...typography.body,
    color: colors.text,
  },
  stickerTriggerHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  stickerTriggerChevron: {
    ...typography.title3,
    color: colors.textMuted,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
});

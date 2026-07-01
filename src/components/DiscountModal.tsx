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
} from 'react-native';
import { colors, fonts, typography, spacing, borderRadius } from '../constants/theme';
import { lightTap } from '../utils/haptics';
import { formatCurrency } from '../utils/currency';
import Button from './Button';
import type { OrderDiscount } from '../state/reducers';

// Order-level discount editor — % off or $ off, with an optional reason
// (e.g. "happy hour", "manager comp"). Applied to the whole order; reduces
// the taxable subtotal proportionally so mixed taxable/non-taxable carts
// stay honest.
interface DiscountModalProps {
  visible: boolean;
  currency: string;
  // Cart subtotal so we can preview the discounted amount as the cashier types.
  subtotal: number;
  // Existing discount (if any) — pre-fills the form for editing.
  existing?: OrderDiscount | null;
  onClose: () => void;
  onSave: (data: { type: 'percent' | 'amount'; value: number; reason?: string }) => void;
  // Only meaningful in edit mode; clears the existing discount.
  onRemove?: () => void;
}

const MAX_PERCENT = 100;
const MAX_CENTS = 9999999; // $99,999.99 — far past any realistic cart

export default function DiscountModal({
  visible,
  currency,
  subtotal,
  existing,
  onClose,
  onSave,
  onRemove,
}: DiscountModalProps) {
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  // Both modes use a calculator-style integer buffer. For percent that's the
  // raw % (0-100); for amount that's cents.
  const [value, setValue] = useState(0);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    if (existing) {
      setDiscountType(existing.type);
      setValue(existing.value);
      setReason(existing.reason ?? '');
    } else {
      setDiscountType('percent');
      setValue(0);
      setReason('');
    }
    setError(null);
  }, [visible, existing]);

  // Live-preview the discount amount in cents.
  const previewAmount = (() => {
    if (value <= 0 || subtotal <= 0) return 0;
    if (discountType === 'percent') {
      const pct = Math.min(MAX_PERCENT, value);
      return Math.round(subtotal * (pct / 100));
    }
    return Math.min(subtotal, value);
  })();

  const valueDisplay =
    discountType === 'percent'
      ? `${value}%`
      : (value / 100).toFixed(2);

  const handleValueChange = (text: string) => {
    if (error) setError(null);
    if (text.length > valueDisplay.length) {
      const last = text[text.length - 1];
      if (/\d/.test(last)) {
        const next = value * 10 + parseInt(last, 10);
        const cap = discountType === 'percent' ? MAX_PERCENT : MAX_CENTS;
        if (next <= cap) setValue(next);
      }
    } else if (text.length < valueDisplay.length) {
      setValue(Math.floor(value / 10));
    }
  };

  const handleTypeSwap = (next: 'percent' | 'amount') => {
    if (next === discountType) return;
    setDiscountType(next);
    setValue(0); // resetting prevents nonsense like "$25 → 25%" carry-over
    setError(null);
  };

  const handleSave = async () => {
    if (value <= 0) {
      setError(discountType === 'percent' ? 'Enter a percentage' : 'Enter an amount');
      return;
    }
    await lightTap();
    onSave({
      type: discountType,
      value,
      reason: reason.trim() || undefined,
    });
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
            accessibilityLabel="Cancel"
          >
            <Text style={styles.backText}>Cancel</Text>
          </TouchableOpacity>

          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.title}>
              {existing ? 'Edit discount' : 'Add discount'}
            </Text>
            <Text style={styles.subtitle}>
              On the whole order. Reduces the tax base proportionally.
            </Text>

            {/* Type segment */}
            <View style={styles.field}>
              <Text style={styles.label}>Type</Text>
              <View style={styles.segmented}>
                <TouchableOpacity
                  style={[styles.segment, discountType === 'percent' && styles.segmentActive]}
                  onPress={() => handleTypeSwap('percent')}
                  accessibilityRole="button"
                  accessibilityState={{ selected: discountType === 'percent' }}
                >
                  <Text style={[styles.segmentText, discountType === 'percent' && styles.segmentTextActive]}>
                    % off
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segment, discountType === 'amount' && styles.segmentActive]}
                  onPress={() => handleTypeSwap('amount')}
                  accessibilityRole="button"
                  accessibilityState={{ selected: discountType === 'amount' }}
                >
                  <Text style={[styles.segmentText, discountType === 'amount' && styles.segmentTextActive]}>
                    $ off
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Big amount input */}
            <View style={styles.field}>
              <Text style={styles.label}>
                {discountType === 'percent' ? 'Percentage' : 'Amount'}
              </Text>
              <TextInput
                style={[styles.valueInput, error ? styles.inputError : null]}
                value={valueDisplay}
                onChangeText={handleValueChange}
                placeholder={discountType === 'percent' ? '0%' : '0.00'}
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                autoFocus
                selection={{ start: valueDisplay.length, end: valueDisplay.length }}
              />
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>

            {/* Live preview of what comes off the order */}
            {previewAmount > 0 ? (
              <View style={styles.preview}>
                <Text style={styles.previewLabel}>Customer saves</Text>
                <Text style={styles.previewValue}>
                  −{formatCurrency(previewAmount, currency)}
                </Text>
              </View>
            ) : null}

            {/* Optional reason */}
            <View style={styles.field}>
              <Text style={styles.label}>Reason (optional)</Text>
              <TextInput
                style={styles.input}
                value={reason}
                onChangeText={setReason}
                placeholder="Happy hour, manager comp, employee meal"
                placeholderTextColor={colors.textMuted}
                maxLength={40}
                autoCapitalize="sentences"
              />
              <Text style={styles.hint}>
                Shows on the receipt and the sales record.
              </Text>
            </View>

            <View style={styles.actions}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" variant="ghost" size="md" onPress={onClose} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label={existing ? 'Update' : 'Apply'} variant="primary" size="md" onPress={handleSave} />
              </View>
            </View>

            {existing && onRemove ? (
              <View style={{ marginTop: spacing.md }}>
                <Button label="Remove discount" variant="destructive" size="md" onPress={onRemove} />
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
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
  backText: { ...typography.body, color: colors.primary },
  title: { ...typography.title1 },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginBottom: spacing.xxl,
  },
  field: { marginBottom: spacing.lg },
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
  valueInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    fontFamily: fonts.num,
    fontSize: 32,
    color: colors.primary,
    borderWidth: 1,
    borderColor: colors.border,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  inputError: { borderColor: colors.danger },
  errorText: { ...typography.caption, color: colors.danger, marginTop: spacing.xs },
  hint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },

  segmented: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  segment: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
  },
  segmentActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  segmentText: { ...typography.bodyBold, color: colors.text },
  segmentTextActive: { color: colors.primary },

  preview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  previewLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  previewValue: {
    fontFamily: fonts.num,
    fontSize: 22,
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },

  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
});

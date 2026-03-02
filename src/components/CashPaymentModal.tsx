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
} from 'react-native';
import { colors, typography, spacing, borderRadius, touchTargets } from '../constants/theme';
import { strings } from '../constants/strings';
import { formatCurrency, parseCurrencyInput, getCurrencyDecimals } from '../utils/currency';

interface CashPaymentModalProps {
  visible: boolean;
  total: number;
  currency: string;
  onConfirm: (cashTendered: number) => void;
  onClose: () => void;
}

export default function CashPaymentModal({
  visible,
  total,
  currency,
  onConfirm,
  onClose,
}: CashPaymentModalProps) {
  const [cashInput, setCashInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset input when modal opens
  useEffect(() => {
    if (visible) {
      setCashInput('');
      setSubmitting(false);
    }
  }, [visible]);

  const decimals = getCurrencyDecimals(currency);
  const cashTendered = parseCurrencyInput(cashInput, currency);
  const change = cashTendered > 0 ? cashTendered - total : 0;
  const canConfirm = cashTendered >= total;

  const handleExactCash = () => {
    if (submitting) return;
    setSubmitting(true);
    onConfirm(total);
  };

  const handleConfirm = () => {
    if (!canConfirm || submitting) return;
    setSubmitting(true);
    onConfirm(cashTendered);
  };

  // Quick cash buttons — currency-aware denominations
  const unit = decimals === 0 ? 1 : 100; // 1 for JPY/KRW, 100 for USD/EUR
  const quickAmounts = [
    Math.ceil(total / (1 * unit)) * (1 * unit),
    Math.ceil(total / (5 * unit)) * (5 * unit),
    Math.ceil(total / (10 * unit)) * (10 * unit),
    Math.ceil(total / (20 * unit)) * (20 * unit),
  ].filter((v, i, a) => a.indexOf(v) === i && v >= total);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modal}>
          <Text style={styles.title}>{strings.payment.cash}</Text>

          <View style={styles.totalSection}>
            <Text style={styles.totalLabel}>{strings.order.total}</Text>
            <Text style={styles.totalAmount}>{formatCurrency(total, currency)}</Text>
          </View>

          <TouchableOpacity
            style={[styles.exactCashButton, submitting && styles.confirmDisabled]}
            onPress={handleExactCash}
            activeOpacity={0.7}
            disabled={submitting}
            accessibilityLabel="Pay exact amount"
            accessibilityRole="button"
          >
            <Text style={styles.exactCashText}>{strings.payment.exactCash}</Text>
          </TouchableOpacity>

          <Text style={styles.orText}>or enter amount</Text>

          <TextInput
            style={styles.input}
            value={cashInput}
            onChangeText={setCashInput}
            placeholder={strings.payment.cashTendered}
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            autoFocus={false}
          />

          {quickAmounts.length > 0 ? (
            <View style={styles.quickAmounts}>
              {quickAmounts.slice(0, 4).map((amount) => (
                <TouchableOpacity
                  key={amount}
                  style={styles.quickButton}
                  onPress={() => setCashInput(decimals === 0 ? String(amount) : (amount / 100).toFixed(decimals))}
                >
                  <Text style={styles.quickButtonText}>
                    {formatCurrency(amount, currency)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {cashTendered >= total && cashTendered > 0 ? (
            <View style={styles.changeSection}>
              <Text style={styles.changeLabel}>{strings.payment.change}</Text>
              <Text style={styles.changeAmount}>
                {formatCurrency(change, currency)}
              </Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>{strings.menuBuilder.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, ((!canConfirm && cashInput.length > 0) || submitting) && styles.confirmDisabled]}
              onPress={handleConfirm}
              disabled={(!canConfirm && cashInput.length > 0) || submitting}
            >
              <Text style={styles.confirmText}>{strings.payment.confirm}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xxl,
  },
  title: {
    ...typography.title2,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  totalSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  totalLabel: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  totalAmount: {
    ...typography.total,
  },
  exactCashButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
    minHeight: touchTargets.minimum,
    justifyContent: 'center',
  },
  exactCashText: {
    ...typography.bodyBold,
    color: colors.black,
    fontSize: 18,
  },
  orText: {
    ...typography.caption,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    ...typography.title2,
    color: colors.text,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  quickAmounts: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  quickButton: {
    flex: 1,
    backgroundColor: colors.cardHighlight,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  quickButtonText: {
    ...typography.priceSmall,
    color: colors.textSecondary,
  },
  changeSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
  },
  changeLabel: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  changeAmount: {
    ...typography.statNumber,
    fontSize: 28,
    color: colors.primary,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.cardHighlight,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    minHeight: touchTargets.minimum,
    justifyContent: 'center',
  },
  cancelText: {
    ...typography.bodyBold,
    color: colors.textSecondary,
  },
  confirmButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    minHeight: touchTargets.minimum,
    justifyContent: 'center',
  },
  confirmDisabled: {
    opacity: 0.5,
  },
  confirmText: {
    ...typography.bodyBold,
    color: colors.black,
  },
});

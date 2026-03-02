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
import { formatCurrency, parseCurrencyInput } from '../utils/currency';

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

  // Reset input when modal opens
  useEffect(() => {
    if (visible) {
      setCashInput('');
    }
  }, [visible]);

  const cashTendered = parseCurrencyInput(cashInput);
  const change = cashTendered > 0 ? cashTendered - total : 0;
  const canConfirm = cashTendered >= total;

  const handleExactCash = () => {
    onConfirm(total);
  };

  const handleConfirm = () => {
    if (canConfirm) {
      onConfirm(cashTendered);
    }
  };

  // Quick cash buttons (total is in cents — round up to nearest $1, $5, $10, $20)
  const quickAmounts = [
    Math.ceil(total / 100) * 100,       // next dollar
    Math.ceil(total / 500) * 500,       // next $5
    Math.ceil(total / 1000) * 1000,     // next $10
    Math.ceil(total / 2000) * 2000,     // next $20
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
            style={styles.exactCashButton}
            onPress={handleExactCash}
            activeOpacity={0.7}
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
                  onPress={() => setCashInput((amount / 100).toFixed(2))}
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
              style={[styles.confirmButton, !canConfirm && cashInput.length > 0 && styles.confirmDisabled]}
              onPress={handleConfirm}
              disabled={!canConfirm && cashInput.length > 0}
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

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
import Button from './Button';

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
    if (submitting) return;
    // If the user taps Confirm without typing anything, treat it as Exact Cash
    // rather than silently doing nothing. Less footgun.
    if (cashInput.length === 0) {
      setSubmitting(true);
      onConfirm(total);
      return;
    }
    if (!canConfirm) return;
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

          <View style={styles.exactCashRow}>
            <Button
              label={strings.payment.exactCash}
              variant="cash"
              size="lg"
              onPress={handleExactCash}
              disabled={submitting}
              accessibilityLabel="Pay exact amount"
            />
          </View>

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
                <View key={amount} style={{ flex: 1 }}>
                  <Button
                    label={formatCurrency(amount, currency)}
                    variant="ghost"
                    size="sm"
                    onPress={() => setCashInput(decimals === 0 ? String(amount) : (amount / 100).toFixed(decimals))}
                  />
                </View>
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
            <View style={{ flex: 1 }}>
              <Button label={strings.menuBuilder.cancel} variant="ghost" size="md" onPress={onClose} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={strings.payment.confirm}
                variant="cash"
                size="md"
                onPress={handleConfirm}
                disabled={(cashInput.length > 0 && !canConfirm) || submitting}
              />
            </View>
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
    ...typography.eyebrow,
    fontSize: 11,
    color: colors.textMuted,
  },
  totalAmount: {
    ...typography.displayMedium,
    marginTop: spacing.xs,
  },
  exactCashRow: {
    marginBottom: spacing.lg,
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
    ...typography.displayMedium,
    fontSize: 28,
    color: colors.green,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
});

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  TextInput,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { colors, typography, spacing, borderRadius, touchTargets } from '../constants/theme';
import { strings } from '../constants/strings';
import { formatCurrency } from '../utils/currency';
import { useApp } from '../state/AppContext';
import { getOrderWithItems, type OrderWithItems } from '../db/queries';
import { issueRefund } from '../services/api';
import { getDatabase } from '../db/database';

interface TransactionDetailScreenProps {
  orderId: string;
  onBack: () => void;
}

export default function TransactionDetailScreen({
  orderId,
  onBack,
}: TransactionDetailScreenProps) {
  const { settings } = useApp();
  const mountedRef = useRef(true);
  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [showRefund, setShowRefund] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [isFullRefund, setIsFullRefund] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const o = await getOrderWithItems(orderId);
        if (mountedRef.current) setOrder(o);
      } catch {
        if (mountedRef.current) setLoadError(true);
      }
    })();
    return () => { mountedRef.current = false; };
  }, [orderId]);

  if (loadError) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Failed to load transaction</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const isCard = order.payment_method === 'card';
  const hasRefund = order.refund_status !== 'none';
  const formattedDate = new Date(order.created_at).toLocaleString();

  const handleRefund = async () => {
    if (!order.stripe_payment_id) return;

    // All money values (order.total, order.refund_amount) are integer cents
    const partialCents = Math.round(parseFloat(refundAmount) * 100);
    const amount = isFullRefund ? undefined : partialCents;

    if (!isFullRefund && (!partialCents || partialCents <= 0)) {
      Alert.alert(strings.transactionDetail.error, strings.transactionDetail.invalidRefundAmount);
      return;
    }

    const alreadyRefunded = order.refund_amount || 0;
    const maxRefundable = order.total - alreadyRefunded;
    const refundCents = isFullRefund ? maxRefundable : partialCents;
    if (refundCents > maxRefundable) {
      Alert.alert(strings.transactionDetail.error, `Maximum refundable amount is ${formatCurrency(maxRefundable, settings.currency)}`);
      return;
    }

    const amountDisplay = isFullRefund
      ? formatCurrency(order.total, settings.currency)
      : formatCurrency(partialCents, settings.currency);

    Alert.alert(
      'Confirm Refund',
      `Refund ${amountDisplay} to card?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'destructive',
          onPress: async () => {
            setProcessing(true);
            try {
              await issueRefund(order.stripe_payment_id!, amount);

              // Update local SQLite — accumulate refund amounts
              const db = getDatabase();
              const thisRefund = isFullRefund
                ? (order.total - (order.refund_amount || 0))
                : partialCents;
              const totalRefunded = (order.refund_amount || 0) + thisRefund;
              const newStatus = totalRefunded >= order.total ? 'full' : 'partial';

              await db.runAsync(
                'UPDATE orders SET refund_status = ?, refund_amount = ? WHERE id = ?',
                [newStatus, totalRefunded, order.id]
              );

              Alert.alert('Refund Processed', `${amountDisplay} has been refunded.`);
              if (mountedRef.current) {
                const updated = await getOrderWithItems(orderId);
                setOrder(updated);
                setShowRefund(false);
              }
            } catch {
              Alert.alert('Refund Failed', 'Could not process refund. Please try again.');
            } finally {
              if (mountedRef.current) setProcessing(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Transaction Details</Text>

        <View style={styles.totalSection}>
          <Text style={styles.totalAmount}>
            {formatCurrency(order.total, settings.currency)}
          </Text>
          {hasRefund ? (
            <Text style={styles.refundBadge}>
              {order.refund_status === 'full'
                ? 'Refunded'
                : `Partially refunded (${formatCurrency(order.refund_amount ?? 0, settings.currency)})`}
            </Text>
          ) : null}
        </View>

        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Date</Text>
            <Text style={styles.infoValue}>{formattedDate}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Payment</Text>
            <Text style={styles.infoValue}>
              {order.payment_method === 'cash' ? 'Cash' : 'Card'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Subtotal</Text>
            <Text style={styles.infoValue}>
              {formatCurrency(order.subtotal, settings.currency)}
            </Text>
          </View>
          {order.tax_amount > 0 ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Tax</Text>
              <Text style={styles.infoValue}>
                {formatCurrency(order.tax_amount, settings.currency)}
              </Text>
            </View>
          ) : null}
          {order.tip_amount > 0 ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Tip</Text>
              <Text style={styles.infoValue}>
                {formatCurrency(order.tip_amount, settings.currency)}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.itemsSection}>
          <Text style={styles.sectionTitle}>Items</Text>
          <FlatList
            data={order.items}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.lineItem}>
                <Text style={styles.lineItemName}>
                  {item.quantity}x {item.item_name}
                </Text>
                <Text style={styles.lineItemPrice}>
                  {formatCurrency(item.item_price * item.quantity, settings.currency)}
                </Text>
              </View>
            )}
          />
        </View>

        {/* Refund button — card transactions only */}
        {isCard && order.refund_status !== 'full' ? (
          <View style={styles.refundSection}>
            {showRefund ? (
              <View style={styles.refundForm}>
                <TouchableOpacity
                  style={[styles.refundOption, isFullRefund && styles.refundOptionSelected]}
                  onPress={() => setIsFullRefund(true)}
                >
                  <Text style={styles.refundOptionText}>Full Refund</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.refundOption, !isFullRefund && styles.refundOptionSelected]}
                  onPress={() => setIsFullRefund(false)}
                >
                  <Text style={styles.refundOptionText}>Partial Refund</Text>
                </TouchableOpacity>

                {!isFullRefund ? (
                  <TextInput
                    style={styles.refundInput}
                    value={refundAmount}
                    onChangeText={setRefundAmount}
                    placeholder="Amount"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad"
                    maxLength={10}
                  />
                ) : null}

                <TouchableOpacity
                  style={[styles.refundConfirm, processing && styles.refundDisabled]}
                  onPress={handleRefund}
                  disabled={processing}
                >
                  {processing ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.refundConfirmText}>Process Refund</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.issueRefundButton}
                onPress={() => setShowRefund(true)}
              >
                <Text style={styles.issueRefundText}>Issue Refund</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
  },
  backButton: {
    paddingVertical: spacing.lg,
  },
  backText: {
    ...typography.body,
    color: colors.primary,
  },
  title: {
    ...typography.title2,
    marginBottom: spacing.xl,
  },
  totalSection: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  totalAmount: {
    ...typography.total,
  },
  refundBadge: {
    ...typography.caption,
    color: colors.warning,
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  infoSection: {
    marginBottom: spacing.xl,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  infoValue: {
    ...typography.bodyBold,
  },
  itemsSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.bodyBold,
    marginBottom: spacing.md,
  },
  lineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  lineItemName: {
    ...typography.body,
    flex: 1,
  },
  lineItemPrice: {
    ...typography.priceMuted,
  },
  refundSection: {
    marginTop: spacing.md,
  },
  issueRefundButton: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.danger,
    minHeight: touchTargets.minimum,
    justifyContent: 'center',
  },
  issueRefundText: {
    ...typography.bodyBold,
    color: colors.danger,
  },
  refundForm: {
    gap: spacing.md,
  },
  refundOption: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  refundOptionSelected: {
    borderColor: colors.danger,
  },
  refundOptionText: {
    ...typography.bodyBold,
    color: colors.text,
  },
  refundInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  refundConfirm: {
    backgroundColor: colors.danger,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    minHeight: touchTargets.minimum,
    justifyContent: 'center',
  },
  refundDisabled: {
    opacity: 0.6,
  },
  refundConfirmText: {
    ...typography.bodyBold,
    color: colors.white,
  },
});

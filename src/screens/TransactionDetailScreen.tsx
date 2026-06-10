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
  Animated,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, touchTargets } from '../constants/theme';
import { strings } from '../constants/strings';
import { formatCurrency, getCurrencyDecimals } from '../utils/currency';
import { successNotification } from '../utils/haptics';
import { validateEmail } from '../utils/validation';
import { useApp } from '../state/AppContext';
import { getOrderWithItems, type OrderWithItems } from '../db/queries';
import { stepUpAuth } from '../utils/stepUpAuth';
import { useScreenCaptureGuard } from '../utils/useScreenCaptureGuard';
import Eyebrow from '../components/Eyebrow';
import Button from '../components/Button';
import { issueRefund, sendReceipt, type ReceiptOrderData } from '../services/api';
import { getDatabase } from '../db/database';

interface TransactionDetailScreenProps {
  orderId: string;
  onBack: () => void;
}

export default function TransactionDetailScreen({
  orderId,
  onBack,
}: TransactionDetailScreenProps) {
  useScreenCaptureGuard();
  const { settings, isTestMode } = useApp();
  const mountedRef = useRef(true);
  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [showRefund, setShowRefund] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [isFullRefund, setIsFullRefund] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const sentScale = useRef(new Animated.Value(0)).current;
  // Scroll the content to the email row when the merchant opens it. Without
  // this, the keyboard pops up and covers the input field (the screen has
  // no native scroll-on-focus because the email row sits below the items
  // FlatList in the same vertical stack).
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (showEmail) {
      // Defer one frame so layout finishes before the scroll fires.
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      });
    }
  }, [showEmail]);

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
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const handleEmailReceipt = async () => {
    if (!emailAddress.trim() || !order) return;
    if (!validateEmail(emailAddress)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    setSendingEmail(true);
    try {
      const orderData: ReceiptOrderData = {
        subtotal: order.subtotal,
        taxAmount: order.tax_amount,
        tipAmount: order.tip_amount,
        total: order.total,
        paymentMethod: order.payment_method,
        createdAt: order.created_at,
        items: order.items.map(item => {
          const modAdjustment = item.modifiers.reduce((s, m) => s + m.price_cents, 0);
          return {
            name: item.item_name,
            price: item.item_price + modAdjustment,
            quantity: item.quantity,
            modifiers: item.modifiers.length > 0
              ? item.modifiers.map((m) => ({
                  name: m.name,
                  priceCents: m.price_cents,
                  groupName: m.group_name ?? undefined,
                }))
              : undefined,
          };
        }),
        discount: (order.discount_amount ?? 0) > 0 && order.discount_type
          ? {
              type: order.discount_type,
              value: order.discount_value ?? 0,
              amount: order.discount_amount,
              reason: order.discount_reason ?? undefined,
            }
          : undefined,
      };
      const result = await sendReceipt(order.id, 'email', emailAddress.trim(), settings.businessName || undefined, orderData);
      if (result.success) {
        setEmailSent(true);
        successNotification();
        Animated.spring(sentScale, {
          toValue: 1,
          friction: 4,
          tension: 60,
          useNativeDriver: true,
        }).start();
        setTimeout(() => {
          setEmailSent(false);
          sentScale.setValue(0);
          setShowEmail(false);
          setEmailAddress('');
        }, 2500);
      } else {
        Alert.alert('Failed', 'Could not send receipt. Please try again.');
      }
    } catch {
      Alert.alert(strings.errors.generic);
    } finally {
      setSendingEmail(false);
    }
  };

  const isCard = order.payment_method === 'card';
  const hasRefund = order.refund_status !== 'none';
  const formattedDate = new Date(order.created_at).toLocaleString();

  const handleRefund = async () => {
    if (!order.stripe_payment_id || processing) return;

    // All money values (order.total, order.refund_amount) are integer smallest-unit
    const decimals = getCurrencyDecimals(settings.currency);
    const multiplier = decimals === 0 ? 1 : Math.pow(10, decimals);
    const partialCents = Math.round(parseFloat(refundAmount) * multiplier);
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

    // Step-up auth — Face ID / passcode confirmation before destructive Stripe op.
    const ok = await stepUpAuth({
      promptMessage: `Confirm refund of ${amountDisplay}`,
    });
    if (!ok) return;

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
              await issueRefund(order.stripe_payment_id!, amount, isTestMode);

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
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Eyebrow style={{ marginBottom: 4 }}>
          {`ORDER ${order.id.substring(0, 8).toUpperCase()} · ${formattedDate}`}
        </Eyebrow>
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
              {order.payment_method === 'cash'
                ? 'Cash'
                : order.card_last4
                  ? `${order.card_brand ?? 'Card'} ••••${order.card_last4}`
                  : 'Card'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Subtotal</Text>
            <Text style={styles.infoValue}>
              {formatCurrency(order.subtotal, settings.currency)}
            </Text>
          </View>
          {(order.discount_amount ?? 0) > 0 ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel} numberOfLines={1}>
                Discount
                {order.discount_type === 'percent' && order.discount_value != null
                  ? ` · ${order.discount_value}% off`
                  : null}
                {order.discount_reason ? ` · ${order.discount_reason}` : null}
              </Text>
              <Text style={styles.infoValue}>
                −{formatCurrency(order.discount_amount, settings.currency)}
              </Text>
            </View>
          ) : null}
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
            renderItem={({ item }) => {
              // Match the reducer's math — line total includes modifier deltas.
              const modAdjustment = item.modifiers.reduce((s, m) => s + m.price_cents, 0);
              const lineTotal = (item.item_price + modAdjustment) * item.quantity;
              return (
                <View style={styles.lineItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lineItemName}>
                      {item.quantity}x {item.item_name}
                    </Text>
                    {item.modifiers.length > 0 ? (
                      <Text style={styles.lineItemModifiers} numberOfLines={3}>
                        {item.modifiers.map((m) => m.name).join(' · ')}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.lineItemPrice}>
                    {formatCurrency(lineTotal, settings.currency)}
                  </Text>
                </View>
              );
            }}
          />
        </View>

        {/* Email receipt */}
        {emailSent ? (
          <View style={styles.sentConfirmation}>
            <Animated.View style={[styles.sentIcon, { transform: [{ scale: sentScale }] }]}>
              <Ionicons name="mail" size={24} color={colors.primary} />
            </Animated.View>
            <Text style={styles.sentTitle}>Receipt Sent</Text>
            <Text style={styles.sentSubtitle}>{emailAddress}</Text>
          </View>
        ) : showEmail ? (
          <View style={styles.emailSection}>
            <View style={styles.emailRow}>
              <TextInput
                style={styles.emailInput}
                value={emailAddress}
                onChangeText={setEmailAddress}
                placeholder="customer@email.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoFocus
              />
              <View style={{ minWidth: 90 }}>
                <Button
                  label={sendingEmail ? '…' : 'Send'}
                  variant="primary"
                  size="md"
                  onPress={handleEmailReceipt}
                  disabled={!emailAddress.trim() || sendingEmail}
                />
              </View>
            </View>
            <View style={{ alignItems: 'center', marginTop: spacing.sm }}>
              <Button label="Cancel" variant="ghost" size="sm" onPress={() => { setShowEmail(false); setEmailAddress(''); }} />
            </View>
          </View>
        ) : (
          <Button
            label="Email Receipt"
            variant="ghost"
            size="md"
            onPress={() => setShowEmail(true)}
            leftIcon={<Ionicons name="mail-outline" size={18} color={colors.primary} />}
          />
        )}

        {/* Spacer at the bottom so the last action button isn't flush
            against the scroll edge and so scrollToEnd has room to reveal
            the keyboard-pushed email input. */}
        {null}

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

                <Button
                  label={processing ? '…' : 'Process Refund'}
                  variant="destructive"
                  size="lg"
                  onPress={handleRefund}
                  disabled={processing}
                />
              </View>
            ) : (
              <Button
                label="Issue Refund"
                variant="destructive"
                size="md"
                onPress={() => setShowRefund(true)}
              />
            )}
          </View>
        ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: { flex: 1 },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
  },
  scrollContent: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxxl,
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
  lineItemModifiers: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  lineItemPrice: {
    ...typography.priceMuted,
    marginLeft: spacing.md,
  },
  emailButton: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: touchTargets.minimum,
    marginBottom: spacing.md,
  },
  emailButtonText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  emailSection: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  emailRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  emailInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text,
  },
  emailSendButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    minHeight: touchTargets.minimum,
  },
  emailSendDisabled: {
    opacity: 0.5,
  },
  emailSendText: {
    ...typography.bodyBold,
    color: colors.black,
  },
  cancelText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  sentConfirmation: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  sentIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  sentTitle: {
    ...typography.title3,
    color: colors.primary,
  },
  sentSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
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

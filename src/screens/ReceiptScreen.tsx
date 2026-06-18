import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Animated,
  FlatList,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, touchTargets } from '../constants/theme';
import { strings } from '../constants/strings';
import { formatCurrency } from '../utils/currency';
import { successNotification } from '../utils/haptics';
import { useApp } from '../state/AppContext';
import { sendReceipt, type ReceiptOrderData } from '../services/api';
import { validateEmail, validatePhone, formatPhoneE164 } from '../utils/validation';
import Eyebrow from '../components/Eyebrow';
import Button from '../components/Button';
import { useScreenCaptureGuard } from '../utils/useScreenCaptureGuard';
import { isPrinterConnected, printReceipt } from '../services/printer';

interface ReceiptScreenProps {
  onNewOrder: () => void;
}

type ReceiptMode = 'none' | 'sms' | 'email';

const EMAIL_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'icloud.com',
  'outlook.com',
  'hotmail.com',
  'aol.com',
];

export default function ReceiptScreen({ onNewOrder }: ReceiptScreenProps) {
  useScreenCaptureGuard();
  const { lastOrder, settings } = useApp();
  const checkmarkScale = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const [receiptMode, setReceiptMode] = useState<ReceiptMode>('none');
  const [recipient, setRecipient] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const sentScale = useRef(new Animated.Value(0)).current;
  const [printing, setPrinting] = useState(false);
  // Auto-advance to a new order so the cashier doesn't have to tap on a busy
  // morning. Pauses when the user is mid-flow (entering an email, just sent).
  const [countdown, setCountdown] = useState<number>(8);
  const isPaidTier = settings.tier === 'paid';
  const printerAvailable = isPrinterConnected();

  useEffect(() => {
    successNotification();

    Animated.sequence([
      Animated.spring(checkmarkScale, {
        toValue: 1,
        friction: 4,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [checkmarkScale, contentOpacity]);

  // Auto-advance countdown. Paused while the merchant is sending a receipt
  // (mid-input) or just sent one (so they have time to see the confirmation).
  useEffect(() => {
    if (receiptMode !== 'none' || sent) return;
    if (countdown <= 0) {
      onNewOrder();
      return;
    }
    const id = setTimeout(() => setCountdown((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown, receiptMode, sent, onNewOrder]);

  const handleSendReceipt = async () => {
    if (!lastOrder || !recipient.trim()) return;

    if (receiptMode === 'email' && !validateEmail(recipient)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    if (receiptMode === 'sms' && !validatePhone(recipient)) {
      Alert.alert('Invalid Phone', 'Please enter a valid phone number (10+ digits).');
      return;
    }

    setSending(true);
    try {
      const orderData: ReceiptOrderData = {
        subtotal: lastOrder.subtotal,
        taxAmount: lastOrder.taxAmount,
        tipAmount: lastOrder.tipAmount,
        total: lastOrder.total,
        paymentMethod: lastOrder.paymentMethod,
        createdAt: lastOrder.createdAt,
        cashTendered: lastOrder.cashTendered,
        items: lastOrder.items.map(item => {
          const modAdjustment = item.modifiers.reduce((s, m) => s + m.price_cents, 0);
          return {
            name: item.itemName,
            // Include modifier deltas so server-side renders the correct line price.
            price: item.itemPrice + modAdjustment,
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
        discount: lastOrder.discount,
      };
      const formattedRecipient = receiptMode === 'sms' ? formatPhoneE164(recipient) : recipient.trim();
      const result = await sendReceipt(lastOrder.orderId, receiptMode as 'sms' | 'email', formattedRecipient, settings.businessName || undefined, orderData);
      if (result.success) {
        setSent(true);
        Animated.spring(sentScale, {
          toValue: 1,
          friction: 4,
          tension: 60,
          useNativeDriver: true,
        }).start();
        successNotification();
        setTimeout(() => {
          setSent(false);
          sentScale.setValue(0);
          setReceiptMode('none');
          setRecipient('');
        }, 2500);
      } else {
        Alert.alert('Failed', 'Could not send receipt. Please try again.');
      }
    } catch (err) {
      // Stale JWT after an App Store update is a common failure mode here.
      // Surface a specific message so the user knows the fix is "sign out
      // and back in" rather than seeing the opaque generic error.
      if (err instanceof Error && err.message === 'Authentication expired') {
        Alert.alert(strings.errors.sessionExpiredTitle, strings.errors.sessionExpiredBody);
      } else {
        Alert.alert(strings.errors.generic);
      }
    } finally {
      setSending(false);
    }
  };

  if (!lastOrder) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorText}>{strings.errors.generic}</Text>
          <Button label={strings.receipt.newOrder} variant="primary" size="lg" onPress={onNewOrder} />
        </View>
      </SafeAreaView>
    );
  }

  const formattedDate = new Date(lastOrder.createdAt).toLocaleString();

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero — checkmark + headline + amount + metadata, one unified block */}
          <View style={styles.hero}>
            <Animated.View
              style={[styles.checkmark, { transform: [{ scale: checkmarkScale }] }]}
            >
              <Ionicons name="checkmark" size={32} color={colors.green} />
            </Animated.View>
            <Text style={styles.heroTitle}>Payment received</Text>
            <Text style={styles.heroAmount}>
              {formatCurrency(lastOrder.total, settings.currency)}
            </Text>
            <Text style={styles.heroMeta}>
              {lastOrder.paymentMethod === 'cash'
                ? 'Paid in cash'
                : lastOrder.cardLast4
                  ? `${lastOrder.cardBrand ?? 'Card'} ••••${lastOrder.cardLast4}`
                  : 'Paid by card'}
              {settings.businessName ? ` · ${settings.businessName}` : ''}
              {` · ${new Date(lastOrder.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
            </Text>
          </View>

          <Animated.View style={[styles.details, { opacity: contentOpacity }]}>
            {/* Cash-payment specifics — only when there's change due */}
            {lastOrder.paymentMethod === 'cash' && lastOrder.cashTendered && lastOrder.cashTendered > lastOrder.total ? (
              <View style={styles.changeStrip}>
                <View style={styles.changeRow}>
                  <Text style={styles.changeLabel}>Cash tendered</Text>
                  <Text style={styles.changeValue}>
                    {formatCurrency(lastOrder.cashTendered, settings.currency)}
                  </Text>
                </View>
                <View style={styles.changeRow}>
                  <Text style={styles.changeLabel}>Change due</Text>
                  <Text style={[styles.changeValue, { color: colors.green }]}>
                    {formatCurrency(lastOrder.cashTendered - lastOrder.total, settings.currency)}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Itemized list */}
            <View style={styles.itemsSection}>
              <FlatList
                data={lastOrder.items}
                keyExtractor={(item) => item.itemId}
                scrollEnabled={lastOrder.items.length > 10}
                style={lastOrder.items.length > 10 ? { maxHeight: 200 } : undefined}
                renderItem={({ item }) => {
                  // Line price must include modifier deltas — base price × qty
                  // alone is wrong any time the cashier customized an item.
                  const modAdjustment = item.modifiers.reduce((s, m) => s + m.price_cents, 0);
                  const lineTotal = (item.itemPrice + modAdjustment) * item.quantity;
                  return (
                    <View style={styles.lineItem}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.lineItemName}>
                          {item.itemName} <Text style={styles.lineItemQty}>× {item.quantity}</Text>
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

              {/* Subtotal / Discount / Tax / Tip breakdown */}
              <View style={styles.breakdownSection}>
                <View style={styles.lineItem}>
                  <Text style={styles.breakdownLabel}>{strings.receipt.subtotal}</Text>
                  <Text style={styles.breakdownValue}>
                    {formatCurrency(lastOrder.subtotal ?? lastOrder.total, settings.currency)}
                  </Text>
                </View>
                {lastOrder.discount && lastOrder.discount.amount > 0 ? (
                  <View style={styles.lineItem}>
                    <Text style={styles.breakdownLabel} numberOfLines={1}>
                      Discount
                      {lastOrder.discount.type === 'percent' ? ` · ${lastOrder.discount.value}% off` : null}
                      {lastOrder.discount.reason ? ` · ${lastOrder.discount.reason}` : null}
                    </Text>
                    <Text style={styles.breakdownValue}>
                      −{formatCurrency(lastOrder.discount.amount, settings.currency)}
                    </Text>
                  </View>
                ) : null}
                {(lastOrder.taxAmount ?? 0) > 0 ? (
                  <View style={styles.lineItem}>
                    <Text style={styles.breakdownLabel}>{strings.receipt.tax}</Text>
                    <Text style={styles.breakdownValue}>
                      {formatCurrency(lastOrder.taxAmount, settings.currency)}
                    </Text>
                  </View>
                ) : null}
                {(lastOrder.tipAmount ?? 0) > 0 ? (
                  <View style={styles.lineItem}>
                    <Text style={styles.breakdownLabel}>{strings.receipt.tip}</Text>
                    <Text style={styles.breakdownValue}>
                      {formatCurrency(lastOrder.tipAmount, settings.currency)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Custom receipt footer */}
            {settings.receiptFooter ? (
              <Text style={styles.receiptFooter}>{settings.receiptFooter}</Text>
            ) : null}
          </Animated.View>

          {/* Action buttons — flow naturally below receipt */}
          <View style={styles.footer}>
          {/* Print receipt (if printer connected) */}
          {printerAvailable ? (
            <Button
              label={printing ? '…' : 'Print Receipt'}
              variant="ghost"
              size="md"
              disabled={printing}
              accessibilityLabel="Print receipt"
              onPress={async () => {
                if (!lastOrder) return;
                setPrinting(true);
                try {
                  await printReceipt({
                    businessName: settings.businessName || 'OSPOS',
                    items: lastOrder.items.map((i) => {
                      const modAdjustment = i.modifiers.reduce((s, m) => s + m.price_cents, 0);
                      return {
                        name: i.itemName,
                        quantity: i.quantity,
                        price: i.itemPrice + modAdjustment,
                        modifiers: i.modifiers.length > 0
                          ? i.modifiers.map((m) => ({ name: m.name, priceCents: m.price_cents }))
                          : undefined,
                      };
                    }),
                    subtotal: lastOrder.subtotal ?? lastOrder.total,
                    taxAmount: lastOrder.taxAmount ?? 0,
                    tipAmount: lastOrder.tipAmount ?? 0,
                    total: lastOrder.total,
                    paymentMethod: lastOrder.paymentMethod,
                    timestamp: new Date(lastOrder.createdAt).toLocaleString(),
                    footerText: settings.receiptFooter || undefined,
                    discount: lastOrder.discount,
                  });
                  Alert.alert('Printed', 'Receipt sent to printer');
                } catch {
                  Alert.alert('Print Failed', 'Could not print receipt');
                } finally {
                  setPrinting(false);
                }
              }}
            />
          ) : null}

          {/* Receipt delivery options - SMS disabled pending carrier approval */}
          {sent ? (
              <View style={styles.sentConfirmation}>
                <Animated.View style={[styles.sentIcon, { transform: [{ scale: sentScale }] }]}>
                  <Ionicons name="mail" size={28} color={colors.primary} />
                </Animated.View>
                <Text style={styles.sentTitle}>Receipt Sent</Text>
                <Text style={styles.sentSubtitle}>{recipient}</Text>
              </View>
            ) : receiptMode === 'none' ? (
              <Button
                label="Email Receipt"
                variant="ghost"
                size="lg"
                onPress={() => setReceiptMode('email')}
                accessibilityLabel="Send receipt via email"
                leftIcon={<Ionicons name="mail-outline" size={20} color={colors.primary} />}
              />
            ) : (
              <View style={styles.recipientSection}>
                <Text style={styles.recipientLabel}>Email address</Text>
                <View style={styles.recipientRow}>
                  <TextInput
                    style={styles.recipientInput}
                    value={recipient}
                    onChangeText={setRecipient}
                    placeholder="customer@email.com"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoFocus
                    onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300)}
                  />
                  <View style={{ minWidth: 90 }}>
                    <Button
                      label={sending ? '…' : 'Send'}
                      variant="primary"
                      size="md"
                      onPress={handleSendReceipt}
                      disabled={!recipient.trim() || sending}
                    />
                  </View>
                </View>
                {/* Email domain suggestions */}
                {recipient.includes('@') && !recipient.includes('.', recipient.indexOf('@')) ? (
                  <View style={styles.domainSuggestions}>
                    {EMAIL_DOMAINS
                      .filter(domain => {
                        const afterAt = recipient.split('@')[1]?.toLowerCase() || '';
                        return domain.startsWith(afterAt);
                      })
                      .slice(0, 4)
                      .map(domain => (
                        <TouchableOpacity
                          key={domain}
                          style={styles.domainChip}
                          onPress={() => setRecipient(recipient.split('@')[0] + '@' + domain)}
                        >
                          <Text style={styles.domainChipText}>@{domain}</Text>
                        </TouchableOpacity>
                      ))}
                  </View>
                ) : null}
                <View style={{ alignItems: 'center', marginTop: spacing.sm }}>
                  <Button label="Cancel" variant="ghost" size="sm" onPress={() => { setReceiptMode('none'); setRecipient(''); }} />
                </View>
              </View>
            )}

          <View style={{ marginTop: spacing.md }}>
            <Button label={strings.receipt.newOrder} variant="primary" size="lg" onPress={onNewOrder} />
          </View>
          {receiptMode === 'none' && !sent ? (
            <Text style={styles.autoStartHint}>
              Auto-starting new order in {countdown}s
            </Text>
          ) : null}
        </View>
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
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxl,
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  checkmark: {
    width: 64,
    height: 64,
    borderRadius: 32,
    // Green-tinted background with a subtle ring — confirmation as a moment,
    // not a dim teal "maybe processed" feel.
    backgroundColor: 'rgba(52,199,89,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(52,199,89,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroTitle: {
    ...typography.displayMedium,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  heroAmount: {
    ...typography.displayLarge,
    textAlign: 'center',
  },
  heroMeta: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  details: {
    flex: 1,
  },
  changeStrip: {
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
  },
  changeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  changeLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  changeValue: {
    ...typography.bodyBold,
    fontVariant: ['tabular-nums'],
  },
  itemsSection: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
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
  lineItemQty: {
    color: colors.textMuted,
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
  breakdownSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
  breakdownLabel: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
  },
  breakdownValue: {
    ...typography.priceMuted,
  },
  receiptFooter: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  footer: {
    marginTop: spacing.xxl,
    gap: spacing.md,
  },
  autoStartHint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  receiptButtonRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  receiptButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: touchTargets.minimum,
    justifyContent: 'center',
  },
  receiptButtonText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  sentConfirmation: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.xs,
  },
  sentIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sentTitle: {
    ...typography.title3,
    color: colors.primary,
  },
  sentSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  recipientSection: {
    gap: spacing.sm,
  },
  recipientLabel: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  recipientRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  recipientInput: {
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
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    minHeight: touchTargets.minimum,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    ...typography.bodyBold,
    color: colors.black,
  },
  cancelText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  domainSuggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  domainChip: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  domainChipText: {
    ...typography.body,
    color: colors.primary,
    fontSize: 14,
  },
  errorText: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  newOrderButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    minHeight: touchTargets.chargeButton,
    justifyContent: 'center',
  },
  newOrderText: {
    ...typography.bodyBold,
    color: colors.black,
    fontSize: 18,
  },
});

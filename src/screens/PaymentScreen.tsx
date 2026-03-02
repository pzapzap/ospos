import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Reader } from '@stripe/stripe-terminal-react-native';
import { colors, typography, spacing, borderRadius, touchTargets } from '../constants/theme';
import { strings } from '../constants/strings';
import { formatCurrency, getCurrencyDecimals } from '../utils/currency';
import { useApp } from '../state/AppContext';
import { createOrder } from '../db/queries';
import { createPaymentIntent } from '../services/api';
import type { OrderAction, OrderState } from '../state/reducers';
import { useStripeTerminal } from '../services/terminal';
import { lightTap, successNotification, errorNotification } from '../utils/haptics';
import CashPaymentModal from '../components/CashPaymentModal';

interface PaymentScreenProps {
  onPaymentComplete: () => void;
  onBack: () => void;
}

const TERMINAL_LOCATION_ID = process.env.EXPO_PUBLIC_STRIPE_LOCATION_ID ?? '';
if (!TERMINAL_LOCATION_ID && __DEV__) {
  if (__DEV__) console.warn('[OSPOS] No EXPO_PUBLIC_STRIPE_LOCATION_ID configured — Tap to Pay may fail');
}

const TIP_OPTIONS = [
  { label: strings.payment.noTip, value: 0, percent: null, isCustom: false },
  { label: '15%', value: 0, percent: 15, isCustom: false },
  { label: '20%', value: 0, percent: 20, isCustom: false },
  { label: '25%', value: 0, percent: 25, isCustom: false },
  { label: strings.payment.customTip, value: 0, percent: null, isCustom: true },
];

// ── Card payment button — calls useStripeTerminal, only rendered on paid tier ──
interface CardButtonProps {
  order: OrderState;
  currency: string;
  isOnline: boolean;
  isTestMode: boolean;
  orderDispatch: React.Dispatch<OrderAction>;
  setLastOrder: (order: {
    orderId: string;
    total: number;
    paymentMethod: string;
    createdAt: string;
    items: OrderState['items'];
    cardLast4?: string;
    subtotal: number;
    taxAmount: number;
    tipAmount: number;
  } | null) => void;
  onPaymentComplete: () => void;
}

function CardButton({
  order,
  currency,
  isOnline,
  isTestMode,
  orderDispatch,
  setLastOrder,
  onPaymentComplete,
}: CardButtonProps) {
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const mountedRef = useRef(true);
  const readerResolverRef = useRef<((readers: Reader.Type[]) => void) | null>(null);

  const {
    initialize,
    isInitialized,
    discoverReaders,
    discoveredReaders,
    connectedReader,
    connectReader,
    retrievePaymentIntent,
    collectPaymentMethod,
    confirmPaymentIntent: confirmTerminalPayment,
    cancelDiscovering,
    supportsReadersOfType,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: (readers) => {
      if (__DEV__) console.log('[OSPOS] Callback: discovered readers:', readers.length);
      if (readers.length > 0 && readerResolverRef.current) {
        readerResolverRef.current(readers);
        readerResolverRef.current = null;
      }
    },
  });

  // Initialize the Terminal SDK on mount
  useEffect(() => {
    if (!isInitialized) {
      initialize().catch((err) => {
        if (__DEV__) console.warn('[OSPOS] Terminal init error:', err);
      });
    }
  }, [initialize, isInitialized]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      readerResolverRef.current = null;
      try { cancelDiscovering().catch(() => {}); } catch { /* SDK may not be initialized */ }
    };
  }, [cancelDiscovering]);

  const discoveredReadersRef = useRef(discoveredReaders);
  discoveredReadersRef.current = discoveredReaders;

  const waitForReaders = useCallback((): Promise<Reader.Type[]> => {
    return new Promise((resolve) => {
      // Set up resolver so onUpdateDiscoveredReaders callback can resolve it
      readerResolverRef.current = resolve;

      // Also poll the hook's discoveredReaders state as backup
      let attempts = 0;
      const poll = setInterval(() => {
        attempts++;
        if (discoveredReadersRef.current.length > 0) {
          clearInterval(poll);
          readerResolverRef.current = null;
          if (__DEV__) console.log('[OSPOS] Found readers via poll:', discoveredReadersRef.current.length);
          resolve(discoveredReadersRef.current);
        } else if (attempts >= 16) {
          clearInterval(poll);
          readerResolverRef.current = null;
          if (__DEV__) console.warn('[OSPOS] Reader discovery timed out');
          resolve([]);
        }
      }, 500);
    });
  }, []);

  const handlePress = async () => {
    if (!isOnline) {
      Alert.alert(strings.payment.offlineUnavailable, 'Card payments require an internet connection. Please use cash or try again when online.');
      return;
    }

    setProcessing(true);
    setStatus('Initializing...');

    try {
      // Ensure Terminal SDK is initialized before any operation
      if (!isInitialized) {
        const initResult = await initialize();
        if ('error' in initResult && initResult.error) {
          throw new Error(initResult.error.message ?? 'Failed to initialize Stripe Terminal');
        }
      }

      await lightTap();
      setStatus('Creating payment...');

      // order.total and order.tipAmount are already integer cents
      const { clientSecret, paymentIntentId } = await createPaymentIntent(
        order.total,
        currency.toLowerCase(),
        order.tipAmount > 0 ? order.tipAmount : undefined
      );

      if (!mountedRef.current) return;
      const { paymentIntent: piObject, error: retrieveError } =
        await retrievePaymentIntent(clientSecret);

      if (retrieveError || !piObject) {
        throw new Error(retrieveError?.message ?? 'Failed to retrieve payment intent');
      }

      if (!mountedRef.current) return;
      setStatus('Looking for reader...');
      let connected = !!connectedReader;

      if (connected) {
        if (__DEV__) console.log('[OSPOS] Already connected to reader:', connectedReader?.serialNumber);
      }

      // In test mode, use simulated Tap to Pay reader
      // In production, try Tap to Pay first, then fall back to Bluetooth
      if (!connected && isTestMode) {
        try {
          if (__DEV__) console.log('[OSPOS] Starting simulated Tap to Pay discovery...');
          setTimeout(() => {
            discoverReaders({
              discoveryMethod: 'tapToPay',
              simulated: true,
              locationId: TERMINAL_LOCATION_ID || undefined,
            }).then(({ error }) => {
              if (__DEV__) {
                if (error && __DEV__) console.warn('[OSPOS] Discovery error:', error.code, error.message);
                else if (__DEV__) console.log('[OSPOS] Discovery completed');
              }
            }).catch((e) => {
              if (__DEV__) console.warn('[OSPOS] Discovery threw:', e);
            });
          }, 100);

          if (__DEV__) console.log('[OSPOS] Waiting for readers...');
          const readers = await waitForReaders();
          if (__DEV__) console.log('[OSPOS] Readers found:', readers.length);
          if (readers.length > 0) {
            setStatus('Connecting simulated reader...');
            const { reader, error: connectErr } = await connectReader(
              {
                reader: readers[0],
                locationId: TERMINAL_LOCATION_ID || readers[0].locationId || undefined,
                autoReconnectOnUnexpectedDisconnect: true,
                tosAcceptancePermitted: true,
                merchantDisplayName: 'OSPOS',
              },
              'tapToPay'
            );
            if (__DEV__) console.log('[OSPOS] Connect result:', reader ? 'connected' : 'failed', connectErr?.message ?? '');
            if (reader && !connectErr) {
              connected = true;
            }
          }
        } catch (e) {
          if (__DEV__) console.warn('[OSPOS] Simulated reader error:', e instanceof Error ? e.message : e);
        }
      } else if (!connected) {
        // Production: try Tap to Pay first
        try {
          const tapSupport = await supportsReadersOfType({
            deviceType: 'tapToPay',
            discoveryMethod: 'tapToPay',
            simulated: false,
          });

          if (tapSupport?.readerSupportResult) {
            discoverReaders({
              discoveryMethod: 'tapToPay',
              simulated: false,
              locationId: TERMINAL_LOCATION_ID || undefined,
            }).then(({ error }) => {
              if (error && __DEV__) console.warn('[OSPOS] Tap discovery error:', error.message);
            });

            {
              const readers = await waitForReaders();
              if (readers.length > 0) {
                setStatus('Connecting Tap to Pay...');
                const { reader, error: connectErr } = await connectReader(
                  {
                    reader: readers[0],
                    locationId: TERMINAL_LOCATION_ID || readers[0].locationId || undefined,
                    autoReconnectOnUnexpectedDisconnect: true,
                    tosAcceptancePermitted: true,
                    merchantDisplayName: 'OSPOS',
                  },
                  'tapToPay'
                );
                if (reader && !connectErr) {
                  connected = true;
                }
              }
            }
          }
        } catch (e) {
          if (__DEV__) console.warn('[OSPOS] Tap to Pay not available:', e instanceof Error ? e.message : e);
        }

        // Fallback: real Bluetooth reader
        if (!connected) {
          try {
            if (!mountedRef.current) throw new Error('unmounted');
            await cancelDiscovering();

            discoverReaders({
              discoveryMethod: 'bluetoothScan',
              simulated: false,
            }).then(({ error }) => {
              if (error && __DEV__) console.warn('[OSPOS] BT discovery error:', error.message);
            });

            {
              const readers = await waitForReaders();
              if (readers.length > 0) {
                setStatus('Connecting reader...');
                const { reader, error: connectErr } = await connectReader(
                  {
                    reader: readers[0],
                    locationId: readers[0].locationId ?? undefined,
                    autoReconnectOnUnexpectedDisconnect: true,
                  },
                  'bluetoothScan'
                );
                if (reader && !connectErr) {
                  connected = true;
                }
              }
            }
          } catch {
            // No Bluetooth reader either
          }
        }
      }

      if (!connected) {
        throw new Error(
          isTestMode
            ? 'Could not connect simulated reader. Please try again.'
            : 'Reader search timed out. Make sure Tap to Pay is enabled or your Bluetooth reader is nearby and powered on.'
        );
      }

      if (!mountedRef.current) return;
      setStatus('Present card...');
      const { paymentIntent: collectedPI, error: collectErr } = await collectPaymentMethod({
        paymentIntent: piObject,
      });

      if (collectErr || !collectedPI) {
        throw new Error(collectErr?.message ?? 'Payment was cancelled');
      }

      if (!mountedRef.current) return;
      setStatus('Confirming...');
      const { paymentIntent: confirmedPI, error: confirmErr } = await confirmTerminalPayment({
        paymentIntent: collectedPI,
      });

      if (confirmErr || !confirmedPI) {
        throw new Error(confirmErr?.message ?? 'Payment confirmation failed');
      }

      if (confirmedPI.status !== 'succeeded') {
        throw new Error(`Payment status: ${confirmedPI.status}`);
      }

      const cardLast4 = (confirmedPI as { cardDetails?: { last4?: string } }).cardDetails?.last4 ?? undefined;

      if (!mountedRef.current) return;
      const orderResult = await createOrder({
        subtotal: order.subtotal,
        taxRate: order.taxRate,
        taxAmount: order.taxAmount,
        tipAmount: order.tipAmount,
        total: order.total,
        paymentMethod: 'card',
        stripePaymentId: paymentIntentId,
        // card_last4 intentionally NOT persisted to SQLite — PCI scope minimization
        items: order.items.map((item) => ({
          itemId: item.itemId,
          itemName: item.itemName,
          itemPrice: item.itemPrice,
          quantity: item.quantity,
        })),
      });

      await successNotification();

      setLastOrder({
        orderId: orderResult.id,
        total: orderResult.total,
        paymentMethod: orderResult.payment_method,
        createdAt: orderResult.created_at,
        items: order.items,
        cardLast4,
        subtotal: order.subtotal,
        taxAmount: order.taxAmount,
        tipAmount: order.tipAmount,
      });

      orderDispatch({ type: 'CLEAR_ORDER' });
      onPaymentComplete();
    } catch (error) {
      await errorNotification();
      Alert.alert(
        'Payment Failed',
        error instanceof Error ? error.message : 'Card payment failed. Try again or use cash.'
      );
    } finally {
      if (mountedRef.current) {
        setProcessing(false);
        setStatus('');
      }
    }
  };

  const disabled = !isOnline || processing;

  return (
    <TouchableOpacity
      style={[styles.cardButton, !disabled && styles.cardButtonEnabled]}
      onPress={handlePress}
      activeOpacity={disabled ? 1 : 0.7}
      disabled={disabled}
      accessibilityLabel={disabled ? 'Card payment unavailable' : 'Pay with card'}
      accessibilityRole="button"
    >
      {processing ? (
        <View style={styles.cardProcessingRow}>
          <ActivityIndicator color={colors.primary} size="small" />
          {status ? <Text style={styles.cardStatusText}>{status}</Text> : null}
        </View>
      ) : (
        <>
          <Ionicons name="card-outline" size={28} color={disabled ? colors.textMuted : colors.primary} />
          <Text style={[styles.cardButtonText, !disabled && styles.cardButtonTextEnabled]}>
            {strings.payment.card}
          </Text>
          {!isOnline ? (
            <Text style={styles.cardComingSoon}>Offline — unavailable</Text>
          ) : null}
        </>
      )}
    </TouchableOpacity>
  );
}

// ── Disabled card button for free tier — NO Stripe Terminal hook ──
function DisabledCardButton() {
  const handlePress = () => {
    Alert.alert(strings.payment.card, strings.payment.cardComingSoon);
  };

  return (
    <TouchableOpacity
      style={styles.cardButton}
      onPress={handlePress}
      activeOpacity={1}
      accessibilityLabel="Card payment unavailable"
      accessibilityRole="button"
    >
      <Ionicons name="card-outline" size={28} color={colors.textMuted} />
      <Text style={styles.cardButtonText}>{strings.payment.card}</Text>
      <Text style={styles.cardComingSoon}>{strings.payment.cardComingSoon}</Text>
    </TouchableOpacity>
  );
}

// ── Main PaymentScreen ──
export default function PaymentScreen({ onPaymentComplete, onBack }: PaymentScreenProps) {
  const { order, orderDispatch, settings, setLastOrder, isTestMode, isOnline } = useApp();
  const [selectedTip, setSelectedTip] = useState(0);
  const [showCashModal, setShowCashModal] = useState(false);
  const [customTipInput, setCustomTipInput] = useState('');
  const [showCustomTip, setShowCustomTip] = useState(false);
  const isPaidTier = settings.tier === 'paid';
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const subtotalForTip = order.subtotal; // cents
  const tipOptions = TIP_OPTIONS.map((opt) => {
    if (opt.percent) {
      return {
        ...opt,
        value: Math.round(subtotalForTip * (opt.percent / 100)), // cents
      };
    }
    return opt;
  });

  const handleTipSelect = async (index: number) => {
    await lightTap();
    const option = tipOptions[index];

    if (option.isCustom) {
      setShowCustomTip(true);
      return;
    }

    setSelectedTip(index);
    setShowCustomTip(false);
    orderDispatch({ type: 'SET_TIP', payload: { amount: option.value } });
  };

  const handleCustomTipConfirm = () => {
    const amountDisplay = parseFloat(customTipInput);
    if (isNaN(amountDisplay) || amountDisplay < 0) return;
    const decimals = getCurrencyDecimals(settings.currency);
    const multiplier = decimals === 0 ? 1 : Math.pow(10, decimals);
    const amountCents = Math.round(amountDisplay * multiplier);
    const maxTipCents = order.subtotal * 2; // subtotal is already cents
    if (amountCents > maxTipCents) {
      Alert.alert('Tip too large', `Maximum tip is ${formatCurrency(maxTipCents, settings.currency)}`);
      return;
    }
    orderDispatch({ type: 'SET_TIP', payload: { amount: amountCents } });
    setShowCustomTip(false);
  };

  const handleCashPayment = async () => {
    await lightTap();
    setShowCashModal(true);
  };

  const handleCashConfirm = async (cashTendered: number) => {
    try {
      const orderResult = await createOrder({
        subtotal: order.subtotal,
        taxRate: order.taxRate,
        taxAmount: order.taxAmount,
        tipAmount: order.tipAmount,
        total: order.total,
        paymentMethod: 'cash',
        items: order.items.map((item) => ({
          itemId: item.itemId,
          itemName: item.itemName,
          itemPrice: item.itemPrice,
          quantity: item.quantity,
        })),
      });

      await successNotification();

      setLastOrder({
        orderId: orderResult.id,
        total: orderResult.total,
        paymentMethod: orderResult.payment_method,
        createdAt: orderResult.created_at,
        items: order.items,
        subtotal: order.subtotal,
        taxAmount: order.taxAmount,
        tipAmount: order.tipAmount,
        cashTendered,
      });

      if (!mountedRef.current) return;
      setShowCashModal(false);
      orderDispatch({ type: 'CLEAR_ORDER' });
      onPaymentComplete();
    } catch {
      Alert.alert(strings.errors.orderFailed);
      if (mountedRef.current) setShowCashModal(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.totalSection}>
          <Text style={styles.totalLabel}>{strings.order.total}</Text>
          <Text style={styles.totalAmount}>
            {formatCurrency(order.total, settings.currency)}
          </Text>
          {isTestMode ? (
            <Text style={styles.testModeLabel}>TEST TRANSACTION — NO CHARGE</Text>
          ) : null}
        </View>

        {/* Tip Selection */}
        <View style={styles.tipSection}>
          <Text style={styles.tipTitle}>{strings.payment.tipTitle}</Text>
          <View style={styles.tipOptions}>
            {tipOptions.map((opt, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.tipButton,
                  selectedTip === index && !showCustomTip && styles.tipButtonSelected,
                ]}
                onPress={() => handleTipSelect(index)}
                accessibilityLabel={opt.isCustom ? 'Custom tip amount' : opt.percent ? `${opt.percent}% tip, ${formatCurrency(opt.value, settings.currency)}` : 'No tip'}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.tipButtonText,
                    selectedTip === index && !showCustomTip && styles.tipButtonTextSelected,
                  ]}
                >
                  {opt.label}
                </Text>
                {opt.percent && opt.value > 0 ? (
                  <Text style={styles.tipAmountText}>
                    {formatCurrency(opt.value, settings.currency)}
                  </Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
          {showCustomTip ? (
            <View style={styles.customTipRow}>
              <TextInput
                style={styles.customTipTextInput}
                value={customTipInput}
                onChangeText={setCustomTipInput}
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                autoFocus
                accessibilityLabel="Custom tip amount"
              />
              <TouchableOpacity
                style={styles.customTipConfirm}
                onPress={handleCustomTipConfirm}
              >
                <Text style={styles.customTipConfirmText}>OK</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {/* Payment Methods */}
        <View style={styles.paymentMethods}>
          <TouchableOpacity
            style={styles.cashButton}
            onPress={handleCashPayment}
            activeOpacity={0.7}
            accessibilityLabel="Pay with cash"
            accessibilityRole="button"
          >
            <Ionicons name="cash-outline" size={28} color={colors.black} />
            <Text style={styles.cashButtonText}>{strings.payment.cash}</Text>
          </TouchableOpacity>

          {isPaidTier ? (
            <CardButton
              order={order}
              currency={settings.currency}
              isOnline={isOnline}
              isTestMode={isTestMode}
              orderDispatch={orderDispatch}
              setLastOrder={setLastOrder}
              onPaymentComplete={onPaymentComplete}
            />
          ) : (
            <DisabledCardButton />
          )}
        </View>
      </View>

      <CashPaymentModal
        visible={showCashModal}
        total={order.total}
        currency={settings.currency}
        onConfirm={handleCashConfirm}
        onClose={() => setShowCashModal(false)}
      />
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
  totalSection: {
    alignItems: 'center',
    marginVertical: spacing.xxxl,
  },
  totalLabel: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  totalAmount: {
    ...typography.total,
    fontSize: 48,
  },
  testModeLabel: {
    ...typography.bodyBold,
    fontSize: 13,
    color: colors.danger,
    marginTop: spacing.sm,
  },
  tipSection: {
    marginBottom: spacing.xxxl,
  },
  tipTitle: {
    ...typography.bodyBold,
    marginBottom: spacing.md,
  },
  tipOptions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tipButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: touchTargets.minimum,
    justifyContent: 'center',
  },
  tipButtonSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceLight,
  },
  tipButtonText: {
    ...typography.bodyBold,
    color: colors.textSecondary,
    fontSize: 14,
  },
  tipButtonTextSelected: {
    color: colors.primary,
  },
  tipAmountText: {
    ...typography.priceMuted,
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  customTipRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  customTipTextInput: {
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
  customTipConfirm: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
  },
  customTipConfirmText: {
    ...typography.bodyBold,
    color: colors.black,
  },
  paymentMethods: {
    gap: spacing.md,
  },
  cashButton: {
    backgroundColor: colors.cash,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.xl,
    alignItems: 'center',
    minHeight: touchTargets.chargeButton,
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  cashButtonText: {
    ...typography.bodyBold,
    color: colors.black,
    fontSize: 20,
  },
  cardButton: {
    backgroundColor: colors.disabled,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.xl,
    alignItems: 'center',
    opacity: 0.5,
    minHeight: touchTargets.chargeButton,
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  cardButtonEnabled: {
    backgroundColor: colors.surfaceLight,
    opacity: 1,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  cardButtonText: {
    ...typography.bodyBold,
    color: colors.textSecondary,
    fontSize: 20,
  },
  cardButtonTextEnabled: {
    color: colors.primary,
  },
  cardComingSoon: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  cardProcessingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cardStatusText: {
    ...typography.body,
    color: colors.primary,
  },
});

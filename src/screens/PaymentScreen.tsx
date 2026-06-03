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
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Reader } from '@stripe/stripe-terminal-react-native';
import { colors, typography, spacing, borderRadius, touchTargets } from '../constants/theme';
import { strings } from '../constants/strings';
import { formatCurrency, getCurrencyDecimals } from '../utils/currency';
import { useApp } from '../state/AppContext';
import { createOrder } from '../db/queries';
import { createPaymentIntent, getTerminalLocationId } from '../services/api';
import type { OrderAction, OrderState } from '../state/reducers';
import { useStripeTerminal } from '../services/terminal';
import { lightTap, successNotification, errorNotification } from '../utils/haptics';
import CashPaymentModal from '../components/CashPaymentModal';
import ContactlessIcon from '../components/ContactlessIcon';
import Button from '../components/Button';
import { useScreenCaptureGuard } from '../utils/useScreenCaptureGuard';

interface PaymentScreenProps {
  onPaymentComplete: () => void;
  onBack: () => void;
  onTTPOiSetup?: () => void;
  onUpgrade?: () => void;
}

// Terminal location ID is loaded dynamically from SecureStore (set during auth/onboarding)

const TIP_OPTIONS = [
  { label: strings.payment.noTip, value: 0, percent: null, isCustom: false },
  { label: '15%', value: 0, percent: 15, isCustom: false },
  { label: '18%', value: 0, percent: 18, isCustom: false },
  { label: '20%', value: 0, percent: 20, isCustom: false },
  { label: strings.payment.customTip, value: 0, percent: null, isCustom: true },
];

// ── Card payment button — calls useStripeTerminal, only rendered on paid tier ──
interface CardButtonProps {
  order: OrderState;
  currency: string;
  isOnline: boolean;
  isTestMode: boolean;
  ttpOiSetupComplete: boolean;
  onSetup: () => void;
  orderDispatch: React.Dispatch<OrderAction>;
  setLastOrder: (order: {
    orderId: string;
    total: number;
    paymentMethod: string;
    createdAt: string;
    items: OrderState['items'];
    cardLast4?: string;
    cardBrand?: string;
    subtotal: number;
    taxAmount: number;
    tipAmount: number;
    cashTendered?: number;
    discount?: { type: 'percent' | 'amount'; value: number; amount: number; reason?: string };
  } | null) => void;
  onPaymentComplete: () => void;
}

function CardButton({
  order,
  currency,
  isOnline,
  isTestMode,
  ttpOiSetupComplete,
  onSetup,
  orderDispatch,
  setLastOrder,
  onPaymentComplete,
}: CardButtonProps) {
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const [terminalLocationId, setTerminalLocationId] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const readerResolverRef = useRef<((readers: Reader.Type[]) => void) | null>(null);

  // Load terminal location ID on mount
  useEffect(() => {
    getTerminalLocationId().then(setTerminalLocationId);
  }, []);

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

  // Store cancelDiscovering in a ref so cleanup only runs on unmount, not on every re-render
  const cancelDiscoveringRef = useRef(cancelDiscovering);
  cancelDiscoveringRef.current = cancelDiscovering;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      readerResolverRef.current = null;
      try { cancelDiscoveringRef.current().catch(() => {}); } catch { /* SDK may not be initialized */ }
    };
  }, []);

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
    // If TTPOi not set up, redirect to setup screen (Apple req 5.3 — never gray out)
    if (!ttpOiSetupComplete) {
      onSetup();
      return;
    }

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

      // Stripe minimum is 50 cents
      if (order.total < 50) {
        throw new Error(`Minimum card payment is ${formatCurrency(50, currency)}`);
      }

      setStatus('Creating payment...');

      // order.total and order.tipAmount are already integer cents
      const { clientSecret, paymentIntentId } = await createPaymentIntent(
        order.total,
        currency.toLowerCase(),
        order.tipAmount > 0 ? order.tipAmount : undefined,
        isTestMode
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

      // Connect to Tap to Pay on iPhone reader
      if (!connected) {
        const simulated = isTestMode;
        try {
          if (!simulated) {
            const tapSupport = await supportsReadersOfType({
              deviceType: 'tapToPay',
              discoveryMethod: 'tapToPay',
              simulated: false,
            });
            if (!tapSupport?.readerSupportResult) {
              throw new Error(strings.payment.noReaderAvailable);
            }
          }

          setStatus(simulated ? 'Connecting simulated reader...' : 'Connecting Tap to Pay on iPhone...');

          discoverReaders({
            discoveryMethod: 'tapToPay',
            simulated,
            locationId: terminalLocationId || undefined,
          }).then(({ error }) => {
            if (error && __DEV__) console.warn('[OSPOS] Tap discovery error:', error.message);
          });

          const readers = await waitForReaders();
          if (readers.length > 0) {
            const { reader, error: connectErr } = await connectReader(
              {
                reader: readers[0],
                locationId: terminalLocationId || readers[0].locationId || undefined,
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
        } catch (e) {
          if (__DEV__) console.warn('[OSPOS] Tap to Pay error:', e instanceof Error ? e.message : e);
          throw e;
        }
      }

      if (!connected) {
        throw new Error(strings.payment.noReaderAvailable);
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

      // Stripe Terminal SDK: card info is in charges[0].paymentMethodDetails.cardPresentDetails
      const piAny = confirmedPI as unknown as Record<string, unknown>;
      const charges = piAny.charges as Array<{ paymentMethodDetails?: { cardPresentDetails?: { last4?: string; brand?: string }; interacPresentDetails?: { last4?: string; brand?: string } } }> | undefined;
      const methodDetails = charges?.[0]?.paymentMethodDetails;
      const cardLast4 = methodDetails?.cardPresentDetails?.last4 ?? methodDetails?.interacPresentDetails?.last4 ?? undefined;
      const rawBrand = methodDetails?.cardPresentDetails?.brand ?? methodDetails?.interacPresentDetails?.brand ?? undefined;
      const cardBrand = rawBrand ? rawBrand.charAt(0).toUpperCase() + rawBrand.slice(1) : undefined;

      if (!mountedRef.current) return;
      const orderResult = await createOrder({
        subtotal: order.subtotal,
        taxRate: order.taxRate,
        taxAmount: order.taxAmount,
        tipAmount: order.tipAmount,
        total: order.total,
        paymentMethod: 'card',
        stripePaymentId: paymentIntentId,
        cardLast4,
        cardBrand,
        discount: order.discount
          ? {
              type: order.discount.type,
              value: order.discount.value,
              amountCents: order.discount.amount,
              reason: order.discount.reason,
            }
          : undefined,
        items: order.items.map((item) => ({
          itemId: item.itemId,
          itemName: item.itemName,
          itemPrice: item.itemPrice,
          quantity: item.quantity,
          modifiers: item.modifiers,  // persist selected modifiers per line
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
        cardBrand,
        subtotal: order.subtotal,
        taxAmount: order.taxAmount,
        tipAmount: order.tipAmount,
        discount: order.discount ?? undefined,
      });

      orderDispatch({ type: 'CLEAR_ORDER' });
      onPaymentComplete();
    } catch (error) {
      await errorNotification();
      const errMsg = error instanceof Error ? error.message : '';
      const errCode = (error as { code?: string })?.code ?? '';

      if (errCode === 'osVersionNotSupported' || errMsg.includes('osVersionNotSupported')) {
        Alert.alert(strings.ttpoi.osUpdateRequired, strings.ttpoi.osUpdateMessage);
      } else if (errCode === 'unsupported' || errMsg.includes('not supported')) {
        Alert.alert(strings.payment.paymentFailed, strings.ttpoi.incompatible);
      } else {
        Alert.alert(
          strings.payment.paymentFailed,
          errMsg || 'Card payment failed. Try again or use cash.'
        );
      }
    } finally {
      if (mountedRef.current) {
        setProcessing(false);
        setStatus('');
      }
    }
  };

  // Apple req 5.3: TTPOi button is NEVER grayed out
  const buttonDisabled = processing;

  return (
    <TouchableOpacity
      style={[styles.cardButton, styles.cardButtonEnabled]}
      onPress={handlePress}
      activeOpacity={buttonDisabled ? 1 : 0.7}
      disabled={buttonDisabled}
      accessibilityLabel={
        !ttpOiSetupComplete
          ? 'Set up Tap to Pay on iPhone'
          : processing
            ? 'Processing payment'
            : 'Pay with Tap to Pay on iPhone'
      }
      accessibilityRole="button"
    >
      {processing ? (
        <View style={styles.cardProcessingRow}>
          <ActivityIndicator color={colors.primary} size="small" />
          {status ? <Text style={styles.cardStatusText}>{status}</Text> : null}
        </View>
      ) : (
        <>
          <ContactlessIcon size={28} color={colors.primary} />
          <Text style={[styles.cardButtonText, styles.cardButtonTextEnabled]}>
            {strings.payment.card}
          </Text>
          {!isOnline && ttpOiSetupComplete ? (
            <Text style={styles.cardComingSoon}>Offline — unavailable</Text>
          ) : !ttpOiSetupComplete ? (
            <Text style={styles.cardComingSoon}>Tap to set up</Text>
          ) : null}
        </>
      )}
    </TouchableOpacity>
  );
}

// ── Disabled card button for free tier — NO Stripe Terminal hook ──
function DisabledCardButton({ onUpgrade }: { onUpgrade?: () => void }) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={[styles.cardButton, styles.cardButtonEnabled, { flexDirection: 'column', gap: spacing.xs }]}
        onPress={() => setShowModal(true)}
        activeOpacity={0.7}
        accessibilityLabel="Tap to Pay on iPhone"
        accessibilityRole="button"
      >
        <Text style={[styles.cardButtonText, styles.cardButtonTextEnabled]}>{strings.payment.card}</Text>
      </TouchableOpacity>
      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.upgradeOverlay}>
          <View style={styles.upgradeModal}>
            <Text style={styles.upgradeTitle}>{strings.payment.card}</Text>
            <Text style={styles.upgradeBody}>{strings.payment.cardComingSoon}</Text>
            <Button
              label="Set Up"
              variant="primary"
              size="lg"
              onPress={() => {
                setShowModal(false);
                onUpgrade?.();
              }}
            />
            <View style={{ alignItems: 'center', marginTop: spacing.sm }}>
              <Button
                label="Not Now"
                variant="ghost"
                size="md"
                onPress={() => setShowModal(false)}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ── Main PaymentScreen ──
export default function PaymentScreen({ onPaymentComplete, onBack, onTTPOiSetup, onUpgrade }: PaymentScreenProps) {
  useScreenCaptureGuard();
  const { order, orderDispatch, settings, setLastOrder, isTestMode, isOnline } = useApp();
  const ttpOiSetupComplete = settings.ttpOiSetupComplete === 'true';
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
        discount: order.discount
          ? {
              type: order.discount.type,
              value: order.discount.value,
              amountCents: order.discount.amount,
              reason: order.discount.reason,
            }
          : undefined,
        items: order.items.map((item) => ({
          itemId: item.itemId,
          itemName: item.itemName,
          itemPrice: item.itemPrice,
          quantity: item.quantity,
          modifiers: item.modifiers,  // persist selected modifiers per line
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
        discount: order.discount ?? undefined,
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
          <Text style={styles.totalLabel}>AMOUNT DUE</Text>
          <Text style={styles.totalAmount}>
            {formatCurrency(order.total, settings.currency)}
          </Text>
          <Text style={styles.totalItemsHint}>
            {order.items.reduce((n, i) => n + i.quantity, 0)} {order.items.reduce((n, i) => n + i.quantity, 0) === 1 ? 'item' : 'items'}
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
              <Button
                label="OK"
                variant="primary"
                size="md"
                onPress={handleCustomTipConfirm}
                style={{ minWidth: 80 }}
              />
            </View>
          ) : null}
        </View>

        {/* Payment Methods — TTPOi first (Apple req 5.2) */}
        <View style={styles.paymentMethods}>
          {isPaidTier ? (
            <CardButton
              order={order}
              currency={settings.currency}
              isOnline={isOnline}
              isTestMode={isTestMode}
              ttpOiSetupComplete={ttpOiSetupComplete}
              onSetup={() => onTTPOiSetup?.()}
              orderDispatch={orderDispatch}
              setLastOrder={setLastOrder}
              onPaymentComplete={onPaymentComplete}
            />
          ) : (
            <DisabledCardButton onUpgrade={onUpgrade} />
          )}

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
    ...typography.eyebrow,
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  totalAmount: {
    ...typography.displayHero,
    lineHeight: 60,
  },
  totalItemsHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.md,
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
    borderWidth: 2,
    borderColor: colors.border,
    minHeight: touchTargets.minimum,
    justifyContent: 'center',
  },
  tipButtonSelected: {
    borderColor: colors.primaryDark,
    backgroundColor: colors.primary,
  },
  tipButtonText: {
    ...typography.bodyBold,
    color: colors.textSecondary,
    fontSize: 14,
  },
  tipButtonTextSelected: {
    color: colors.background,
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
    borderWidth: 2,
    borderColor: colors.cashDark,
    borderBottomWidth: 4,
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
    borderWidth: 2,
    borderColor: colors.primaryDark,
    borderBottomWidth: 4,
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
  upgradeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  upgradeModal: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xxl,
    width: '100%',
    alignItems: 'center',
  },
  upgradeTitle: {
    ...typography.title2,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  upgradeBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xxl,
  },
  upgradeSetupButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    width: '100%',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  upgradeSetupText: {
    ...typography.bodyBold,
    color: colors.black,
    fontSize: 16,
  },
  upgradeDismissButton: {
    paddingVertical: spacing.md,
  },
  upgradeDismissText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});

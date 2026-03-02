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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, touchTargets } from '../constants/theme';
import { strings } from '../constants/strings';
import { formatCurrency } from '../utils/currency';
import { successNotification } from '../utils/haptics';
import { useApp } from '../state/AppContext';
import { sendReceipt } from '../services/api';
import { validateEmail, validatePhone } from '../utils/validation';
import { isPrinterConnected, printReceipt } from '../services/printer';

interface ReceiptScreenProps {
  onNewOrder: () => void;
}

type ReceiptMode = 'none' | 'sms' | 'email';

export default function ReceiptScreen({ onNewOrder }: ReceiptScreenProps) {
  const { lastOrder, settings } = useApp();
  const checkmarkScale = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const [receiptMode, setReceiptMode] = useState<ReceiptMode>('none');
  const [recipient, setRecipient] = useState('');
  const [sending, setSending] = useState(false);
  const [printing, setPrinting] = useState(false);
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
      const result = await sendReceipt(lastOrder.orderId, receiptMode as 'sms' | 'email', recipient.trim());
      if (result.success) {
        Alert.alert('Sent', `Receipt sent via ${receiptMode === 'sms' ? 'SMS' : 'email'}`);
        setReceiptMode('none');
        setRecipient('');
      } else {
        Alert.alert('Failed', 'Could not send receipt. Please try again.');
      }
    } catch {
      Alert.alert(strings.errors.generic);
    } finally {
      setSending(false);
    }
  };

  if (!lastOrder) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorText}>{strings.errors.generic}</Text>
          <TouchableOpacity style={styles.newOrderButton} onPress={onNewOrder}>
            <Text style={styles.newOrderText}>{strings.receipt.newOrder}</Text>
          </TouchableOpacity>
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
        <View style={styles.content}>
          {/* Checkmark Animation */}
          <Animated.View
            style={[styles.checkmark, { transform: [{ scale: checkmarkScale }] }]}
          >
            <Ionicons name="checkmark-sharp" size={44} color={colors.primary} />
          </Animated.View>

          <Text style={styles.title}>{strings.receipt.title}</Text>

          <Animated.View style={[styles.details, { opacity: contentOpacity }]}>
            {/* Business Name */}
            {settings.businessName ? (
              <Text style={styles.businessName}>{settings.businessName}</Text>
            ) : null}

            {/* Total */}
            <View style={styles.totalSection}>
              <Text style={styles.totalAmount}>
                {formatCurrency(lastOrder.total, settings.currency)}
              </Text>
            </View>

            {/* Info rows */}
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{strings.receipt.method}</Text>
              <Text style={styles.infoValue}>
                {lastOrder.paymentMethod === 'cash'
                  ? 'Cash'
                  : lastOrder.cardLast4
                    ? `Card ••••${lastOrder.cardLast4}`
                    : 'Card'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{strings.receipt.time}</Text>
              <Text style={styles.infoValue}>{formattedDate}</Text>
            </View>

            {/* Itemized list */}
            <View style={styles.itemsSection}>
              <FlatList
                data={lastOrder.items}
                keyExtractor={(item) => item.itemId}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <View style={styles.lineItem}>
                    <Text style={styles.lineItemName}>
                      {item.quantity}x {item.itemName}
                    </Text>
                    <Text style={styles.lineItemPrice}>
                      {formatCurrency(item.itemPrice * item.quantity, settings.currency)}
                    </Text>
                  </View>
                )}
              />

              {/* Subtotal / Tax / Tip breakdown */}
              <View style={styles.breakdownSection}>
                <View style={styles.lineItem}>
                  <Text style={styles.breakdownLabel}>{strings.receipt.subtotal}</Text>
                  <Text style={styles.breakdownValue}>
                    {formatCurrency(lastOrder.subtotal ?? lastOrder.total, settings.currency)}
                  </Text>
                </View>
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

            {/* Print receipt (if printer connected) */}
            {printerAvailable ? (
              <TouchableOpacity
                style={[styles.receiptButton, { marginTop: spacing.xl }]}
                onPress={async () => {
                  if (!lastOrder) return;
                  setPrinting(true);
                  try {
                    await printReceipt({
                      businessName: settings.businessName || 'OSPOS',
                      items: lastOrder.items.map((i) => ({
                        name: i.itemName,
                        quantity: i.quantity,
                        price: i.itemPrice,
                      })),
                      subtotal: lastOrder.subtotal ?? lastOrder.total,
                      taxAmount: lastOrder.taxAmount ?? 0,
                      tipAmount: lastOrder.tipAmount ?? 0,
                      total: lastOrder.total,
                      paymentMethod: lastOrder.paymentMethod,
                      timestamp: new Date(lastOrder.createdAt).toLocaleString(),
                      footerText: settings.receiptFooter || undefined,
                    });
                    Alert.alert('Printed', 'Receipt sent to printer');
                  } catch {
                    Alert.alert('Print Failed', 'Could not print receipt');
                  } finally {
                    setPrinting(false);
                  }
                }}
                disabled={printing}
              >
                {printing ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <Text style={styles.receiptButtonText}>Print Receipt</Text>
                )}
              </TouchableOpacity>
            ) : null}

            {/* Receipt delivery options (paid tier) */}
            {isPaidTier ? (
              <View style={styles.receiptOptions}>
                {receiptMode === 'none' ? (
                  <View style={styles.receiptButtons}>
                    <TouchableOpacity
                      style={styles.receiptButton}
                      onPress={() => setReceiptMode('sms')}
                    >
                      <Text style={styles.receiptButtonText}>Text Receipt</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.receiptButton}
                      onPress={() => setReceiptMode('email')}
                    >
                      <Text style={styles.receiptButtonText}>Email Receipt</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.recipientSection}>
                    <Text style={styles.recipientLabel}>
                      {receiptMode === 'sms' ? 'Phone number' : 'Email address'}
                    </Text>
                    <View style={styles.recipientRow}>
                      <TextInput
                        style={styles.recipientInput}
                        value={recipient}
                        onChangeText={setRecipient}
                        placeholder={
                          receiptMode === 'sms' ? '+1 (555) 123-4567' : 'customer@email.com'
                        }
                        placeholderTextColor={colors.textMuted}
                        keyboardType={receiptMode === 'sms' ? 'phone-pad' : 'email-address'}
                        autoCapitalize="none"
                        autoFocus
                      />
                      {sending ? (
                        <View style={styles.sendButton}>
                          <ActivityIndicator color={colors.black} size="small" />
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={[
                            styles.sendButton,
                            !recipient.trim() && styles.sendButtonDisabled,
                          ]}
                          onPress={handleSendReceipt}
                          disabled={!recipient.trim()}
                        >
                          <Text style={styles.sendButtonText}>Send</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <TouchableOpacity onPress={() => { setReceiptMode('none'); setRecipient(''); }}>
                      <Text style={styles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ) : null}
          </Animated.View>

          {/* New Order Button */}
          <TouchableOpacity
            style={styles.newOrderButton}
            onPress={onNewOrder}
            activeOpacity={0.7}
          >
            <Text style={styles.newOrderText}>{strings.receipt.newOrder}</Text>
          </TouchableOpacity>
        </View>
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
  content: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxxl,
  },
  checkmark: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.successLight,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.title1,
    textAlign: 'center',
    marginBottom: spacing.xxxl,
  },
  details: {
    flex: 1,
  },
  businessName: {
    ...typography.bodyBold,
    textAlign: 'center',
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  totalSection: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  totalAmount: {
    ...typography.total,
    fontSize: 40,
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
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
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
  receiptOptions: {
    marginTop: spacing.xl,
  },
  receiptButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  receiptButton: {
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
  receiptButtonText: {
    ...typography.bodyBold,
    color: colors.primary,
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
    marginBottom: spacing.xxl,
    minHeight: touchTargets.chargeButton,
    justifyContent: 'center',
  },
  newOrderText: {
    ...typography.bodyBold,
    color: colors.black,
    fontSize: 18,
  },
});

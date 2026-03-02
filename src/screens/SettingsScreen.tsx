import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Switch,
  Alert,
  Linking,
  Modal,
  FlatList,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import * as Sentry from '@sentry/react-native';
import { colors, typography, spacing, borderRadius, touchTargets } from '../constants/theme';
import { strings } from '../constants/strings';
import { useApp } from '../state/AppContext';
import { SUPPORTED_CURRENCIES } from '../utils/currency';
import { validateTaxRate, MAX_BUSINESS_NAME_LENGTH, MAX_RECEIPT_FOOTER_LENGTH } from '../utils/validation';
import { performBackup, recordBackupTime } from '../utils/backup';
import { getSyncHealth, forceRetryFailed } from '../services/sync';
import {
  scanForPrinters,
  connectPrinter,
  disconnectPrinter,
  isPrinterConnected,
  type PrinterInfo,
} from '../services/printer';

interface SettingsScreenProps {
  onDisputesTap?: () => void;
  onUpgrade?: () => void;
}

export default function SettingsScreen({ onDisputesTap, onUpgrade }: SettingsScreenProps) {
  const { settings, updateSetting, isTestMode } = useApp();
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [syncHealth, setSyncHealth] = useState<{
    pendingCount: number;
    failedCount: number;
    lastSyncedAt: string | null;
  } | null>(null);
  const [printerConnected, setPrinterConnected] = useState(isPrinterConnected());
  const [scanning, setScanning] = useState(false);
  const [foundPrinters, setFoundPrinters] = useState<PrinterInfo[]>([]);

  const isPaidTier = settings.tier === 'paid';

  // Load sync health on focus
  useFocusEffect(
    useCallback(() => {
      if (isPaidTier) {
        getSyncHealth().then(setSyncHealth).catch(() => {});
      }
    }, [isPaidTier])
  );

  const handleBackupNow = async () => {
    try {
      const path = await performBackup();
      if (path) {
        await recordBackupTime();
        Alert.alert(strings.settings.backupSuccess);
      } else {
        Alert.alert(strings.summary.noTransactions);
      }
    } catch {
      Alert.alert(strings.errors.generic);
    }
  };

  const handleTestModeToggle = (value: boolean) => {
    if (!value && isTestMode) {
      // Exiting test mode requires confirmation
      Alert.alert(
        'Exit Test Mode',
        'Exit Test Mode and process real payments?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Exit Test Mode',
            style: 'destructive',
            onPress: () => updateSetting('testMode', 'off'),
          },
        ]
      );
    } else {
      updateSetting('testMode', value ? 'on' : 'off');
    }
  };

  const handleForceRetry = async () => {
    try {
      await forceRetryFailed();
      const health = await getSyncHealth();
      setSyncHealth(health);
      Alert.alert('Retry triggered');
    } catch {
      Alert.alert(strings.errors.generic);
    }
  };

  const getSyncStatusText = (): string => {
    if (!syncHealth) return '';
    if (syncHealth.failedCount > 0) {
      return `Sync issues: ${syncHealth.failedCount} records pending`;
    }
    if (syncHealth.lastSyncedAt) {
      const ago = Date.now() - new Date(syncHealth.lastSyncedAt).getTime();
      const mins = Math.round(ago / 60000);
      if (mins < 1) return 'Last sync: just now';
      return `Last sync: ${mins} min ago`;
    }
    if (syncHealth.pendingCount > 0) {
      return `${syncHealth.pendingCount} records pending`;
    }
    return 'Synced';
  };

  const selectedCurrency = SUPPORTED_CURRENCIES.find(
    (c) => c.code === settings.currency
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{strings.settings.title}</Text>

        {/* Business Name */}
        <View style={styles.section}>
          <Text style={styles.label}>{strings.settings.businessName}</Text>
          <TextInput
            style={styles.input}
            value={settings.businessName}
            onChangeText={(val) => updateSetting('businessName', val)}
            placeholder={strings.settings.businessNamePlaceholder}
            placeholderTextColor={colors.textMuted}
            maxLength={MAX_BUSINESS_NAME_LENGTH}
          />
        </View>

        {/* Tax Rate */}
        <View style={styles.section}>
          <Text style={styles.label}>{strings.settings.taxRate}</Text>
          <TextInput
            style={styles.input}
            value={settings.taxRate}
            onChangeText={(val) => {
              const result = validateTaxRate(val);
              if (val === '' || result.valid || val.endsWith('.')) {
                updateSetting('taxRate', val);
              }
            }}
            placeholder={strings.settings.taxRatePlaceholder}
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            maxLength={6}
          />
          <Text style={styles.hint}>{strings.settings.taxNote}</Text>
        </View>

        {/* Currency */}
        <View style={styles.section}>
          <Text style={styles.label}>{strings.settings.currency}</Text>
          <TouchableOpacity
            style={styles.pickerButton}
            onPress={() => setShowCurrencyPicker(true)}
          >
            <Text style={styles.pickerText}>
              {selectedCurrency
                ? `${selectedCurrency.symbol} ${selectedCurrency.code} — ${selectedCurrency.name}`
                : settings.currency}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Receipt Footer */}
        <View style={styles.section}>
          <Text style={styles.label}>{strings.settings.receiptFooter}</Text>
          <TextInput
            style={styles.input}
            value={settings.receiptFooter}
            onChangeText={(val) => updateSetting('receiptFooter', val)}
            placeholder={strings.settings.receiptFooterPlaceholder}
            placeholderTextColor={colors.textMuted}
            maxLength={MAX_RECEIPT_FOOTER_LENGTH}
          />
        </View>

        {/* Upgrade to paid tier (free tier only) */}
        {!isPaidTier ? (
          <TouchableOpacity
            style={styles.upgradeButton}
            onPress={() => {
              if (onUpgrade) {
                onUpgrade();
              } else {
                Alert.alert('Upgrade', 'Account creation is required to accept card payments. Please reinstall or contact support.');
              }
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.upgradeButtonText}>{strings.settings.upgradeToPaid}</Text>
            <Text style={styles.upgradeHint}>{strings.settings.upgradeHint}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.upgradeButton, { backgroundColor: colors.danger }]}
            onPress={() => {
              Alert.alert(
                'Reset Account',
                'This will sign you out and reset to the onboarding screen. You can re-register with the real server.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Reset',
                    style: 'destructive',
                    onPress: async () => {
                      await AsyncStorage.removeItem('ospos_tier_selected');
                      await AsyncStorage.removeItem('ospos_auth_token');
                      Alert.alert('Done', 'Restart the app now.');
                    },
                  },
                ]
              );
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.upgradeButtonText}>Reset Account</Text>
            <Text style={styles.upgradeHint}>Sign out and re-do onboarding</Text>
          </TouchableOpacity>
        )}

        {/* Test Mode (paid tier only) */}
        {isPaidTier ? (
          <View style={styles.section}>
            <View style={styles.switchRow}>
              <Text style={styles.label}>Test Mode</Text>
              <Switch
                value={isTestMode}
                onValueChange={handleTestModeToggle}
                trackColor={{ false: colors.disabled, true: colors.dangerDark }}
                thumbColor={colors.white}
              />
            </View>
            {isTestMode ? (
              <Text style={styles.testModeWarning}>
                Test mode active — no real charges will be processed
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Sync Health (paid tier only) */}
        {isPaidTier && syncHealth ? (
          <View style={styles.section}>
            <Text style={styles.label}>Sync</Text>
            <TouchableOpacity
              style={styles.syncIndicator}
              onPress={syncHealth.failedCount > 0 ? handleForceRetry : undefined}
            >
              <Text
                style={[
                  styles.syncText,
                  syncHealth.failedCount > 0 && styles.syncWarning,
                ]}
              >
                {getSyncStatusText()}{' '}
                {syncHealth.failedCount > 0 ? '⚠' : '✓'}
              </Text>
              {syncHealth.failedCount > 0 ? (
                <Text style={styles.syncRetryText}>Tap to force retry</Text>
              ) : null}
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Account Management (paid tier only) */}
        {isPaidTier && settings.userEmail ? (
          <View style={styles.section}>
            <Text style={styles.label}>Account</Text>
            <Text style={styles.accountEmail}>{settings.userEmail}</Text>
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => Linking.openURL('https://dashboard.stripe.com')}
            >
              <Text style={styles.linkText}>Open Stripe Dashboard</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Disputes (paid tier only) */}
        {isPaidTier && onDisputesTap ? (
          <TouchableOpacity style={styles.linkRow} onPress={onDisputesTap}>
            <Text style={styles.linkText}>Disputes</Text>
          </TouchableOpacity>
        ) : null}

        {/* Bluetooth Printer */}
        <View style={styles.section}>
          <Text style={styles.label}>Receipt Printer</Text>
          {printerConnected ? (
            <View style={styles.syncIndicator}>
              <Text style={styles.syncText}>Printer connected ✓</Text>
              <TouchableOpacity
                onPress={async () => {
                  await disconnectPrinter();
                  setPrinterConnected(false);
                }}
              >
                <Text style={[styles.syncRetryText, { color: colors.danger }]}>Disconnect</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={styles.backupButton}
                onPress={async () => {
                  setScanning(true);
                  setFoundPrinters([]);
                  try {
                    const printers = await scanForPrinters();
                    setFoundPrinters(printers);
                    if (printers.length === 0) {
                      Alert.alert('No Printers Found', 'Make sure your Bluetooth printer is turned on and nearby.');
                    }
                  } catch {
                    Alert.alert(strings.errors.generic);
                  } finally {
                    setScanning(false);
                  }
                }}
                activeOpacity={0.7}
                disabled={scanning}
              >
                <Text style={styles.backupButtonText}>
                  {scanning ? 'Scanning...' : 'Scan for Printers'}
                </Text>
              </TouchableOpacity>
              {foundPrinters.map((printer) => (
                <TouchableOpacity
                  key={printer.id}
                  style={[styles.syncIndicator, { marginTop: spacing.sm }]}
                  onPress={async () => {
                    const connected = await connectPrinter(printer.id);
                    if (connected) {
                      setPrinterConnected(true);
                      setFoundPrinters([]);
                      Alert.alert('Connected', `Paired with ${printer.name}`);
                    } else {
                      Alert.alert('Failed', 'Could not connect to printer');
                    }
                  }}
                >
                  <Text style={styles.syncText}>{printer.name}</Text>
                  <Text style={styles.syncRetryText}>Tap to connect</Text>
                </TouchableOpacity>
              ))}
            </>
          )}
        </View>

        {/* Auto-Backup */}
        <View style={styles.section}>
          <View style={styles.switchRow}>
            <Text style={styles.label}>{strings.settings.autoBackup}</Text>
            <Switch
              value={settings.autoBackup === 'on'}
              onValueChange={(val) =>
                updateSetting('autoBackup', val ? 'on' : 'off')
              }
              trackColor={{ false: colors.disabled, true: colors.primaryDark }}
              thumbColor={colors.white}
            />
          </View>
          <TouchableOpacity
            style={styles.backupButton}
            onPress={handleBackupNow}
            activeOpacity={0.7}
          >
            <Text style={styles.backupButtonText}>{strings.settings.backupNow}</Text>
          </TouchableOpacity>
        </View>

        {/* Help & Support */}
        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => Linking.openURL('https://ospos.app/help')}
        >
          <Text style={styles.linkText}>{strings.settings.helpSupport}</Text>
        </TouchableOpacity>

        {/* About */}
        <View style={styles.aboutSection}>
          <Text style={styles.aboutTitle}>{strings.settings.about}</Text>
          <Text style={styles.aboutText}>
            {strings.app.name} v{strings.app.version}
          </Text>
          <Text style={styles.aboutText}>{strings.app.license}</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://github.com/ospos/ospos')}
          >
            <Text style={styles.linkText}>GitHub</Text>
          </TouchableOpacity>
          {__DEV__ ? (
            <TouchableOpacity
              style={styles.sentryTestButton}
              onPress={() => {
                Sentry.captureException(new Error('Sentry test error from Settings'));
                Alert.alert('Sentry Test', 'Test error sent to Sentry. Check your dashboard.');
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.sentryTestText}>Test Sentry</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>

      {/* Currency Picker Modal */}
      <Modal visible={showCurrencyPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{strings.settings.currency}</Text>
            <FlatList
              data={SUPPORTED_CURRENCIES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.currencyRow,
                    item.code === settings.currency && styles.currencyRowSelected,
                  ]}
                  onPress={() => {
                    updateSetting('currency', item.code);
                    setShowCurrencyPicker(false);
                  }}
                >
                  <Text style={styles.currencySymbol}>{item.symbol}</Text>
                  <Text style={styles.currencyCode}>{item.code}</Text>
                  <Text style={styles.currencyName}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setShowCurrencyPicker(false)}
            >
              <Text style={styles.modalCloseText}>{strings.menuBuilder.cancel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xxl, paddingTop: spacing.xl, paddingBottom: spacing.xxxl },
  title: { ...typography.title1, marginBottom: spacing.xxl },
  section: { marginBottom: spacing.xxl },
  label: { ...typography.caption, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm },
  input: { backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.lg, ...typography.body, color: colors.text, borderWidth: 1, borderColor: colors.border },
  hint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 18 },
  pickerButton: { backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  pickerText: { ...typography.body },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  testModeWarning: { ...typography.bodyBold, fontSize: 13, color: colors.danger },
  syncIndicator: { backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  syncText: { ...typography.body },
  syncWarning: { color: colors.warning },
  syncRetryText: { ...typography.caption, color: colors.primary, marginTop: spacing.xs },
  accountEmail: { ...typography.body, marginBottom: spacing.sm },
  linkButton: { paddingVertical: spacing.sm },
  backupButton: { backgroundColor: colors.surface, borderRadius: borderRadius.md, paddingVertical: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border, minHeight: touchTargets.minimum, justifyContent: 'center' },
  backupButtonText: { ...typography.bodyBold, color: colors.textSecondary },
  linkRow: { paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: spacing.lg },
  linkText: { ...typography.body, color: colors.primary },
  upgradeButton: { backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: spacing.lg, paddingHorizontal: spacing.xl, alignItems: 'center', marginBottom: spacing.xxl },
  upgradeButtonText: { ...typography.bodyBold, color: colors.black, fontSize: 16 },
  upgradeHint: { ...typography.caption, color: colors.black, opacity: 0.8, marginTop: spacing.xs },
  aboutSection: { paddingTop: spacing.lg, gap: spacing.xs },
  aboutTitle: { ...typography.bodyBold, marginBottom: spacing.sm },
  aboutText: { ...typography.caption },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modal: { backgroundColor: colors.surface, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, padding: spacing.xxl, maxHeight: '70%' },
  modalTitle: { ...typography.title2, textAlign: 'center', marginBottom: spacing.xl },
  currencyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderRadius: borderRadius.sm, marginBottom: spacing.xs },
  currencyRowSelected: { backgroundColor: colors.cardHighlight },
  currencySymbol: { ...typography.bodyBold, width: 40 },
  currencyCode: { ...typography.bodyBold, width: 50 },
  currencyName: { ...typography.body, color: colors.textSecondary, flex: 1 },
  modalClose: { marginTop: spacing.lg, paddingVertical: spacing.lg, alignItems: 'center', backgroundColor: colors.cardHighlight, borderRadius: borderRadius.md },
  modalCloseText: { ...typography.bodyBold, color: colors.textSecondary },
  sentryTestButton: { marginTop: spacing.md, backgroundColor: colors.surface, borderRadius: borderRadius.md, paddingVertical: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.warning },
  sentryTestText: { ...typography.bodyBold, color: colors.warning },
});

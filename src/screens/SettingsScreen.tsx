import React, { useState, useCallback, useRef } from 'react';
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
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import Button from '../components/Button';
import { stepUpAuth } from '../utils/stepUpAuth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearToken, deleteAccount } from '../services/api';
import { useFocusEffect } from '@react-navigation/native';
import * as Sentry from '@sentry/react-native';
import { colors, typography, spacing, borderRadius, touchTargets } from '../constants/theme';
import { strings } from '../constants/strings';
import { useApp } from '../state/AppContext';
import { SUPPORTED_CURRENCIES } from '../utils/currency';
import { MAX_BUSINESS_NAME_LENGTH, MAX_RECEIPT_FOOTER_LENGTH } from '../utils/validation';
import { performBackup, recordBackupTime } from '../utils/backup';
import { shareMenuJson } from '../utils/menuExport';
import { pickAndPreviewMenu, applyMenuImport } from '../utils/menuImport';
import { getSyncHealth, forceRetryFailed } from '../services/sync';
import {
  scanForPrinters,
  connectPrinter,
  disconnectPrinter,
  isPrinterConnected,
  type PrinterInfo,
} from '../services/printer';
import CurrencyPickerModal from '../components/CurrencyPickerModal';
import TaxRateModal from '../components/TaxRateModal';

interface SettingsScreenProps {
  onDisputesTap?: () => void;
  onUpgrade?: () => void;
  onTTPOiSetup?: () => void;
  onTTPOiEducation?: () => void;
  onAccountDeleted?: () => void;
  onButtonShowcase?: () => void;
}

export default function SettingsScreen({ onDisputesTap, onUpgrade, onTTPOiSetup, onTTPOiEducation, onAccountDeleted, onButtonShowcase }: SettingsScreenProps) {
  const { settings, updateSetting, isTestMode, stripeRequirements, checkStripeRequirements } = useApp();
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [showTaxRateModal, setShowTaxRateModal] = useState(false);
  const [localBusinessName, setLocalBusinessName] = useState(settings.businessName);
  const [localReceiptFooter, setLocalReceiptFooter] = useState(settings.receiptFooter);
  const businessNameSyncedRef = useRef(settings.businessName);
  const receiptFooterSyncedRef = useRef(settings.receiptFooter);

  // Keep local state in sync if settings change externally
  if (settings.businessName !== businessNameSyncedRef.current) {
    businessNameSyncedRef.current = settings.businessName;
    setLocalBusinessName(settings.businessName);
  }
  if (settings.receiptFooter !== receiptFooterSyncedRef.current) {
    receiptFooterSyncedRef.current = settings.receiptFooter;
    setLocalReceiptFooter(settings.receiptFooter);
  }
  const [syncHealth, setSyncHealth] = useState<{
    pendingCount: number;
    failedCount: number;
    lastSyncedAt: string | null;
  } | null>(null);
  const [printerConnected, setPrinterConnected] = useState(isPrinterConnected());
  const [scanning, setScanning] = useState(false);
  const [foundPrinters, setFoundPrinters] = useState<PrinterInfo[]>([]);

  const isPaidTier = settings.tier === 'paid';

  // Load sync health and check Stripe requirements on focus
  useFocusEffect(
    useCallback(() => {
      if (isPaidTier) {
        getSyncHealth().then(setSyncHealth).catch(() => {});
        checkStripeRequirements();
      }
    }, [isPaidTier, checkStripeRequirements])
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

  // Hidden in plain sight for v1.1 — no marketing copy, no onboarding pointer.
  // Becomes a featured surface in v1.2 when menu templates ship and merchants
  // need an obvious way to export/import. For now, merchants who scroll to
  // the bottom of Advanced and notice this can use it to back up their menu.
  const handleExportMenu = async () => {
    try {
      const { shared, itemCount } = await shareMenuJson('1.1.0');
      if (itemCount === 0) {
        Alert.alert('No items', 'Add some menu items first.');
        return;
      }
      if (!shared) {
        Alert.alert('Sharing not available', 'The iOS share sheet could not open. Try again in a moment.');
      }
    } catch {
      Alert.alert(strings.errors.generic);
    }
  };

  // Symmetric counterpart to Export. Reads a JSON file from the iOS file
  // picker, shows a confirmation summary, and adds rows to the existing
  // menu (additive — does NOT wipe). New UUIDs are generated for every
  // row so re-importing the same file produces duplicates not collisions.
  const handleImportMenu = async () => {
    try {
      const preview = await pickAndPreviewMenu();
      if (!preview) return; // user cancelled
      if (preview.itemCount === 0) {
        Alert.alert('Nothing to import', 'That file didn\'t contain any items.');
        return;
      }
      const rejectedNote = (preview.rejectedItems + preview.rejectedModifiers) > 0
        ? `\n\n${preview.rejectedItems} item${preview.rejectedItems === 1 ? '' : 's'} and ${preview.rejectedModifiers} option${preview.rejectedModifiers === 1 ? '' : 's'} were skipped (missing names, invalid stickers, or over limit).`
        : '';
      Alert.alert(
        'Add to menu?',
        `${preview.itemCount} item${preview.itemCount === 1 ? '' : 's'}, ${preview.groupCount} modifier group${preview.groupCount === 1 ? '' : 's'}, ${preview.modifierCount} option${preview.modifierCount === 1 ? '' : 's'}.\n\nThis adds to your existing menu — nothing is removed.${rejectedNote}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Add',
            onPress: async () => {
              try {
                const result = await applyMenuImport(preview.parsed);
                Alert.alert(
                  'Menu imported',
                  `Added ${result.items} item${result.items === 1 ? '' : 's'}, ${result.groups} group${result.groups === 1 ? '' : 's'}, ${result.modifiers} option${result.modifiers === 1 ? '' : 's'}.`,
                );
              } catch (err) {
                Alert.alert('Import failed', err instanceof Error ? err.message : 'Could not import the menu.');
              }
            },
          },
        ]
      );
    } catch (err) {
      Alert.alert('Import failed', err instanceof Error ? err.message : 'Could not read that file.');
    }
  };

  const handleTestModeToggle = (value: boolean) => {
    if (!value && isTestMode) {
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

  const taxDisplay = settings.taxRate === '0' || settings.taxRate === '' ? '0%' : `${settings.taxRate}%`;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{strings.settings.title}</Text>

        {/* Stripe Requirements Banner */}
        {isPaidTier && stripeRequirements?.has_requirements ? (
          <TouchableOpacity
            style={styles.requirementsBanner}
            onPress={() => {
              if (stripeRequirements.remediation_url) {
                Linking.openURL(stripeRequirements.remediation_url);
              } else {
                Linking.openURL('https://dashboard.stripe.com');
              }
            }}
            activeOpacity={0.7}
          >
            {stripeRequirements.currently_due.length > 0 || stripeRequirements.past_due.length > 0 ? (
              <>
                <Text style={styles.requirementsBannerTitle}>Action needed</Text>
                <Text style={styles.requirementsBannerText}>
                  Complete your Stripe setup to accept card payments
                </Text>
                <Text style={styles.requirementsBannerLink}>Tap to continue setup →</Text>
              </>
            ) : !stripeRequirements.charges_enabled ? (
              <>
                <Text style={styles.requirementsBannerTitle}>Verification pending</Text>
                <Text style={styles.requirementsBannerText}>
                  Stripe is reviewing your account. Card payments will be available once verified.
                </Text>
                <Text style={styles.requirementsBannerLink}>Tap to check status →</Text>
              </>
            ) : null}
          </TouchableOpacity>
        ) : null}

        <Text style={styles.sectionLabel}>Business</Text>
        <View style={styles.card}>
          {/* Name — inline edit, right-aligned in row */}
          <View style={styles.cardRow}>
            <Text style={styles.cardRowLabel}>Name</Text>
            <TextInput
              style={styles.cardRowInput}
              value={localBusinessName}
              onChangeText={setLocalBusinessName}
              onBlur={() => {
                if (localBusinessName !== settings.businessName) {
                  updateSetting('businessName', localBusinessName);
                }
              }}
              placeholder={strings.settings.businessNamePlaceholder}
              placeholderTextColor={colors.textMuted}
              maxLength={MAX_BUSINESS_NAME_LENGTH}
              autoCapitalize="words"
              accessibilityLabel="Business name"
            />
          </View>
          <View style={styles.cardDivider} />
          {/* Tax rate — tap to open picker */}
          <TouchableOpacity
            style={styles.cardRow}
            onPress={() => setShowTaxRateModal(true)}
            accessibilityRole="button"
            accessibilityLabel={`Tax rate, currently ${taxDisplay}`}
          >
            <Text style={styles.cardRowLabel}>Tax rate</Text>
            <View style={styles.cardRowValueGroup}>
              <Text style={styles.cardRowValue}>{taxDisplay}</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </View>
          </TouchableOpacity>
          <View style={styles.cardDivider} />
          {/* Currency — tap to open picker */}
          <TouchableOpacity
            style={styles.cardRow}
            onPress={() => setShowCurrencyPicker(true)}
            accessibilityRole="button"
            accessibilityLabel="Currency"
          >
            <Text style={styles.cardRowLabel}>Currency</Text>
            <View style={styles.cardRowValueGroup}>
              <Text style={styles.cardRowValue}>
                {selectedCurrency
                  ? `${selectedCurrency.symbol} ${selectedCurrency.code}`
                  : settings.currency}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </View>
          </TouchableOpacity>
        </View>
        <View style={styles.savedRow}>
          <Ionicons name="checkmark-circle" size={14} color={colors.green} />
          <Text style={styles.savedText}>Saved automatically</Text>
        </View>

        <Text style={styles.sectionLabel}>Receipt</Text>
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Text style={styles.cardRowLabel}>Footer message</Text>
            <TextInput
              style={styles.cardRowInput}
              value={localReceiptFooter}
              onChangeText={setLocalReceiptFooter}
              onBlur={() => {
                if (localReceiptFooter !== settings.receiptFooter) {
                  updateSetting('receiptFooter', localReceiptFooter);
                }
              }}
              placeholder={strings.settings.receiptFooterPlaceholder}
              placeholderTextColor={colors.textMuted}
              maxLength={MAX_RECEIPT_FOOTER_LENGTH}
              accessibilityLabel="Receipt footer text"
            />
          </View>
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
            style={[styles.upgradeButton, { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderBottomWidth: 4 }]}
            onPress={() => {
              Alert.alert(
                'Sign Out',
                'Sign out of your account? You can sign back in anytime.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Sign Out',
                    onPress: async () => {
                      try {
                        await AsyncStorage.removeItem('onboardingComplete');
                        await clearToken();
                        onAccountDeleted?.();
                      } catch (err) {
                        Alert.alert('Error', 'Failed to sign out. Please try again.');
                      }
                    },
                  },
                ]
              );
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.upgradeButtonText, { color: colors.text }]}>Sign Out</Text>
            <Text style={[styles.upgradeHint, { color: colors.textSecondary }]}>Switch accounts or sign back in later</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.sectionLabel}>Order screen</Text>
        <View style={styles.card}>
          {/* QSR mode — shows the CategoryStrip + filter above the order grid.
              Default off; coffee shops with a single un-categorized menu
              shouldn't see category UI they don't need. Merchant opts in
              when their menu spans multiple categories. */}
          <View style={styles.cardRow}>
            <View style={styles.cardRowTextGroup}>
              <Text style={styles.cardRowLabel}>{strings.settings.qsrModeLabel}</Text>
              <Text style={styles.cardRowSub}>
                {settings.qsrMode === 'on'
                  ? 'Categories show above the order grid'
                  : strings.settings.qsrModeHint}
              </Text>
            </View>
            <Switch
              value={settings.qsrMode === 'on'}
              onValueChange={(val) =>
                updateSetting('qsrMode', val ? 'on' : 'off')
              }
              trackColor={{ false: colors.disabled, true: colors.primaryDark }}
              thumbColor={colors.white}
              accessibilityLabel="QSR mode"
            />
          </View>
        </View>

        <Text style={styles.sectionLabel}>Advanced</Text>
        <View style={styles.card}>
          {/* Test Mode toggle with descriptive sub */}
          <View style={styles.cardRow}>
            <View style={styles.cardRowTextGroup}>
              <Text style={styles.cardRowLabel}>Test mode</Text>
              <Text style={styles.cardRowSub}>
                {isTestMode
                  ? 'Active — no real charges will be processed'
                  : 'Use sample data, don’t record sales'}
              </Text>
            </View>
            <Switch
              value={isTestMode}
              onValueChange={handleTestModeToggle}
              trackColor={{ false: colors.disabled, true: colors.dangerDark }}
              thumbColor={colors.white}
            />
          </View>
          <View style={styles.cardDivider} />
          {/* Weekly auto-backup toggle with descriptive sub */}
          <View style={styles.cardRow}>
            <View style={styles.cardRowTextGroup}>
              <Text style={styles.cardRowLabel}>Weekly auto-backup</Text>
              <Text style={styles.cardRowSub}>
                {settings.autoBackup === 'on'
                  ? 'Local backup every 7 days'
                  : 'Off — manual backups only'}
              </Text>
            </View>
            <Switch
              value={settings.autoBackup === 'on'}
              onValueChange={(val) =>
                updateSetting('autoBackup', val ? 'on' : 'off')
              }
              trackColor={{ false: colors.disabled, true: colors.primaryDark }}
              thumbColor={colors.white}
            />
          </View>
        </View>
        {/* Data actions — Back up now is the original explicit action,
            kept as the prominent big button. Export/Import sit below as
            a paired data-transfer row (discoverable but not promoted in
            v1.1; become a featured surface in v1.2 with menu templates).
            Generous vertical margins so the section reads as three
            separate beats instead of a cramped stack. */}
        <View style={{ marginTop: spacing.md, marginBottom: spacing.xl }}>
          <Button
            label={strings.settings.backupNow}
            variant="ghost"
            size="md"
            onPress={handleBackupNow}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xxxl }}>
          <View style={{ flex: 1 }}>
            <Button
              label="Export menu"
              variant="ghost"
              size="md"
              onPress={handleExportMenu}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label="Import menu"
              variant="ghost"
              size="md"
              onPress={handleImportMenu}
            />
          </View>
        </View>

        {/* Tap to Pay (paid tier only) */}
        {isPaidTier ? (
          <View style={styles.section}>
            <Text style={styles.label}>{strings.ttpoi.sectionTitle}</Text>
            {settings.ttpOiSetupComplete === 'true' ? (
              <View style={[styles.syncIndicator, { alignItems: 'center' }]}>
                <Text style={[styles.syncText, { color: colors.primary, textAlign: 'center' }]}>
                  {strings.ttpoi.ready}
                </Text>
                <View style={{ marginTop: spacing.sm }}>
                  <Button label={strings.ttpoi.viewGuide} variant="ghost" size="sm" onPress={() => onTTPOiEducation?.()} />
                </View>
              </View>
            ) : (
              <Button
                label={`${strings.ttpoi.setUp} ${strings.ttpoi.sectionTitle}`}
                variant="primary"
                size="lg"
                onPress={() => onTTPOiSetup?.()}
              />
            )}
          </View>
        ) : null}

        {/* Sync Health (paid tier only) */}
        {isPaidTier && syncHealth ? (
          <View style={styles.section}>
            <Text style={styles.label}>Sync</Text>
            <TouchableOpacity
              style={[styles.syncIndicator, { alignItems: 'center' }]}
              onPress={syncHealth.failedCount > 0 ? handleForceRetry : undefined}
            >
              <Text
                style={[
                  styles.syncText,
                  { textAlign: 'center' },
                  syncHealth.failedCount > 0 && styles.syncWarning,
                ]}
              >
                {getSyncStatusText()}{' '}
                {syncHealth.failedCount > 0 ? '⚠' : '✓'}
              </Text>
              {syncHealth.failedCount > 0 ? (
                <Text style={[styles.syncRetryText, { textAlign: 'center' }]}>Tap to force retry</Text>
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
            <TouchableOpacity
              style={[styles.linkButton, { marginTop: spacing.sm }]}
              onPress={() => {
                Alert.alert(
                  'Sign Out',
                  'Sign out of your account? You can sign back in anytime.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Sign Out',
                      onPress: async () => {
                        try {
                          await AsyncStorage.removeItem('onboardingComplete');
                          await clearToken();
                          onAccountDeleted?.();
                        } catch (err) {
                          Alert.alert('Error', 'Failed to sign out. Please try again.');
                        }
                      },
                    },
                  ]
                );
              }}
            >
              <Text style={styles.linkText}>Sign Out</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.linkButton, { marginTop: spacing.sm }]}
              onPress={() => {
                Alert.alert(
                  'Delete Account',
                  'This will permanently delete your account and all associated data. This action cannot be undone.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete Account',
                      style: 'destructive',
                      onPress: async () => {
                        const ok = await stepUpAuth({
                          promptMessage: 'Confirm account deletion',
                        });
                        if (!ok) return;
                        try {
                          await deleteAccount();
                          await AsyncStorage.removeItem('onboardingComplete');
                          await clearToken();
                          onAccountDeleted?.();
                        } catch (err) {
                          Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete account. Please try again.');
                        }
                      },
                    },
                  ]
                );
              }}
            >
              <Text style={[styles.linkText, { color: colors.danger }]}>Delete Account</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Disputes (paid tier only) */}
        {isPaidTier && onDisputesTap ? (
          <TouchableOpacity style={styles.linkRow} onPress={onDisputesTap}>
            <Text style={styles.linkText}>Disputes</Text>
          </TouchableOpacity>
        ) : null}

        {/* Bluetooth Printer - disabled until fully tested
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
                {scanning ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <ActivityIndicator color={colors.textSecondary} size="small" />
                    <Text style={styles.backupButtonText}>Scanning...</Text>
                  </View>
                ) : (
                  <Text style={styles.backupButtonText}>Scan for Printers</Text>
                )}
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
        */}

        {/* Help & Support */}
        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => Linking.openURL('https://ospos.app/help')}
        >
          <Text style={styles.linkText}>{strings.settings.helpSupport}</Text>
        </TouchableOpacity>

        {/* Legal */}
        <View style={styles.legalRow}>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://ospos.app/privacy')}
          >
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </TouchableOpacity>
          <Text style={styles.legalDot}>·</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL('https://ospos.app/terms')}
          >
            <Text style={styles.legalLink}>Terms of Service</Text>
          </TouchableOpacity>
        </View>

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
          {isPaidTier ? (
            <View style={{ marginTop: spacing.lg }}>
              <Button
                label="Delete Account"
                variant="destructive"
                size="md"
                onPress={() => {
                  Alert.alert(
                    'Delete Account',
                    'This will permanently delete your account and all associated data. This action cannot be undone.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete Account',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            await deleteAccount();
                            await AsyncStorage.removeItem('onboardingComplete');
                            await clearToken();
                            onAccountDeleted?.();
                          } catch (err) {
                            Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete account. Please try again.');
                          }
                        },
                      },
                    ]
                  );
                }}
              />
            </View>
          ) : null}
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

      <CurrencyPickerModal
        visible={showCurrencyPicker}
        selectedCode={settings.currency}
        onSelect={(code) => {
          updateSetting('currency', code);
          setShowCurrencyPicker(false);
        }}
        onClose={() => setShowCurrencyPicker(false)}
      />

      <TaxRateModal
        visible={showTaxRateModal}
        currentRate={settings.taxRate}
        currencyCode={settings.currency}
        onSave={(rate) => {
          updateSetting('taxRate', rate);
          setShowTaxRateModal(false);
        }}
        onClose={() => setShowTaxRateModal(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xxl, paddingTop: spacing.xl, paddingBottom: spacing.xxxl },
  title: { ...typography.title1, marginBottom: spacing.xxl },
  section: { marginBottom: spacing.xxl },
  // Section label — small-caps Inter, quiet. Replaces the older all-caps
  // slab serif "BUSINESS NAME" treatment that competed with field values.
  sectionLabel: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: colors.textMuted,
    letterSpacing: 0.6,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    paddingLeft: spacing.md,
  },
  // Card — iOS Settings pattern. Groups related fields with hairline dividers.
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 44,
  },
  cardRowLabel: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
  cardRowSub: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  cardRowTextGroup: {
    flex: 1,
    marginRight: spacing.md,
  },
  cardRowValue: {
    ...typography.body,
    color: colors.textSecondary,
    fontFamily: 'Inter_500Medium',
  },
  cardRowValueGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardRowInput: {
    ...typography.body,
    color: colors.text,
    fontFamily: 'Inter_500Medium',
    flex: 1,
    textAlign: 'right',
    padding: 0,
  },
  cardDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: spacing.lg,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    paddingLeft: spacing.md,
  },
  savedText: {
    fontSize: 11,
    color: colors.green,
    fontFamily: 'Inter_500Medium',
  },
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
  legalRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, paddingVertical: spacing.md, gap: spacing.sm },
  legalLink: { ...typography.caption, color: colors.textMuted },
  legalDot: { ...typography.caption, color: colors.textMuted },
  upgradeButton: { backgroundColor: colors.primary, borderRadius: borderRadius.lg, paddingVertical: spacing.lg, paddingHorizontal: spacing.xl, alignItems: 'center', marginTop: spacing.xxl, marginBottom: spacing.xxl, borderWidth: 2, borderColor: colors.primaryDark, borderBottomWidth: 4 },
  upgradeButtonText: { ...typography.bodyBold, color: colors.black, fontSize: 16 },
  upgradeHint: { ...typography.caption, color: colors.black, opacity: 0.8, marginTop: spacing.xs },
  aboutSection: { paddingTop: spacing.lg, gap: spacing.xs },
  aboutTitle: { ...typography.bodyBold, marginBottom: spacing.sm },
  aboutText: { ...typography.caption },
  sentryTestButton: { marginTop: spacing.md, backgroundColor: colors.surface, borderRadius: borderRadius.md, paddingVertical: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.warning },
  sentryTestText: { ...typography.bodyBold, color: colors.warning },
  requirementsBanner: { backgroundColor: colors.warningLight, borderRadius: borderRadius.md, padding: spacing.lg, marginBottom: spacing.xxl, borderWidth: 1, borderColor: colors.warning },
  requirementsBannerTitle: { ...typography.bodyBold, color: colors.warning, marginBottom: spacing.xs },
  requirementsBannerText: { ...typography.body, color: colors.text, marginBottom: spacing.sm },
  requirementsBannerLink: { ...typography.bodyBold, color: colors.warning },
});

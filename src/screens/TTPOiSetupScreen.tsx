import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Reader } from '@stripe/stripe-terminal-react-native';
import { colors, typography, spacing, borderRadius, touchTargets } from '../constants/theme';
import { strings } from '../constants/strings';
import { useApp } from '../state/AppContext';
import { useStripeTerminal } from '../services/terminal';
import { getTerminalLocationId } from '../services/api';
import ContactlessIcon from '../components/ContactlessIcon';
import Button from '../components/Button';
import TTPOiConfigProgress from '../components/TTPOiConfigProgress';
import TTPOiEducation from '../components/TTPOiEducation';

interface TTPOiSetupScreenProps {
  onComplete: () => void;
  onBack: () => void;
}

type SetupStep = 'requirements' | 'terms' | 'configuring' | 'education' | 'complete';

export default function TTPOiSetupScreen({ onComplete, onBack }: TTPOiSetupScreenProps) {
  const { updateSetting, isTestMode } = useApp();
  const [step, setStep] = useState<SetupStep>('requirements');
  const [deviceCompatible, setDeviceCompatible] = useState<boolean | null>(null);
  const [terminalLocationId, setTerminalLocationId] = useState<string | null>(null);
  const readerResolverRef = useRef<((readers: Reader.Type[]) => void) | null>(null);

  // Load terminal location ID on mount
  useEffect(() => {
    getTerminalLocationId().then(setTerminalLocationId);
  }, []);

  const {
    initialize,
    isInitialized,
    discoverReaders,
    connectReader,
    supportsReadersOfType,
    cancelDiscovering,
    discoveredReaders,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: (readers) => {
      if (readers.length > 0 && readerResolverRef.current) {
        readerResolverRef.current(readers);
        readerResolverRef.current = null;
      }
    },
  });

  const discoveredReadersRef = useRef(discoveredReaders);
  discoveredReadersRef.current = discoveredReaders;

  // Check device compatibility on mount
  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'ios') {
        setDeviceCompatible(false);
        return;
      }

      try {
        if (!isInitialized) {
          await initialize();
        }
        const result = await supportsReadersOfType({
          deviceType: 'tapToPay',
          discoveryMethod: 'tapToPay',
          simulated: isTestMode,
        });
        setDeviceCompatible(result?.readerSupportResult ?? false);
      } catch {
        // If check fails, assume compatible and let the SDK handle errors
        setDeviceCompatible(true);
      }
    })();
  }, [initialize, isInitialized, supportsReadersOfType, isTestMode]);

  // Store cancelDiscovering in a ref so cleanup only runs on unmount
  const cancelDiscoveringRef = useRef(cancelDiscovering);
  cancelDiscoveringRef.current = cancelDiscovering;

  useEffect(() => {
    return () => {
      readerResolverRef.current = null;
      try { cancelDiscoveringRef.current().catch(() => {}); } catch { /* noop */ }
    };
  }, []);

  const waitForReaders = useCallback((): Promise<Reader.Type[]> => {
    return new Promise((resolve) => {
      readerResolverRef.current = resolve;
      let attempts = 0;
      const poll = setInterval(() => {
        attempts++;
        if (discoveredReadersRef.current.length > 0) {
          clearInterval(poll);
          readerResolverRef.current = null;
          resolve(discoveredReadersRef.current);
        } else if (attempts >= 20) {
          clearInterval(poll);
          readerResolverRef.current = null;
          resolve([]);
        }
      }, 500);
    });
  }, []);

  const handleAcceptTerms = async () => {
    setStep('configuring');

    try {
      if (!isInitialized) {
        await initialize();
      }

      // Discover TTPOi reader — this triggers the T&C flow via Stripe SDK
      discoverReaders({
        discoveryMethod: 'tapToPay',
        simulated: isTestMode,
        locationId: terminalLocationId || undefined,
      }).catch(() => {});

      const readers = await waitForReaders();

      if (readers.length === 0) {
        Alert.alert('Setup Failed', 'Could not set up Tap to Pay on iPhone. Please try again.');
        setStep('requirements');
        return;
      }

      // Connect with tosAcceptancePermitted — this shows Apple's T&C sheet
      const { reader, error } = await connectReader(
        {
          reader: readers[0],
          locationId: terminalLocationId || readers[0].locationId || undefined,
          autoReconnectOnUnexpectedDisconnect: true,
          tosAcceptancePermitted: true,
          merchantDisplayName: 'OSPOS',
        },
        'tapToPay'
      );

      if (error || !reader) {
        const errMsg = error?.message ?? 'Connection failed';
        if (errMsg.includes('canceled') || errMsg.includes('cancelled')) {
          setStep('terms');
        } else {
          Alert.alert('Setup Failed', errMsg);
          setStep('requirements');
        }
        return;
      }

      // Success — save state and show education
      await updateSetting('ttpOiSetupComplete', 'true');
      setStep('education');
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Setup failed';
      Alert.alert('Setup Error', errMsg);
      setStep('requirements');
    }
  };

  const handleEducationComplete = () => {
    setStep('complete');
  };

  const handleDone = () => {
    onComplete();
  };

  const isIOS = Platform.OS === 'ios';
  const iosVersionOk = true; // Deployment target is 16.0, so runtime is always >= 16.0

  if (step === 'configuring') {
    return (
      <SafeAreaView style={styles.container}>
        <TTPOiConfigProgress isComplete={false} onDone={handleDone} />
      </SafeAreaView>
    );
  }

  if (step === 'education') {
    return (
      <SafeAreaView style={styles.container}>
        <TTPOiEducation onComplete={handleEducationComplete} showTryItNow />
      </SafeAreaView>
    );
  }

  if (step === 'complete') {
    return (
      <SafeAreaView style={styles.container}>
        <TTPOiConfigProgress isComplete onDone={handleDone} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.header}>
          <ContactlessIcon size={48} color={colors.primary} />
          <Text style={styles.title}>{strings.ttpoi.setupTitle}</Text>
          <Text style={styles.subtitle}>{strings.ttpoi.setupDescription}</Text>
        </View>

        {/* Device Requirements */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{strings.ttpoi.setupRequirements}</Text>

          <View style={styles.requirementRow}>
            <Ionicons
              name={isIOS ? 'checkmark-circle' : 'close-circle'}
              size={24}
              color={isIOS ? colors.primary : colors.danger}
            />
            <Text style={styles.requirementText}>{strings.ttpoi.setupRequirementDevice}</Text>
          </View>

          <View style={styles.requirementRow}>
            <Ionicons
              name={iosVersionOk ? 'checkmark-circle' : 'close-circle'}
              size={24}
              color={iosVersionOk ? colors.primary : colors.danger}
            />
            <Text style={styles.requirementText}>{strings.ttpoi.setupRequirementOS}</Text>
          </View>

          <View style={styles.requirementRow}>
            <Ionicons
              name={deviceCompatible === false ? 'close-circle' : 'checkmark-circle'}
              size={24}
              color={deviceCompatible === false ? colors.danger : colors.primary}
            />
            <Text style={styles.requirementText}>
              {deviceCompatible === null
                ? 'Checking device compatibility...'
                : deviceCompatible
                  ? 'Device compatible'
                  : 'Device not compatible'}
            </Text>
          </View>
        </View>

        {/* Accept Terms */}
        {step === 'terms' || step === 'requirements' ? (
          <View style={styles.section}>
            <Text style={styles.termsNote}>{strings.ttpoi.setupAcceptTermsNote}</Text>

            <Button
              label={strings.ttpoi.setupAcceptTerms}
              variant="primary"
              size="lg"
              onPress={handleAcceptTerms}
              disabled={deviceCompatible === false}
              accessibilityLabel="Accept Terms and Conditions for Tap to Pay on iPhone"
            />

            {deviceCompatible === false ? (
              <Text style={styles.incompatibleText}>{strings.ttpoi.incompatible}</Text>
            ) : null}
          </View>
        ) : null}

        {/* Apple-required legal disclaimer */}
        <Text style={styles.disclaimer}>{strings.ttpoi.disclaimerFull}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
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
  header: {
    alignItems: 'center',
    marginVertical: spacing.xxl,
    gap: spacing.md,
  },
  title: {
    ...typography.title1,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  section: {
    marginBottom: spacing.xxl,
  },
  sectionTitle: {
    ...typography.bodyBold,
    marginBottom: spacing.lg,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  requirementText: {
    ...typography.body,
    flex: 1,
  },
  termsNote: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  incompatibleText: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  disclaimer: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: spacing.xl,
    marginBottom: spacing.xxl,
  },
});

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, touchTargets } from '../constants/theme';
import { strings } from '../constants/strings';
import { startOnboarding, getAccountStatus, getAccountDetails } from '../services/api';
import { useOnboarding } from '../state/OnboardingContext';
import { lookupTaxRateByState } from '../utils/taxLookup';
import type { OnboardingStackParamList } from '../navigation/OnboardingNavigator';
import Button from '../components/Button';

type Nav = NativeStackNavigationProp<OnboardingStackParamList, 'StripeOnboarding'>;

// Stripe blocks embedded WKWebView for OAuth on Standard accounts (anti-phishing
// policy — the host app could sniff credentials from a WebView). The page
// detects WebView and renders a "WebView is disabled" notice instead of the
// sign-in form. Open in the system browser instead, then catch the deep link
// callback when the user returns. Same behavior as Stripe's own iOS SDK.

export default function StripeOnboardingScreen() {
  const navigation = useNavigation<Nav>();
  const { dispatch, commitOnboarding } = useOnboarding();
  const mountedRef = useRef(true);
  // started=true once the user taps Continue and we hand off to Safari.
  // 'waiting' state shows while the user is in Stripe's browser tab.
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [waitingForReturn, setWaitingForReturn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastOauthUrlRef = useRef<string | null>(null);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const prefillAndNavigate = useCallback(async () => {
    try {
      const details = await getAccountDetails();
      if (details.business_name) {
        dispatch({ type: 'SET_BUSINESS_NAME', payload: details.business_name });
      }
      if (details.default_currency) {
        dispatch({ type: 'SET_CURRENCY', payload: details.default_currency.toUpperCase() });
      }
      if (details.support_address_country === 'US' && details.support_address_state) {
        const rate = lookupTaxRateByState(details.support_address_state);
        if (rate) {
          dispatch({ type: 'SET_TAX_RATE', payload: rate });
        }
      }
    } catch {
      // Pre-fill is best-effort — continue to BusinessName even if it fails
    }
    navigation.navigate('BusinessName');
  }, [dispatch, navigation]);

  const beginStripeFlow = useCallback(async () => {
    setStarted(true);
    setLoading(true);
    setError(null);
    try {
      const result = await startOnboarding();
      if (!mountedRef.current) return;

      // Standard mode short-circuit: the merchant already has a working
      // connection. Skip OAuth entirely.
      if (result.alreadyConnected) {
        await prefillAndNavigate();
        return;
      }

      if (result.stripeAccountId) {
        dispatch({ type: 'SET_STRIPE_ACCOUNT_ID', payload: result.stripeAccountId });
      }

      if (!result.url) {
        setError('Stripe did not return an onboarding URL');
        return;
      }

      lastOauthUrlRef.current = result.url;
      setWaitingForReturn(true);
      await Linking.openURL(result.url);
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Failed to start onboarding');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [dispatch, prefillAndNavigate]);

  // Drop the merchant straight into cash mode. commitOnboarding writes the
  // settings table with tier='free' (overriding the 'paid' the merchant
  // picked in ModeSelect) plus whatever defaults are in OnboardingContext
  // state for businessName/currency/taxRate/receiptFooter. The
  // onboardingComplete AsyncStorage flag flips inside commitOnboarding, so
  // App.tsx's polling swap to MainTabs happens automatically — no explicit
  // navigation needed. Merchant can connect Stripe later via the existing
  // Settings upgrade path (App.tsx onUpgrade handler).
  const handleSkipToCash = useCallback(() => {
    Alert.alert(
      strings.stripeOnboarding.skipConfirmTitle,
      strings.stripeOnboarding.skipConfirmBody,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: strings.stripeOnboarding.skipConfirmAction,
          onPress: async () => {
            try {
              await commitOnboarding({ tier: 'free' });
            } catch (err) {
              Alert.alert('Could not switch to cash mode', err instanceof Error ? err.message : 'Try again.');
            }
          },
        },
      ]
    );
  }, [commitOnboarding]);

  // Deep-link parser. Strict path matching (URL() not startsWith) blocks
  // lookalike paths like ospos://stripe/returnXYZ. Error codes ride on the
  // ?error= query param when Stripe denies / our OAuth callback rejects.
  type DeepLinkAction = 'return' | 'refresh' | null;
  type ParsedDeepLink = { action: DeepLinkAction; errorCode: string | null };
  const parseDeepLink = (url: string): ParsedDeepLink => {
    try {
      const u = new URL(url);
      if (u.protocol !== 'ospos:' || u.host !== 'stripe') return { action: null, errorCode: null };
      const errorCode = u.searchParams.get('error');
      if (u.pathname === '/return') return { action: 'return', errorCode };
      if (u.pathname === '/refresh') return { action: 'refresh', errorCode };
      return { action: null, errorCode: null };
    } catch {
      return { action: null, errorCode: null };
    }
  };

  const handleDeepLink = useCallback(async (action: DeepLinkAction, errorCode?: string | null) => {
    setWaitingForReturn(false);

    if (action === 'return') {
      if (errorCode) {
        const { stripeOnboarding } = strings;
        if (errorCode === 'access_denied' || errorCode === 'oauth_denied') {
          Alert.alert(stripeOnboarding.cancelledTitle, stripeOnboarding.cancelledBody, [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        } else if (errorCode === 'oauth_state_invalid' || errorCode === 'oauth_state_missing') {
          Alert.alert(stripeOnboarding.expiredTitle, stripeOnboarding.expiredBody, [
            { text: 'Try again', onPress: () => { setStarted(false); } },
          ]);
        } else {
          Alert.alert(stripeOnboarding.failedTitle, stripeOnboarding.failedBody, [
            { text: 'Try again', onPress: () => { setStarted(false); } },
          ]);
        }
        return;
      }

      try {
        const status = await getAccountStatus();
        if (status.charges_enabled) {
          await prefillAndNavigate();
        } else {
          Alert.alert(
            'Verification Pending',
            'Card payments will be available once Stripe verifies your account. You can use cash payments in the meantime.',
            [{ text: 'OK', onPress: () => prefillAndNavigate() }]
          );
        }
      } catch {
        await prefillAndNavigate();
      }
    } else if (action === 'refresh') {
      // Stripe asked us to mint a fresh authorize link — typically because
      // the previous one expired (15 min) or got consumed.
      if (!mountedRef.current) return;
      setLoading(true);
      try {
        const result = await startOnboarding();
        if (!mountedRef.current) return;
        if (result.url) {
          lastOauthUrlRef.current = result.url;
          setWaitingForReturn(true);
          await Linking.openURL(result.url);
        }
      } catch (err) {
        if (mountedRef.current) setError(err instanceof Error ? err.message : 'Failed to refresh onboarding');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }
  }, [navigation, prefillAndNavigate]);

  // Listen for deep links bouncing back from Safari after OAuth completes.
  // Use a ref-stored handler so the listener registered on mount sees the
  // latest closure. addEventListener fires on warm starts; getInitialURL
  // catches cold starts (app was killed in the background).
  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      const parsed = parseDeepLink(url);
      if (parsed.action) handleDeepLink(parsed.action, parsed.errorCode);
    });
    Linking.getInitialURL().then((url) => {
      if (!url) return;
      const parsed = parseDeepLink(url);
      if (parsed.action) handleDeepLink(parsed.action, parsed.errorCode);
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!started) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.headsUpHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.headsUp}>
          <Text style={styles.eyebrow}>OSPOS · STRIPE</Text>
          <Text style={styles.headsUpTitle}>Connect your Stripe account</Text>
          <Text style={styles.headsUpBody}>
            We&rsquo;ll open Stripe in Safari. Sign in with your existing Stripe account, or create one. You&rsquo;ll come back to OSPOS automatically when you&rsquo;re done.
          </Text>
          <View style={styles.bullets}>
            <Text style={styles.bullet}>•  Use the email you&rsquo;d like Stripe to deposit payouts to</Text>
            <Text style={styles.bullet}>•  You&rsquo;ll provide business details, ID, and a bank account</Text>
            <Text style={styles.bullet}>•  Usually 1&ndash;3 minutes if you already have a Stripe account</Text>
          </View>
          <Text style={styles.headsUpNote}>Your information goes directly to Stripe. OSPOS never sees it.</Text>

          {/* "No website?" hint — surfaces the Instagram-URL workaround at the
              friction point. Merchants without a website (most food trucks,
              market vendors, popups) were bailing here before this hint
              landed because Stripe asks for a business website during the
              Connect flow and they didn't realize a social URL works. */}
          <View style={styles.hintCard}>
            <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} style={styles.hintIcon} />
            <Text style={styles.hintText}>{strings.stripeOnboarding.instagramHint}</Text>
          </View>
        </View>
        <View style={styles.headsUpFooter}>
          <Button label="Continue to Stripe" variant="primary" size="lg" onPress={beginStripeFlow} />
          {/* Skip-to-cash escape hatch. The previous funnel had merchants
              bail the whole app when they got intimidated by Stripe Connect;
              this lets them drop into cash mode immediately and connect
              Stripe later from Settings whenever they're ready. */}
          <View style={styles.skipRow}>
            <Button
              label={strings.stripeOnboarding.skipCashModeLabel}
              variant="ghost"
              size="md"
              onPress={handleSkipToCash}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Setting up payments...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Button label="Go Back" variant="ghost" size="md" onPress={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  // Waiting for the user to finish in Safari and bounce back via deep link.
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.center}>
        <Text style={styles.waitingTitle}>Finish setup in Safari</Text>
        <Text style={styles.waitingBody}>
          We opened Stripe in your browser. Sign in there, then return to OSPOS — we&rsquo;ll pick up automatically.
        </Text>
        <View style={styles.waitingActions}>
          <Button
            label="Reopen Stripe"
            variant="primary"
            size="md"
            onPress={() => {
              if (lastOauthUrlRef.current) Linking.openURL(lastOauthUrlRef.current);
            }}
          />
          <View style={{ height: spacing.md }} />
          <Button
            label="Cancel"
            variant="ghost"
            size="md"
            onPress={() => navigation.goBack()}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  backText: {
    ...typography.body,
    color: colors.primary,
  },
  headerSpacer: {
    width: 60,
  },
  headsUpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  headsUp: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xxl,
  },
  eyebrow: {
    ...typography.eyebrow,
    color: colors.primary,
    marginBottom: spacing.md,
  },
  headsUpTitle: {
    ...typography.title1,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  headsUpBody: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xxl,
  },
  bullets: {
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  bullet: {
    ...typography.body,
    color: colors.text,
    lineHeight: 24,
  },
  headsUpNote: {
    ...typography.caption,
    color: colors.textMuted,
  },
  hintCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hintIcon: {
    marginTop: 2,
  },
  hintText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  headsUpFooter: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  skipRow: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.lg,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  waitingTitle: {
    ...typography.title2,
    color: colors.text,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  waitingBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xxxl,
  },
  waitingActions: {
    width: '100%',
  },
});

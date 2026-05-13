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
import { WebView } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, typography, spacing, borderRadius, touchTargets } from '../constants/theme';
import { strings } from '../constants/strings';
import { startOnboarding, getAccountStatus, getAccountDetails } from '../services/api';
import { useOnboarding } from '../state/OnboardingContext';
import { lookupTaxRateByState } from '../utils/taxLookup';
import type { OnboardingStackParamList } from '../navigation/OnboardingNavigator';
import Button from '../components/Button';

type Nav = NativeStackNavigationProp<OnboardingStackParamList, 'StripeOnboarding'>;

export default function StripeOnboardingScreen() {
  const navigation = useNavigation<Nav>();
  const { dispatch } = useOnboarding();
  const mountedRef = useRef(true);
  // Show heads-up screen first so the merchant knows what to expect
  // (Stripe-hosted form, possible captcha, automatic return) before the
  // WebView opens. Fetching the onboarding URL waits for their tap so
  // the network call happens within a user gesture.
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const beginStripeFlow = useCallback(async () => {
    setStarted(true);
    setLoading(true);
    setError(null);
    try {
      const result = await startOnboarding();
      if (!mountedRef.current) return;

      // Standard mode short-circuit: the merchant returned with an existing
      // connection. Skip the WebView and go straight to post-Stripe prefill.
      if (result.alreadyConnected) {
        await prefillAndNavigate();
        return;
      }

      if (result.stripeAccountId) {
        dispatch({ type: 'SET_STRIPE_ACCOUNT_ID', payload: result.stripeAccountId });
      }
      setOnboardingUrl(result.url);
    } catch (err) {
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Failed to start onboarding');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  // Listen for deep links from system browser (Safari)
  // Parse a deep link strictly: only accept the exact ospos://stripe/return
  // and ospos://stripe/refresh paths. Using URL() instead of startsWith
  // prevents the handler from firing on lookalikes (ospos://stripe/returnXYZ,
  // ospos://stripe/return.evil, etc.).
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

  // When Stripe finishes onboarding, it opens the return URL in Safari,
  // which redirects to ospos://stripe/return, which opens the app.
  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      const parsed = parseDeepLink(url);
      if (parsed.action) handleDeepLink(parsed.action, parsed.errorCode);
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prefillAndNavigate = async () => {
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
  };

  const handleDeepLink = async (action: DeepLinkAction, errorCode?: string | null) => {
    if (action === 'return') {
      // OAuth errors arrive on the return path with ?error=... — handle
      // them before falling through to the success-path account-status check.
      if (errorCode) {
        const { stripeOnboarding } = strings;
        if (errorCode === 'access_denied' || errorCode === 'oauth_denied') {
          Alert.alert(stripeOnboarding.cancelledTitle, stripeOnboarding.cancelledBody, [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        } else if (errorCode === 'oauth_state_invalid' || errorCode === 'oauth_state_missing') {
          Alert.alert(stripeOnboarding.expiredTitle, stripeOnboarding.expiredBody, [
            { text: 'Try again', onPress: () => { setStarted(false); setOnboardingUrl(null); } },
          ]);
        } else {
          Alert.alert(stripeOnboarding.failedTitle, stripeOnboarding.failedBody, [
            { text: 'Try again', onPress: () => { setStarted(false); setOnboardingUrl(null); } },
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
      if (!mountedRef.current) return;
      setLoading(true);
      try {
        const result = await startOnboarding();
        if (mountedRef.current) setOnboardingUrl(result.url);
      } catch (err) {
        if (mountedRef.current) setError(err instanceof Error ? err.message : 'Failed to refresh onboarding');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }
  };

  // Intercept navigation BEFORE the WebView tries to load custom schemes
  const handleShouldStartLoad = (event: { url: string }): boolean => {
    const parsed = parseDeepLink(event.url);
    if (parsed.action) {
      handleDeepLink(parsed.action, parsed.errorCode);
      return false;
    }
    // Catch the server redirect URLs too — the OAuth callback HTML bridges
    // to ospos://stripe/return?error=... so its query string must come
    // through for error propagation.
    if (event.url.includes('/stripe/return')) {
      try {
        const u = new URL(event.url);
        handleDeepLink('return', u.searchParams.get('error'));
      } catch {
        handleDeepLink('return');
      }
      return false;
    }
    if (event.url.includes('/stripe/refresh')) {
      handleDeepLink('refresh');
      return false;
    }
    return true;
  };

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
          <Text style={styles.headsUpTitle}>Set up payments with Stripe</Text>
          <Text style={styles.headsUpBody}>
            We&rsquo;ll take you to Stripe to verify your business and connect a bank account. Usually 3&ndash;5 minutes.
          </Text>
          <View style={styles.bullets}>
            <Text style={styles.bullet}>•  Stripe may ask you to confirm you&rsquo;re human (a quick captcha)</Text>
            <Text style={styles.bullet}>•  You&rsquo;ll provide business details, ID, and a bank account</Text>
            <Text style={styles.bullet}>•  When you&rsquo;re done, you&rsquo;ll come back to OSPOS automatically</Text>
          </View>
          <Text style={styles.headsUpNote}>Your information goes directly to Stripe. OSPOS never sees it.</Text>
        </View>
        <View style={styles.headsUpFooter}>
          <Button label="Continue to Stripe" variant="primary" size="lg" onPress={beginStripeFlow} />
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

  if (!onboardingUrl) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Connect Payments</Text>
        <View style={styles.headerSpacer} />
      </View>
      <WebView
        source={{ uri: onboardingUrl }}
        // Tightened from `https://*` to Stripe-controlled domains. The
        // initial URL is server-issued by /stripe/onboarding (Stripe-hosted
        // Express form OR connect.stripe.com OAuth screen depending on the
        // server's STRIPE_CONNECT_MODE). These patterns cover the redirect
        // chain Stripe walks through for KYC + identity verification.
        // `connect.stripe.com` is listed explicitly because some webview
        // versions don't expand `*.stripe.com` to multi-level subdomains.
        originWhitelist={[
          'https://*.stripe.com',
          'https://stripe.com',
          'https://connect.stripe.com',
          'https://*.stripe.network',
          'ospos://*',
        ]}
        // Stripe's OAuth page is JS-rendered and requires cookies + storage.
        // Explicit flags here defeat any platform-version default drift.
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        onMessage={(event) => {
          const msg = event.nativeEvent.data;
          if (msg === 'stripe-return') {
            handleDeepLink('return');
          } else if (msg === 'stripe-refresh') {
            handleDeepLink('refresh');
          }
        }}
        style={styles.webview}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.webviewLoading}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        )}
        onError={() => {
          if (mountedRef.current) setError('Failed to load Stripe onboarding page. Check your connection and try again.');
        }}
        onHttpError={(event) => {
          if (mountedRef.current && event.nativeEvent.statusCode >= 500) {
            setError('Stripe is temporarily unavailable. Please try again later.');
          }
        }}
      />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backText: {
    ...typography.body,
    color: colors.primary,
  },
  headerTitle: {
    ...typography.bodyBold,
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
  headsUpFooter: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  webview: {
    flex: 1,
  },
  webviewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
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
});

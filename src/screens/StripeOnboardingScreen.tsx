import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, typography, spacing, borderRadius, touchTargets } from '../constants/theme';
import { startOnboarding, getAccountStatus, getAccountDetails } from '../services/api';
import { useOnboarding } from '../state/OnboardingContext';
import { lookupTaxRateByState } from '../utils/taxLookup';
import type { OnboardingStackParamList } from '../navigation/OnboardingNavigator';

type Nav = NativeStackNavigationProp<OnboardingStackParamList, 'StripeOnboarding'>;

const API_MODE = process.env.EXPO_PUBLIC_API_MODE ?? (__DEV__ ? 'mock' : 'production');
const API_BASE_URL = API_MODE === 'mock'
  ? (process.env.EXPO_PUBLIC_MOCK_API_URL ?? 'http://localhost:3000')
  : (process.env.EXPO_PUBLIC_API_URL ?? 'https://api.ospos.app');

export default function StripeOnboardingScreen() {
  const navigation = useNavigation<Nav>();
  const { dispatch } = useOnboarding();
  const mountedRef = useRef(true);
  const [loading, setLoading] = useState(true);
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const result = await startOnboarding(
          `${API_BASE_URL}/stripe/return`,
          `${API_BASE_URL}/stripe/refresh`
        );
        if (mountedRef.current) {
          dispatch({ type: 'SET_STRIPE_ACCOUNT_ID', payload: result.stripeAccountId });
          setOnboardingUrl(result.url);
        }
      } catch (err) {
        if (mountedRef.current) setError(err instanceof Error ? err.message : 'Failed to start onboarding');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
    return () => { mountedRef.current = false; };
  }, [dispatch]);

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

  const handleDeepLink = async (url: string) => {
    if (url.startsWith('ospos://stripe/return')) {
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
    } else if (url.startsWith('ospos://stripe/refresh')) {
      if (!mountedRef.current) return;
      setLoading(true);
      try {
        const result = await startOnboarding(
          `${API_BASE_URL}/stripe/return`,
          `${API_BASE_URL}/stripe/refresh`
        );
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
    if (event.url.startsWith('ospos://')) {
      handleDeepLink(event.url);
      return false;
    }
    // Catch the server redirect URLs too
    if (event.url.includes('/stripe/return')) {
      handleDeepLink('ospos://stripe/return');
      return false;
    }
    if (event.url.includes('/stripe/refresh')) {
      handleDeepLink('ospos://stripe/refresh');
      return false;
    }
    return true;
  };

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
          <TouchableOpacity style={styles.retryButton} onPress={() => navigation.goBack()}>
            <Text style={styles.retryText}>Go Back</Text>
          </TouchableOpacity>
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
        originWhitelist={['https://*', 'ospos://*']}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        onMessage={(event) => {
          const msg = event.nativeEvent.data;
          if (msg === 'stripe-return') {
            handleDeepLink('ospos://stripe/return');
          } else if (msg === 'stripe-refresh') {
            handleDeepLink('ospos://stripe/refresh');
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
  retryButton: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxl,
    minHeight: touchTargets.minimum,
    justifyContent: 'center',
  },
  retryText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
});

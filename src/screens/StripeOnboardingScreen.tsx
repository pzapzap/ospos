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
  Animated,
  Easing,
  ScrollView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, typography, spacing, borderRadius, touchTargets } from '../constants/theme';
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

// ─── HandoffConnector ───────────────────────────────────────────────────
// Visual: OSPOS node (left) → dashed line + Safari/compass badge with
// pulsing halo + travelling cyan dot → Stripe node (right). Below: a
// "you return automatically" caption. The animations subtly communicate
// "round trip" — Stripe + auto-return — without taking screen real estate
// from the actual instructional content.
//
// All three animations use useNativeDriver where possible. The travelling
// dot uses translateX (driver-friendly) instead of left-position, which
// would require layout.
function HandoffConnector() {
  const dotX = useRef(new Animated.Value(0)).current;
  const haloScale = useRef(new Animated.Value(1)).current;
  const haloOpacity = useRef(new Animated.Value(0.35)).current;
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    Animated.loop(
      Animated.timing(dotX, {
        toValue: 1,
        duration: 2600,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(haloScale, { toValue: 1.18, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(haloOpacity, { toValue: 0.7, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(haloScale, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(haloOpacity, { toValue: 0.35, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, [dotX, haloScale, haloOpacity]);

  const dotTranslate = dotX.interpolate({
    inputRange: [0, 1],
    outputRange: [0, Math.max(0, trackWidth - 7)],
  });
  const dotOpacity = dotX.interpolate({
    inputRange: [0, 0.12, 0.88, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <View style={styles.handoffCard}>
      <View style={styles.handoffRow}>
        {/* OSPOS node */}
        <View style={styles.node}>
          <View style={styles.ospOsBox}>
            <Text style={styles.ospOsLabel}>OS</Text>
          </View>
          <Text style={styles.nodeLabel}>OSPOS</Text>
        </View>

        {/* Connector track */}
        <View
          style={styles.connector}
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        >
          {/* Dashed line */}
          <View style={styles.dashedLine} />
          {/* Halo pulse behind Safari badge */}
          <Animated.View
            style={[
              styles.halo,
              { opacity: haloOpacity, transform: [{ scale: haloScale }] },
            ]}
          />
          {/* Safari badge — compass icon for "the browser hop" */}
          <View style={styles.safariBadge}>
            <Ionicons name="compass" size={16} color={colors.primary} />
          </View>
          {/* Travelling dot */}
          <Animated.View
            style={[
              styles.travellingDot,
              { transform: [{ translateX: dotTranslate }], opacity: dotOpacity },
            ]}
          />
        </View>

        {/* Stripe node — purple gradient approximated with solid + inset highlight */}
        <View style={styles.node}>
          <View style={styles.stripeBox}>
            <Text style={styles.stripeLabel}>S</Text>
          </View>
          <Text style={styles.nodeLabel}>STRIPE</Text>
        </View>
      </View>

      <View style={styles.roundTripRow}>
        <Ionicons name="arrow-undo-outline" size={14} color={colors.textMuted} />
        <Text style={styles.roundTripText}>You return to OSPOS automatically</Text>
      </View>
    </View>
  );
}

// ─── BulletItem ─────────────────────────────────────────────────────────
// One row of the "Before you start" list — icon box on the left, title +
// optional FAST pill on top, body below.
function BulletItem({
  icon,
  title,
  body,
  badge,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  badge?: string;
}) {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bulletIconBox}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <View style={styles.bulletText}>
        <View style={styles.bulletTitleRow}>
          <Text style={styles.bulletTitle}>{title}</Text>
          {badge ? (
            <View style={styles.bulletBadge}>
              <Text style={styles.bulletBadgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.bulletBody}>{body}</Text>
      </View>
    </View>
  );
}

// ─── SheenButton ────────────────────────────────────────────────────────
// The hero CTA. Combines two effects Phil specifically asked for:
//   1. Sheen — a white-ish gradient sweeping across the button face on a
//      3.4s loop. Animated.Value driving translateX via useNativeDriver.
//   2. Depth — the OSPOS chunky-card aesthetic: 6pt bottom border in a
//      darker tone + a cyan glow shadow. Stays static; the sheen rides
//      on top.
// The Animated.View overlay sits inside the button bounds (overflow:hidden)
// so the sheen clips at the rounded corners cleanly.
function SheenButton({ label, onPress }: { label: string; onPress: () => void }) {
  const sheenX = useRef(new Animated.Value(-1.2)).current;
  const [btnWidth, setBtnWidth] = useState(0);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(sheenX, {
          toValue: 2.2,
          duration: 1900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        // Hold off-screen on the right for a beat before the next sweep
        Animated.delay(1500),
        Animated.timing(sheenX, {
          toValue: -1.2,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [sheenX]);

  const sheenTranslate = sheenX.interpolate({
    inputRange: [-1.2, 2.2],
    outputRange: [-btnWidth * 0.5, btnWidth * 1.2],
  });

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.sheenButtonWrap}>
      <View
        style={styles.sheenButton}
        onLayout={(e) => setBtnWidth(e.nativeEvent.layout.width)}
      >
        {/* Sheen overlay — clipped by overflow:hidden on parent */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.sheenStripe,
            { transform: [{ translateX: sheenTranslate }, { skewX: '-18deg' }] },
          ]}
        />
        {/* Label sits above the sheen layer */}
        <View style={styles.sheenButtonContent}>
          <Text style={styles.sheenButtonText}>{label}</Text>
          <Ionicons name="arrow-forward" size={20} color={colors.background} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

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
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Back — cyan chevron, iOS convention */}
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backRow}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={20} color={colors.primary} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>

          {/* Eyebrow */}
          <View style={styles.eyebrowRow}>
            <Text style={styles.eyebrowText}>OSPOS</Text>
            <Text style={styles.eyebrowDot}>·</Text>
            <Text style={styles.eyebrowText}>STRIPE</Text>
          </View>

          {/* Headline — DM Serif Display, OSPOS hero typography */}
          <Text style={styles.headline}>Connect your{'\n'}Stripe account</Text>

          {/* Subhead */}
          <Text style={styles.subhead}>
            We&rsquo;ll open Stripe in your browser to set up payouts. Sign in or create an account &mdash; OSPOS brings you right back when you&rsquo;re done.
          </Text>

          {/* Handoff connector card — OSPOS node ↔ Safari pulse ↔ Stripe node */}
          <HandoffConnector />

          {/* Section eyebrow */}
          <Text style={styles.sectionEyebrow}>BEFORE YOU START</Text>

          {/* Three bullet items with icon boxes — replaces the old plain text bullets */}
          <View style={styles.bullets}>
            <BulletItem
              icon="mail-outline"
              title="Your payout email"
              body="Where Stripe deposits the money you earn"
            />
            <BulletItem
              icon="card-outline"
              title="Business details, photo ID & bank account"
              body="Stripe verifies you and where funds land"
            />
            <BulletItem
              icon="time-outline"
              title="About 1–3 minutes"
              badge="FAST"
              body="If you already have a Stripe account"
            />
          </View>

          {/* Trust chip — cyan-tinted */}
          <View style={styles.trustChip}>
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} style={styles.trustIcon} />
            <Text style={styles.trustText}>
              Your details go straight to Stripe — <Text style={styles.trustEmphasis}>OSPOS never sees them.</Text>
            </Text>
          </View>

          {/* "No website?" hint — surfaces the Instagram-URL workaround at the
              friction point. Merchants without a business website (food trucks,
              market vendors, popups) were bailing here before this hint
              landed because Stripe asks for a business website during the
              Connect flow and they didn't realize a social URL works. */}
          <View style={styles.hintCard}>
            <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} style={styles.hintIcon} />
            <Text style={styles.hintText}>{strings.stripeOnboarding.instagramHint}</Text>
          </View>
        </ScrollView>

        {/* Pinned actions — primary has BOTH sheen animation AND depth */}
        <View style={styles.pinnedActions}>
          <SheenButton label="Continue to Stripe" onPress={beginStripeFlow} />
          {/* Skip-to-cash escape hatch. The previous funnel had merchants
              bail the whole app when they got intimidated by Stripe Connect;
              this lets them drop into cash mode immediately and connect
              Stripe later from Settings whenever they're ready. */}
          <TouchableOpacity onPress={handleSkipToCash} style={styles.skipButton} activeOpacity={0.7}>
            <Text style={styles.skipButtonText}>{strings.stripeOnboarding.skipCashModeLabel}</Text>
          </TouchableOpacity>
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

  // ───── New v1.1.1 redesign — replaces the legacy headsUp* styles above ─────
  scrollContent: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
    marginBottom: spacing.xxl,
    paddingVertical: spacing.xs,
  },

  // Eyebrow — JetBrains Mono caps, cyan, OSPOS · STRIPE
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  eyebrowText: {
    ...typography.eyebrow,
    color: colors.primary,
    letterSpacing: 2.5,
    fontSize: 12,
  },
  eyebrowDot: {
    ...typography.eyebrow,
    color: colors.primary,
    opacity: 0.45,
    fontSize: 12,
  },

  // Headline — DM Serif Display, OSPOS hero typography
  headline: {
    fontFamily: fonts.displaySerif,
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -0.5,
    color: colors.text,
    marginBottom: spacing.md,
  },

  // Subhead — Inter body, lighter color
  subhead: {
    ...typography.body,
    fontSize: 15.5,
    lineHeight: 22,
    color: colors.textSecondary,
    marginBottom: spacing.xxl,
    maxWidth: 360,
  },

  // ───── Handoff connector card ─────
  handoffCard: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderRadius: borderRadius.xl,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    marginBottom: spacing.xxl,
  },
  handoffRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  node: {
    alignItems: 'center',
    gap: 8,
    width: 56,
    flexShrink: 0,
  },
  ospOsBox: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#0C0C0E',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    // Depth: subtle cyan glow + inset highlight
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 9,
  },
  ospOsLabel: {
    fontFamily: fonts.display,
    fontSize: 17,
    letterSpacing: -0.5,
    color: colors.primary,
  },
  stripeBox: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#5C53F0', // Stripe purple
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#635BFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 9,
    // Inset highlight on top edge via overlay would need a child View; the
    // solid purple reads fine without it in the dark venue context.
  },
  stripeLabel: {
    fontFamily: fonts.display,
    fontSize: 19,
    letterSpacing: -0.5,
    color: colors.white,
  },
  nodeLabel: {
    ...typography.eyebrow,
    fontSize: 10,
    letterSpacing: 1.5,
    color: '#7C7C82',
  },
  connector: {
    flex: 1,
    height: 54,
    marginHorizontal: spacing.xs,
    position: 'relative',
    justifyContent: 'center',
  },
  dashedLine: {
    position: 'absolute',
    top: 26,
    left: 0,
    right: 0,
    borderTopWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.22)',
    borderStyle: 'dashed',
  },
  halo: {
    position: 'absolute',
    top: 6,
    left: '50%',
    width: 42,
    height: 42,
    borderRadius: 21,
    marginLeft: -21,
    backgroundColor: 'rgba(34,211,238,0.28)',
  },
  safariBadge: {
    position: 'absolute',
    top: 12,
    left: '50%',
    marginLeft: -15,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#0C0C0F',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  travellingDot: {
    position: 'absolute',
    top: 23,
    left: 0,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
    zIndex: 1,
  },
  roundTripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  roundTripText: {
    ...typography.caption,
    fontSize: 12.5,
    color: '#8A8A90',
  },

  // ───── Section eyebrow + bullets ─────
  sectionEyebrow: {
    ...typography.eyebrow,
    fontSize: 11,
    letterSpacing: 2,
    color: '#6B6B71',
    marginBottom: spacing.lg,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  bulletIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bulletText: {
    flex: 1,
    paddingTop: 1,
  },
  bulletTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  bulletTitle: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 15.5,
    lineHeight: 21,
    color: colors.text,
  },
  bulletBody: {
    ...typography.caption,
    fontSize: 13.5,
    lineHeight: 19,
    color: '#8A8A90',
    marginTop: 2,
  },
  bulletBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(34,211,238,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.25)',
  },
  bulletBadgeText: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    letterSpacing: 0.3,
    color: colors.primary,
  },

  // ───── Trust chip ─────
  trustChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 3,
    paddingHorizontal: spacing.md + 1,
    borderRadius: 13,
    backgroundColor: 'rgba(34,211,238,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.16)',
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  trustIcon: {
    flexShrink: 0,
  },
  trustText: {
    ...typography.caption,
    fontSize: 13,
    lineHeight: 18,
    color: '#B4B4BA',
    flexShrink: 1,
  },
  trustEmphasis: {
    color: colors.text,
    fontFamily: fonts.displaySemiBold,
  },

  // ───── Pinned actions (bottom) ─────
  pinnedActions: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    backgroundColor: colors.background,
    gap: spacing.sm + 3,
    // Subtle fade-out gradient above (RN doesn't support linear-gradient
    // natively without a lib — the solid background gives a clean cut
    // against the scroll content which is good enough on iOS).
  },

  // ───── Sheen button — primary CTA with both sheen + depth ─────
  sheenButtonWrap: {
    borderRadius: borderRadius.xl - 2,
    // Depth: cyan glow shadow that reads as a halo under the button.
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
  },
  sheenButton: {
    height: 56,
    borderRadius: borderRadius.xl - 2,
    backgroundColor: colors.primary,
    overflow: 'hidden', // clips the sheen overlay at the rounded corners
    // Depth: chunky bottom edge in a darker primary tone, OSPOS card pattern.
    borderBottomWidth: 4,
    borderBottomColor: colors.primaryDark,
  },
  sheenStripe: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '40%',
    backgroundColor: 'rgba(255,255,255,0.5)',
    // skewX is applied inline via transform so the angle is visible
  },
  sheenButtonContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  sheenButtonText: {
    fontFamily: fonts.display,
    fontSize: 17,
    lineHeight: 17,
    color: colors.background,
    letterSpacing: -0.2,
  },

  // ───── Skip button — secondary ghost CTA ─────
  skipButton: {
    height: 52,
    borderRadius: borderRadius.xl - 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButtonText: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 15.5,
    color: colors.text,
  },
});

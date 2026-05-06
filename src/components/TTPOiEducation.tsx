import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing } from '../constants/theme';
import { strings } from '../constants/strings';
import Button from './Button';
import {
  isAppleEducationSupported,
  showHowToTap,
} from '../../modules/ttpoi-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface TTPOiEducationProps {
  onComplete: () => void;
  showTryItNow?: boolean;
}

// Legacy carousel used on Android and iOS < 18. Apple asked us not to use this
// on iOS 18+ because static slides don't "demonstrate" contactless cards or
// digital wallets per requirements 4.4 / 4.5 — use ProximityReaderDiscovery
// instead, which is what the iOS 18+ branch below does.
const LEGACY_PAGES = [
  {
    sfSymbol: 'wave.3.right.circle.fill' as const,
    ionicon: 'card-outline' as const,
    title: strings.ttpoi.educationCard,
    description: strings.ttpoi.educationCardDesc,
  },
  {
    sfSymbol: 'apple.logo' as const,
    ionicon: 'wallet-outline' as const,
    title: strings.ttpoi.educationWallet,
    description: strings.ttpoi.educationWalletDesc,
  },
  {
    sfSymbol: 'lock.shield.fill' as const,
    ionicon: 'shield-checkmark-outline' as const,
    title: strings.ttpoi.educationTips,
    description: strings.ttpoi.educationTipsDesc,
  },
];

function PageIcon({
  sfSymbol,
  ionicon,
  size = 48,
}: {
  sfSymbol: string;
  ionicon: string;
  size?: number;
}) {
  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        name={sfSymbol as any}
        size={size}
        tintColor={colors.primary}
        style={{ width: size, height: size }}
      />
    );
  }
  return <Ionicons name={ionicon as any} size={size} color={colors.primary} />;
}

export default function TTPOiEducation({
  onComplete,
  showTryItNow = false,
}: TTPOiEducationProps) {
  const useAppleEducation = isAppleEducationSupported();

  if (useAppleEducation) {
    return (
      <AppleEducation onComplete={onComplete} showTryItNow={showTryItNow} />
    );
  }
  return <LegacyEducation onComplete={onComplete} showTryItNow={showTryItNow} />;
}

// ---------- iOS 18+ branch ----------
// Auto-presents Apple's ProximityReaderDiscovery overlay on mount. That overlay
// is Apple-authored animated content covering contactless cards + digital
// wallets — it's the only education UI Apple pre-approves, so using it closes
// the feedback loop on requirements 4.3 / 4.4 / 4.5.
function AppleEducation({ onComplete, showTryItNow }: TTPOiEducationProps) {
  const [presented, setPresented] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasPresented = useRef(false);

  const present = async () => {
    try {
      await showHowToTap();
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Unable to present education overlay.');
    } finally {
      setPresented(true);
    }
  };

  useEffect(() => {
    if (hasPresented.current) return;
    hasPresented.current = true;
    void present();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{strings.ttpoi.educationTitle}</Text>

      <View style={styles.applePage}>
        {!presented ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : (
          <>
            <View style={styles.iconCircle}>
              <PageIcon
                sfSymbol="checkmark.seal.fill"
                ionicon="checkmark-circle"
                size={56}
              />
            </View>
            <Text style={styles.pageTitle}>
              {strings.ttpoi.educationReadyTitle}
            </Text>
            <Text style={styles.pageDescription}>
              {strings.ttpoi.educationReadyDesc}
            </Text>
            <View style={styles.watchAgainRow}>
              <Button
                label={strings.ttpoi.educationWatchAgain}
                variant="ghost"
                size="md"
                onPress={() => { void present(); }}
              />
            </View>
            {error !== null && (
              <Text style={styles.errorText}>{error}</Text>
            )}
          </>
        )}
      </View>

      <View style={styles.nextRow}>
        <Button
          label={showTryItNow ? strings.ttpoi.tryItNow : strings.ttpoi.configDone}
          variant="primary"
          size="lg"
          onPress={onComplete}
        />
      </View>

      <Text style={styles.disclaimer}>{strings.ttpoi.disclaimerShort}</Text>
    </View>
  );
}

// ---------- Legacy branch (Android + iOS < 18) ----------
function LegacyEducation({ onComplete, showTryItNow }: TTPOiEducationProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const isLastPage = currentPage === LEGACY_PAGES.length - 1;

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentPage(page);
  };

  const handleNext = () => {
    if (isLastPage) {
      onComplete();
    } else {
      scrollRef.current?.scrollTo({
        x: (currentPage + 1) * SCREEN_WIDTH,
        animated: true,
      });
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>{strings.ttpoi.educationTitle}</Text>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        style={styles.scrollView}
      >
        {LEGACY_PAGES.map((page, index) => (
          <View key={index} style={styles.page}>
            <View style={styles.iconCircle}>
              <PageIcon sfSymbol={page.sfSymbol} ionicon={page.ionicon} />
            </View>
            <Text style={styles.pageTitle}>{page.title}</Text>
            <Text style={styles.pageDescription}>{page.description}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {LEGACY_PAGES.map((_, index) => (
          <View
            key={index}
            style={[styles.dot, currentPage === index && styles.dotActive]}
          />
        ))}
      </View>

      <View style={styles.nextRow}>
        <Button
          label={isLastPage
            ? showTryItNow
              ? strings.ttpoi.tryItNow
              : strings.ttpoi.configDone
            : 'Next'}
          variant="primary"
          size="lg"
          onPress={handleNext}
        />
      </View>

      <Text style={styles.disclaimer}>{strings.ttpoi.disclaimerShort}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sectionTitle: {
    ...typography.title2,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  scrollView: {
    flex: 1,
  },
  page: {
    width: SCREEN_WIDTH - spacing.xxxl * 2,
    marginHorizontal: spacing.xxxl,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
  },
  applePage: {
    flex: 1,
    paddingHorizontal: spacing.xxxl,
    paddingVertical: spacing.xxxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xxl,
  },
  pageTitle: {
    ...typography.title3,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  pageDescription: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: spacing.lg,
  },
  watchAgainRow: {
    marginTop: spacing.xl,
    alignItems: 'center',
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceLight,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 24,
  },
  nextRow: {
    marginHorizontal: spacing.xxxl,
    marginBottom: spacing.xl,
  },
  disclaimer: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
});

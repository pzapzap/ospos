import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../constants/theme';
import { strings } from '../constants/strings';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface TTPOiEducationProps {
  onComplete: () => void;
  showTryItNow?: boolean;
}

// SF Symbol names for iOS, Ionicons fallback for Android
const PAGES = [
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

function PageIcon({ sfSymbol, ionicon, size = 48 }: { sfSymbol: string; ionicon: string; size?: number }) {
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

export default function TTPOiEducation({ onComplete, showTryItNow = false }: TTPOiEducationProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const isLastPage = currentPage === PAGES.length - 1;

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentPage(page);
  };

  const handleNext = () => {
    if (isLastPage) {
      onComplete();
    } else {
      scrollRef.current?.scrollTo({ x: (currentPage + 1) * SCREEN_WIDTH, animated: true });
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
        {PAGES.map((page, index) => (
          <View key={index} style={styles.page}>
            <View style={styles.iconCircle}>
              <PageIcon sfSymbol={page.sfSymbol} ionicon={page.ionicon} />
            </View>
            <Text style={styles.pageTitle}>{page.title}</Text>
            <Text style={styles.pageDescription}>{page.description}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Page dots */}
      <View style={styles.dots}>
        {PAGES.map((_, index) => (
          <View
            key={index}
            style={[styles.dot, currentPage === index && styles.dotActive]}
          />
        ))}
      </View>

      <TouchableOpacity
        style={styles.nextButton}
        onPress={handleNext}
        activeOpacity={0.7}
      >
        <Text style={styles.nextButtonText}>
          {isLastPage
            ? showTryItNow
              ? strings.ttpoi.tryItNow
              : strings.ttpoi.configDone
            : 'Next'}
        </Text>
      </TouchableOpacity>

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
  nextButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    marginHorizontal: spacing.xxxl,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  nextButtonText: {
    ...typography.bodyBold,
    color: colors.black,
    fontSize: 16,
  },
  disclaimer: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
});

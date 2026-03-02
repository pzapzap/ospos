import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView as SafeAreaViewCompat } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, typography, spacing, borderRadius } from '../../constants/theme';
import { strings } from '../../constants/strings';
import { useOnboarding } from '../../state/OnboardingContext';
import { lightTap } from '../../utils/haptics';
import type { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';

type Nav = NativeStackNavigationProp<OnboardingStackParamList, 'ModeSelect'>;

export default function ModeSelectScreen() {
  const navigation = useNavigation<Nav>();
  const { dispatch } = useOnboarding();

  const handleCashOnly = async () => {
    await lightTap();
    dispatch({ type: 'SET_TIER', payload: 'free' });
    navigation.navigate('BusinessName');
  };

  const handleAcceptCards = async () => {
    await lightTap();
    dispatch({ type: 'SET_TIER', payload: 'paid' });
    navigation.navigate('StripeAuth');
  };

  return (
    <SafeAreaViewCompat style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>{strings.onboarding.modeSelectTitle}</Text>

        <TouchableOpacity
          style={styles.card}
          onPress={handleCashOnly}
          activeOpacity={0.7}
        >
          <View style={styles.iconContainer}>
            <Ionicons name="cash-outline" size={48} color={colors.primary} />
          </View>
          <Text style={styles.cardTitle}>{strings.onboarding.cashOnlyTitle}</Text>
          <Text style={styles.cardDescription}>
            {strings.onboarding.cashOnlyDescription}
          </Text>
          <View style={[styles.badge, styles.freeBadge]}>
            <Text style={styles.freeBadgeText}>{strings.onboarding.cashOnlyBadge}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={handleAcceptCards}
          activeOpacity={0.7}
        >
          <View style={styles.iconContainer}>
            <Ionicons name="card-outline" size={48} color={colors.primary} />
          </View>
          <Text style={styles.cardTitle}>{strings.onboarding.acceptCardsTitle}</Text>
          <Text style={styles.cardDescription}>
            {strings.onboarding.acceptCardsDescription}
          </Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{strings.onboarding.acceptCardsBadge}</Text>
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    gap: spacing.xl,
  },
  title: {
    ...typography.title1,
    textAlign: 'center',
    marginBottom: spacing.xxxl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  cardTitle: {
    ...typography.title2,
    marginBottom: spacing.sm,
  },
  cardDescription: {
    ...typography.body,
    color: colors.textSecondary,
  },
  badge: {
    marginTop: spacing.md,
    alignSelf: 'flex-start',
    backgroundColor: colors.cardHighlight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  freeBadge: {
    backgroundColor: colors.successLight,
  },
  badgeText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  freeBadgeText: {
    ...typography.caption,
    color: colors.primary,
  },
});

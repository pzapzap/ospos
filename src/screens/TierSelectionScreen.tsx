import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, typography, spacing, borderRadius } from '../constants/theme';
import { strings } from '../constants/strings';
import { lightTap } from '../utils/haptics';

const TIER_KEY = 'ospos_tier_selected';

interface TierSelectionScreenProps {
  onTierSelected: (tier: 'free' | 'paid') => void;
}

export default function TierSelectionScreen({ onTierSelected }: TierSelectionScreenProps) {
  const handleFreeTier = async () => {
    await lightTap();
    await AsyncStorage.setItem(TIER_KEY, 'free');
    onTierSelected('free');
  };

  const handlePaidTier = async () => {
    await lightTap();
    onTierSelected('paid');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{strings.tierSelection.title}</Text>

        <TouchableOpacity
          style={styles.card}
          onPress={handleFreeTier}
          activeOpacity={0.7}
        >
          <View style={styles.iconContainer}>
            <Ionicons name="cash-outline" size={48} color={colors.primary} />
          </View>
          <Text style={styles.cardTitle}>{strings.tierSelection.freeTitle}</Text>
          <Text style={styles.cardDescription}>
            {strings.tierSelection.freeDescription}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={handlePaidTier}
          activeOpacity={0.7}
        >
          <View style={styles.iconContainer}>
            <Ionicons name="card-outline" size={48} color={colors.primary} />
          </View>
          <Text style={styles.cardTitle}>{strings.tierSelection.cardTitle}</Text>
          <Text style={styles.cardDescription}>
            {strings.tierSelection.cardDescription}
          </Text>
          <View style={styles.feeBadge}>
            <Text style={styles.feeText}>1% per transaction</Text>
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

export { TIER_KEY };

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
    borderColor: colors.primary,
  },
  feeBadge: {
    marginTop: spacing.md,
    alignSelf: 'flex-start',
    backgroundColor: colors.cardHighlight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  feeText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  cardTitle: {
    ...typography.title2,
    marginBottom: spacing.sm,
  },
  cardDescription: {
    ...typography.body,
    color: colors.textSecondary,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
});

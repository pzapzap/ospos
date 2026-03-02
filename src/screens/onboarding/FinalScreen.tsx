import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import OnboardingScreen from '../../components/OnboardingScreen';
import { colors, typography, spacing, borderRadius } from '../../constants/theme';
import { strings } from '../../constants/strings';
import { useOnboarding } from '../../state/OnboardingContext';
import { successNotification } from '../../utils/haptics';
import { getCurrencySymbol } from '../../utils/currency';

const ROW_COUNT = 3;

export default function FinalScreen() {
  const navigation = useNavigation();
  const { state, commitOnboarding } = useOnboarding();

  const isPaid = state.tier === 'paid';
  const totalSteps = isPaid ? 4 : 5;
  const currentStep = isPaid ? 3 : 4;

  // Staggered fade-in animations
  const opacities = useRef(
    Array.from({ length: ROW_COUNT }, () => new Animated.Value(0)),
  ).current;
  const translateYs = useRef(
    Array.from({ length: ROW_COUNT }, () => new Animated.Value(10)),
  ).current;

  useEffect(() => {
    const animations = Array.from({ length: ROW_COUNT }, (_, i) =>
      Animated.parallel([
        Animated.timing(opacities[i], {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(translateYs[i], {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
    );
    Animated.stagger(100, animations).start();
  }, []);

  const handleAddMenu = async () => {
    await successNotification();
    await commitOnboarding(undefined, { initialTab: 'Menu' });
  };

  const handleStartSelling = async () => {
    await successNotification();
    await commitOnboarding();
  };

  const currencyDisplay = `${state.currency} (${getCurrencySymbol(state.currency)})`;
  const taxDisplay = state.taxRate === '0' || state.taxRate === '' ? '0%' : `${state.taxRate}%`;

  const rows = [
    { label: strings.onboarding.finalBusinessName, value: state.businessName || '\u2014' },
    { label: strings.onboarding.finalCurrency, value: currencyDisplay },
    { label: strings.onboarding.finalTaxRate, value: taxDisplay },
  ];

  return (
    <OnboardingScreen
      title={strings.onboarding.finalTitle}
      primaryLabel={strings.onboarding.finalAddMenu}
      onPrimary={handleAddMenu}
      skipLabel={strings.onboarding.finalStartSelling}
      onSkip={handleStartSelling}
      currentStep={currentStep}
      totalSteps={totalSteps}
      onBack={() => navigation.goBack()}
    >
      <View style={styles.card}>
        {rows.map((row, i) => (
          <Animated.View
            key={row.label}
            style={{
              opacity: opacities[i],
              transform: [{ translateY: translateYs[i] }],
            }}
          >
            <SummaryRow label={row.label} value={row.value} />
            {i < rows.length - 1 && <View style={styles.divider} />}
          </Animated.View>
        ))}
      </View>
    </OnboardingScreen>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    marginTop: spacing.xxl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  label: {
    ...typography.body,
    color: colors.textSecondary,
  },
  value: {
    ...typography.bodyBold,
  },
});

import React, { useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { SafeAreaView as SafeAreaViewCompat } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';
import { colors, typography, spacing, borderRadius, touchTargets } from '../constants/theme';
import { strings } from '../constants/strings';

interface OnboardingScreenProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  skipLabel?: string;
  onSkip?: () => void;
  currentStep: number;
  totalSteps: number;
  onBack?: () => void;
}

export default function OnboardingScreen({
  title,
  subtitle,
  children,
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  skipLabel,
  onSkip,
  currentStep,
  totalSteps,
  onBack,
}: OnboardingScreenProps) {
  // --- Animated progress dots ---
  const dotScales = useRef<Animated.Value[]>(
    Array.from({ length: totalSteps }, (_, i) =>
      new Animated.Value(i === currentStep ? 1.25 : 1.0),
    ),
  ).current;

  useEffect(() => {
    const animations = dotScales.map((scale, i) =>
      Animated.spring(scale, {
        toValue: i === currentStep ? 1.25 : 1.0,
        friction: 7,
        tension: 40,
        useNativeDriver: true,
      }),
    );
    Animated.parallel(animations).start();
  }, [currentStep]);

  // --- Animated primary button ---
  const buttonScale = useRef(new Animated.Value(1)).current;

  const handleButtonPressIn = () => {
    if (primaryDisabled) return;
    Animated.timing(buttonScale, {
      toValue: 0.97,
      duration: 50,
      useNativeDriver: true,
    }).start();
  };

  const handleButtonPressOut = () => {
    if (primaryDisabled) return;
    Animated.timing(buttonScale, {
      toValue: 1,
      duration: 50,
      useNativeDriver: true,
    }).start();
  };

  return (
    <SafeAreaViewCompat style={styles.container} edges={['top', 'bottom']}>
      {/* Back button */}
      <View style={styles.backRow}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            style={styles.backButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="chevron-back" size={24} color={colors.primary} />
            <Text style={styles.backText}>{strings.onboarding.back}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backPlaceholder} />
        )}
      </View>

      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      <View style={styles.content}>{children}</View>

      {/* Animated progress dots */}
      <View style={styles.dotsRow}>
        {Array.from({ length: totalSteps }, (_, i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i === currentStep ? colors.primary : colors.surfaceLight,
                transform: [{ scale: dotScales[i] }],
              },
            ]}
          />
        ))}
      </View>

      {/* Animated primary button */}
      <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
        <Pressable
          style={[styles.primaryButton, primaryDisabled && styles.primaryButtonDisabled]}
          onPress={onPrimary}
          onPressIn={handleButtonPressIn}
          onPressOut={handleButtonPressOut}
          disabled={primaryDisabled}
        >
          <Text style={[styles.primaryButtonText, primaryDisabled && styles.primaryButtonTextDisabled]}>
            {primaryLabel}
          </Text>
        </Pressable>
      </Animated.View>

      {skipLabel && onSkip ? (
        <TouchableOpacity style={styles.skipButton} onPress={onSkip} activeOpacity={0.7}>
          <Text style={styles.skipText}>{skipLabel}</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.skipPlaceholder} />
      )}
    </SafeAreaViewCompat>
  );
}

const DOT_SIZE = 8;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xxl,
  },
  backRow: {
    height: touchTargets.minimum,
    justifyContent: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  backText: {
    ...typography.body,
    color: colors.primary,
    marginLeft: spacing.xs,
  },
  backPlaceholder: {
    height: touchTargets.minimum,
  },
  title: {
    ...typography.title1,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  content: {
    flex: 1,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    minHeight: touchTargets.chargeButton,
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  primaryButtonText: {
    ...typography.bodyBold,
    color: colors.black,
    fontSize: 18,
  },
  primaryButtonTextDisabled: {
    color: colors.textMuted,
  },
  skipButton: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  skipText: {
    ...typography.body,
    color: colors.primary,
  },
  skipPlaceholder: {
    height: spacing.lg,
  },
});

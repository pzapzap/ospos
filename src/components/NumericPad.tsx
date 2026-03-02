import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, touchTargets } from '../constants/theme';
import { lightTap } from '../utils/haptics';
import { isPercentageWithinRange } from '../utils/numericPad';

interface NumericPadProps {
  mode: 'percentage' | 'currency';
  value: string;
  onValueChange: (digits: string) => void;
  currencyCode?: string;
  onSpecialKey?: () => void;
  specialKeyLabel?: string;
  maxDigits?: number;
}

interface PadKeyProps {
  label: string;
  onPress: () => void;
  variant?: 'digit' | 'special' | 'backspace';
}

function PadKey({ label, onPress, variant = 'digit' }: PadKeyProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.timing(scaleAnim, {
      toValue: 0.95,
      duration: 50,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 50,
      useNativeDriver: true,
    }).start();
  };

  const handlePress = async () => {
    await lightTap();
    onPress();
  };

  return (
    <Animated.View style={[styles.keyWrapper, { transform: [{ scale: scaleAnim }] }]}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.key}
        accessibilityRole="button"
        accessibilityLabel={variant === 'backspace' ? 'Delete' : label}
      >
        {variant === 'backspace' ? (
          <Ionicons name="backspace-outline" size={24} color={colors.text} />
        ) : (
          <Text
            style={variant === 'special' ? styles.specialKeyText : styles.digitKeyText}
            numberOfLines={1}
          >
            {label}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

export default function NumericPad({
  mode,
  value,
  onValueChange,
  onSpecialKey,
  specialKeyLabel,
  maxDigits,
}: NumericPadProps) {
  const limit = maxDigits ?? (mode === 'percentage' ? 4 : 8);

  const handleDigit = useCallback(
    (digit: string) => {
      if (value.length >= limit) return;
      const next = value + digit;
      if (mode === 'percentage' && !isPercentageWithinRange(next)) return;
      onValueChange(next);
    },
    [value, limit, mode, onValueChange],
  );

  const handleBackspace = useCallback(() => {
    onValueChange(value.slice(0, -1));
  }, [value, onValueChange]);

  const handleSpecial = useCallback(() => {
    onSpecialKey?.();
  }, [onSpecialKey]);

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <View style={styles.grid}>
      {digits.map((d) => (
        <PadKey key={d} label={d} onPress={() => handleDigit(d)} />
      ))}
      {specialKeyLabel && onSpecialKey ? (
        <PadKey label={specialKeyLabel} onPress={handleSpecial} variant="special" />
      ) : (
        <View style={styles.keyWrapper} />
      )}
      <PadKey label="0" onPress={() => handleDigit('0')} />
      <PadKey label="backspace" onPress={handleBackspace} variant="backspace" />
    </View>
  );
}

const KEY_HEIGHT = touchTargets.chargeButton;

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  keyWrapper: {
    width: '33.333%',
    padding: spacing.xs,
  },
  key: {
    height: KEY_HEIGHT,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitKeyText: {
    ...typography.title2,
  },
  specialKeyText: {
    ...typography.caption,
    color: colors.primary,
  },
});

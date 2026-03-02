import React, { useRef, useEffect } from 'react';
import {
  Text,
  StyleSheet,
  Pressable,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { colors, typography, spacing, borderRadius } from '../constants/theme';
import { formatCurrency } from '../utils/currency';
import { successNotification, errorNotification } from '../utils/haptics';

// 5-state state machine: disabled → ready → processing → success|error
export type ChargeButtonState = 'disabled' | 'ready' | 'processing' | 'success' | 'error';

interface ChargeButtonProps {
  state: ChargeButtonState;
  total: number;
  currency: string;
  onPress: () => void;
  errorMessage?: string;
}

export default function ChargeButton({
  state,
  total,
  currency,
  onPress,
  errorMessage,
}: ChargeButtonProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Pulse animation for ready state
  useEffect(() => {
    if (state === 'ready') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.02,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [state, pulseAnim]);

  // Success haptic
  useEffect(() => {
    if (state === 'success') {
      successNotification();
    }
  }, [state]);

  // Error shake + haptic
  useEffect(() => {
    if (state === 'error') {
      errorNotification();
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
    }
  }, [state, shakeAnim]);

  const isDisabled = state === 'disabled' || state === 'processing';

  const bgColor =
    state === 'disabled' ? colors.disabled :
    state === 'success' ? colors.primary :
    state === 'error' ? colors.danger :
    state === 'processing' ? colors.primaryDark :
    colors.primary;

  const textColor =
    state === 'disabled' ? colors.textMuted :
    colors.black;

  const label =
    state === 'success' ? 'Paid' :
    state === 'error' ? (errorMessage ?? 'Try again') :
    state === 'processing' ? 'Processing...' :
    total > 0 ? `Charge ${formatCurrency(total, currency)}` :
    'Charge';

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          transform: [
            { scale: state === 'ready' ? pulseAnim : 1 },
            { translateX: state === 'error' ? shakeAnim : 0 },
          ],
        },
      ]}
    >
      <Pressable
        style={[styles.button, { backgroundColor: bgColor }]}
        onPress={isDisabled ? undefined : onPress}
        disabled={isDisabled}
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled }}
      >
        {state === 'processing' ? (
          <ActivityIndicator color={colors.black} size="small" style={{ marginRight: spacing.sm }} />
        ) : null}
        <Text style={[styles.buttonText, { color: textColor }]}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  button: {
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    flexDirection: 'row',
    minHeight: 56,
  },
  buttonText: {
    ...typography.price,
  },
});

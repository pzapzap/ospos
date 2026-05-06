import React, { useRef, useEffect } from 'react';
import {
  Text,
  StyleSheet,
  Pressable,
  Animated,
  ActivityIndicator,
  View,
} from 'react-native';
import { colors, fonts } from '../constants/theme';
import { formatCurrency } from '../utils/currency';
import { successNotification, errorNotification, lightTap } from '../utils/haptics';

// 5-state state machine: disabled → ready → processing → success|error
export type ChargeButtonState = 'disabled' | 'ready' | 'processing' | 'success' | 'error';

interface ChargeButtonProps {
  state: ChargeButtonState;
  total: number;
  currency: string;
  onPress: () => void;
  errorMessage?: string;
}

const HEIGHT = 64;
const RADIUS = 24;
const SHADOW_HEIGHT = 2;
const PRESS_DURATION = 80;

export default function ChargeButton({
  state,
  total,
  currency,
  onPress,
  errorMessage,
}: ChargeButtonProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const pressTranslateY = useRef(new Animated.Value(0)).current;
  const shadowOpacity = useRef(new Animated.Value(1)).current;

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

  const borderColor =
    state === 'disabled' ? colors.disabled :
    state === 'error' ? colors.dangerDark :
    colors.primaryDark;

  const textColor =
    state === 'disabled' ? colors.textMuted :
    colors.black;

  const label =
    state === 'success' ? 'Paid' :
    state === 'error' ? (errorMessage ?? 'Try again') :
    state === 'processing' ? 'Processing...' :
    total > 0 ? `Charge ${formatCurrency(total, currency)}` :
    'Charge';

  const handlePressIn = () => {
    if (isDisabled) return;
    Animated.parallel([
      Animated.timing(pressTranslateY, { toValue: SHADOW_HEIGHT, duration: PRESS_DURATION, useNativeDriver: true }),
      Animated.timing(shadowOpacity, { toValue: 0, duration: PRESS_DURATION, useNativeDriver: true }),
    ]).start();
  };

  const handlePressOut = () => {
    if (isDisabled) return;
    Animated.parallel([
      Animated.timing(pressTranslateY, { toValue: 0, duration: PRESS_DURATION, useNativeDriver: true }),
      Animated.timing(shadowOpacity, { toValue: 1, duration: PRESS_DURATION, useNativeDriver: true }),
    ]).start();
  };

  const handlePress = () => {
    lightTap();
    onPress();
  };

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
      {/* Bottom-edge shadow */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.shadow,
          {
            backgroundColor: borderColor,
            borderRadius: RADIUS,
            opacity: shadowOpacity,
          },
        ]}
      />
      <Animated.View style={{ transform: [{ translateY: pressTranslateY }] }}>
        <Pressable
          style={[styles.button, { backgroundColor: bgColor, borderColor }]}
          onPress={isDisabled ? undefined : handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={isDisabled}
          accessibilityLabel={label}
          accessibilityRole="button"
          accessibilityState={{ disabled: isDisabled }}
        >
          {state === 'processing' ? (
            <ActivityIndicator color={colors.black} size="small" style={{ marginRight: 8 }} />
          ) : null}
          <Text style={[styles.buttonText, { color: textColor }]}>
            {label}
          </Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    height: HEIGHT + SHADOW_HEIGHT,
  },
  shadow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: SHADOW_HEIGHT,
    height: HEIGHT,
  },
  button: {
    borderWidth: 2,
    borderRadius: RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    height: HEIGHT,
  },
  buttonText: {
    fontSize: 20,
    fontFamily: fonts.num,
  },
});

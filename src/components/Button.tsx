import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  TextStyle,
  GestureResponderEvent,
  AccessibilityProps,
} from 'react-native';
import { colors, fonts } from '../constants/theme';
import { lightTap } from '../utils/haptics';

export type ButtonVariant = 'primary' | 'cash' | 'destructive' | 'ghost';
export type ButtonSize = 'lg' | 'md' | 'sm';

interface ButtonProps extends AccessibilityProps {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: ViewStyle;
  hapticOnPress?: boolean;
}

const sizeStyles: Record<ButtonSize, { height: number; radius: number; padX: number; fontSize: number }> = {
  lg: { height: 64, radius: 24, padX: 28, fontSize: 20 },
  md: { height: 48, radius: 18, padX: 20, fontSize: 16 },
  sm: { height: 32, radius: 14, padX: 14, fontSize: 13 },
};

const variantStyles: Record<ButtonVariant, { fill: string; border: string; text: string }> = {
  primary:     { fill: colors.primary, border: colors.primaryDark, text: colors.background },
  cash:        { fill: colors.cash,    border: colors.cashDark,    text: colors.background },
  destructive: { fill: colors.danger,  border: colors.dangerDark,  text: colors.text },
  ghost:       { fill: 'transparent',  border: colors.border,      text: colors.text },
};

const SHADOW_HEIGHT = 2;
const PRESS_DURATION = 80;

export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  leftIcon,
  rightIcon,
  style,
  hapticOnPress = true,
  ...accessibility
}: ButtonProps) {
  const v = variantStyles[variant];
  const s = sizeStyles[size];
  const translateY = useRef(new Animated.Value(0)).current;
  const shadowOpacity = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: SHADOW_HEIGHT, duration: PRESS_DURATION, useNativeDriver: true }),
      Animated.timing(shadowOpacity, { toValue: 0, duration: PRESS_DURATION, useNativeDriver: true }),
    ]).start();
  };

  const handlePressOut = () => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration: PRESS_DURATION, useNativeDriver: true }),
      Animated.timing(shadowOpacity, { toValue: 1, duration: PRESS_DURATION, useNativeDriver: true }),
    ]).start();
  };

  const handlePress = (e: GestureResponderEvent) => {
    if (hapticOnPress) lightTap();
    onPress(e);
  };

  const isInteractive = !disabled && !loading;
  const fillColor = disabled ? colors.disabled : v.fill;
  const borderColor = disabled ? colors.disabled : v.border;
  const textColor = disabled ? colors.textMuted : v.text;

  const labelStyle: TextStyle = {
    fontFamily: fonts.displaySemiBold,
    fontSize: s.fontSize,
    color: textColor,
  };

  return (
    <View style={[{ height: s.height + SHADOW_HEIGHT }, style]}>
      {/* Bottom-edge shadow layer — same color as border */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.shadow,
          {
            backgroundColor: borderColor,
            borderRadius: s.radius,
            height: s.height,
            top: SHADOW_HEIGHT,
            opacity: shadowOpacity,
          },
        ]}
      />
      <Animated.View style={{ transform: [{ translateY }] }}>
        <Pressable
          onPress={isInteractive ? handlePress : undefined}
          onPressIn={isInteractive ? handlePressIn : undefined}
          onPressOut={isInteractive ? handlePressOut : undefined}
          disabled={!isInteractive}
          style={[
            styles.button,
            {
              backgroundColor: fillColor,
              borderColor,
              borderRadius: s.radius,
              height: s.height,
              paddingHorizontal: s.padX,
            },
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !isInteractive, busy: loading }}
          {...accessibility}
        >
          {leftIcon}
          <Text style={labelStyle} numberOfLines={1}>
            {loading ? '…' : label}
          </Text>
          {rightIcon}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  shadow: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});

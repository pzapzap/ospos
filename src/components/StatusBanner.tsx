import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../constants/theme';

interface StatusBannerProps {
  visible: boolean;
  message: string;
  backgroundColor: string;
  textColor?: string;
}

export default function StatusBanner({ visible, message, backgroundColor, textColor = colors.white }: StatusBannerProps) {
  if (!visible) return null;

  return (
    <View style={[styles.banner, { backgroundColor }]}>
      <Text style={[styles.text, { color: textColor }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  text: {
    ...typography.bodyBold,
    fontSize: 13,
    letterSpacing: 0.5,
  },
});

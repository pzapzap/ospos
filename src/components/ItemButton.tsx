import React, { useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { colors, typography, spacing, borderRadius } from '../constants/theme';
import { formatCurrency } from '../utils/currency';
import { lightTap } from '../utils/haptics';

interface ItemButtonProps {
  name: string;
  price: number;
  currency: string;
  onPress: () => void;
  selected?: boolean;
}

export default function ItemButton({ name, price, currency, onPress, selected }: ItemButtonProps) {
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
    <Animated.View style={[styles.wrapper, { transform: [{ scale: scaleAnim }] }]}>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityLabel={`${name}, ${formatCurrency(price, currency)}`}
        accessibilityRole="button"
      >
        <View style={[styles.button, selected && styles.buttonSelected]}>
          <Text style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          <Text style={styles.price}>{formatCurrency(price, currency)}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    margin: spacing.xs,
  },
  button: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 88,
  },
  buttonSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  name: {
    ...typography.bodyBold,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 4,
  },
  price: {
    ...typography.priceSmall,
    fontSize: 13,
  },
});

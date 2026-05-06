import React, { useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Image } from 'react-native';
import { colors, fonts, typography, spacing } from '../constants/theme';
import { formatCurrency } from '../utils/currency';
import { lightTap } from '../utils/haptics';
import Sticker from './Sticker';

interface ItemButtonProps {
  name: string;
  price: number;
  currency: string;
  onPress: () => void;
  selected?: boolean;
  imageUri?: string | null;
  stickerId?: string | null;
}

const SHADOW_HEIGHT = 2;
const PRESS_DURATION = 80;
const RADIUS = 18;
const MIN_HEIGHT = 110;

// Three-layer visual: photo → sticker → glyph (Bitter italic letterform).
// Universal chunky-card frame: 2px border + 2px bottom-edge shadow that
// compresses on press, just like the Button component.
export default function ItemButton({
  name,
  price,
  currency,
  onPress,
  selected,
  imageUri,
  stickerId,
}: ItemButtonProps) {
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

  const handlePress = async () => {
    await lightTap();
    onPress();
  };

  // Resolve visual layer: photo → sticker → glyph
  const hasPhoto = !!imageUri;
  const hasSticker = !!stickerId && stickerId !== 'custom';
  const glyph = (name?.[0] ?? '·').toUpperCase();

  const borderColor = selected ? colors.primaryDark : colors.border;
  const fillColor = selected ? colors.primaryLight : colors.surface;

  return (
    <View style={styles.wrapper}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.shadow,
          {
            backgroundColor: borderColor,
            opacity: shadowOpacity,
          },
        ]}
      />
      <Animated.View style={{ transform: [{ translateY }] }}>
        <Pressable
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          accessibilityLabel={`${name}, ${formatCurrency(price, currency)}`}
          accessibilityRole="button"
          style={[styles.card, { backgroundColor: fillColor, borderColor }]}
        >
          <View style={styles.visual}>
            {hasPhoto ? (
              <Image source={{ uri: imageUri! }} style={styles.photo} resizeMode="cover" />
            ) : hasSticker ? (
              <Sticker id={stickerId!} size={56} />
            ) : (
              <Text style={styles.glyph}>{glyph}</Text>
            )}
          </View>
          <View style={styles.meta}>
            <Text style={styles.name} numberOfLines={2}>
              {name}
            </Text>
            <Text style={styles.price}>{formatCurrency(price, currency)}</Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    margin: spacing.xs,
    height: MIN_HEIGHT + SHADOW_HEIGHT,
  },
  shadow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: SHADOW_HEIGHT,
    height: MIN_HEIGHT,
    borderRadius: RADIUS,
  },
  card: {
    borderWidth: 2,
    borderRadius: RADIUS,
    height: MIN_HEIGHT,
    overflow: 'hidden',
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'flex-end',
  },
  visual: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.sm,
  },
  photo: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    width: '100%',
    height: '100%',
  },
  glyph: {
    fontFamily: fonts.bodyItalic,
    fontSize: 56,
    color: colors.primary,
    lineHeight: 60,
  },
  meta: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(9,9,11,0.55)',
  },
  name: {
    ...typography.bodyBold,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 2,
  },
  price: {
    ...typography.priceSmall,
    fontSize: 12,
    textAlign: 'center',
  },
});

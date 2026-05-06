import React from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';
import { typography } from '../constants/theme';

interface EyebrowProps {
  children: string;
  style?: StyleProp<TextStyle>;
  color?: string;
}

// Mono caps metadata above titles. JetBrains Mono with fallback to Archivo
// (similar enough proportions that the fallback isn't jarring).
export default function Eyebrow({ children, style, color }: EyebrowProps) {
  return (
    <Text style={[typography.eyebrow, color ? { color } : null, style]} numberOfLines={1}>
      {children}
    </Text>
  );
}

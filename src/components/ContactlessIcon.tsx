import React from 'react';
import { Platform } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Ionicons } from '@expo/vector-icons';

interface ContactlessIconProps {
  size?: number;
  color?: string;
}

// Apple requires wave.3.right.circle SF Symbol for TTPOi checkout button (HIG 5.5)
export default function ContactlessIcon({ size = 28, color = '#22D3EE' }: ContactlessIconProps) {
  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        name="wave.3.right.circle"
        size={size}
        tintColor={color}
        style={{ width: size, height: size }}
      />
    );
  }
  return <Ionicons name="card-outline" size={size} color={color} />;
}

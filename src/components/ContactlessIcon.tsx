import React from 'react';
import { Ionicons } from '@expo/vector-icons';

interface ContactlessIconProps {
  size?: number;
  color?: string;
}

// Generic card icon for the payment button. Does not depict TTPOi or the
// EMVCo Contactless Symbol — just a standard card outline from Ionicons.
export default function ContactlessIcon({ size = 28, color = '#22D3EE' }: ContactlessIconProps) {
  return <Ionicons name="card-outline" size={size} color={color} />;
}

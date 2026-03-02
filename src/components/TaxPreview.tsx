import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '../constants/theme';
import { formatCurrency } from '../utils/currency';
import { digitsToPercentage } from '../utils/numericPad';

interface TaxPreviewProps {
  taxRateDigits: string;
  currencyCode: string;
}

export default function TaxPreview({ taxRateDigits, currencyCode }: TaxPreviewProps) {
  const taxRate = digitsToPercentage(taxRateDigits);
  const baseCents = 1000;
  const taxCents = Math.round(baseCents * taxRate / 100);

  return (
    <Text style={styles.text}>
      {'On a '}
      <Text style={styles.highlight}>{formatCurrency(baseCents, currencyCode)}</Text>
      {' sale, tax = '}
      <Text style={styles.highlight}>{formatCurrency(taxCents, currencyCode)}</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  highlight: {
    color: colors.primary,
  },
});

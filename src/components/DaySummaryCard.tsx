import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing, borderRadius, fonts } from '../constants/theme';
import { strings } from '../constants/strings';
import { formatCurrency } from '../utils/currency';

interface DaySummaryCardProps {
  totalSales: number;
  transactionCount: number;
  cashTotal: number;
  cardTotal: number;
  averageValue: number;
  currency: string;
}

export default function DaySummaryCard({
  totalSales,
  transactionCount,
  cashTotal,
  cardTotal,
  averageValue,
  currency,
}: DaySummaryCardProps) {
  // Cash/card split as a single stat — denser than two separate dollar
  // totals and reads as a story ("70/30"), not a financial breakdown.
  const split = totalSales > 0
    ? `${Math.round((cashTotal / totalSales) * 100)}% / ${Math.round((cardTotal / totalSales) * 100)}%`
    : '—';

  return (
    <View>
      {/* Hero — single big serif number, no chrome around it */}
      <View style={styles.heroCard} accessibilityRole="summary">
        <Text style={styles.heroLabel}>{strings.summary.totalSales}</Text>
        <Text
          style={styles.heroValue}
          accessibilityLabel={`${strings.summary.totalSales}: ${formatCurrency(totalSales, currency)}`}
        >
          {formatCurrency(totalSales, currency)}
        </Text>
      </View>

      {/* Three secondary stats in a row — quiet supporting cast */}
      <View style={styles.statsRow}>
        <Stat label={strings.summary.transactions} value={String(transactionCount)} />
        <Stat label={strings.summary.average} value={formatCurrency(averageValue, currency)} />
        <Stat label="Cash / Card" value={split} />
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat} accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xxl,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroLabel: {
    ...typography.eyebrow,
    fontSize: 11,
    color: colors.textMuted,
  },
  heroValue: {
    ...typography.displayLarge,
    marginTop: spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statLabel: {
    fontSize: 10.5,
    fontFamily: fonts.body,
    color: colors.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 15,
    fontFamily: fonts.numSemiBold,
    color: colors.text,
    fontVariant: ['tabular-nums'],
    marginTop: spacing.xs,
  },
});

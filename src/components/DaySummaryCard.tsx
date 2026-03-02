import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing, borderRadius } from '../constants/theme';
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
  return (
    <View style={styles.card} accessibilityRole="summary">
      <View style={styles.mainStat} accessibilityLabel={`${strings.summary.totalSales}: ${formatCurrency(totalSales, currency)}`}>
        <Text style={styles.mainLabel}>{strings.summary.totalSales}</Text>
        <Text style={styles.mainValue}>
          {formatCurrency(totalSales, currency)}
        </Text>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.stat} accessibilityLabel={`${strings.summary.transactions}: ${transactionCount}`}>
          <Text style={styles.statValue}>{transactionCount}</Text>
          <Text style={styles.statLabel}>{strings.summary.transactions}</Text>
        </View>
        <View style={styles.stat} accessibilityLabel={`${strings.summary.cashTotal}: ${formatCurrency(cashTotal, currency)}`}>
          <Text style={styles.statValue}>
            {formatCurrency(cashTotal, currency)}
          </Text>
          <Text style={styles.statLabel}>{strings.summary.cashTotal}</Text>
        </View>
        <View style={styles.stat} accessibilityLabel={`${strings.summary.cardTotal}: ${formatCurrency(cardTotal, currency)}`}>
          <Text style={styles.statValue}>
            {formatCurrency(cardTotal, currency)}
          </Text>
          <Text style={styles.statLabel}>{strings.summary.cardTotal}</Text>
        </View>
        <View style={styles.stat} accessibilityLabel={`${strings.summary.average}: ${formatCurrency(averageValue, currency)}`}>
          <Text style={styles.statValue}>
            {formatCurrency(averageValue, currency)}
          </Text>
          <Text style={styles.statLabel}>{strings.summary.average}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  mainStat: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  mainLabel: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  mainValue: {
    ...typography.total,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  stat: {
    width: '50%',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  statValue: {
    ...typography.statNumber,
  },
  statLabel: {
    ...typography.caption,
    marginTop: 2,
  },
});

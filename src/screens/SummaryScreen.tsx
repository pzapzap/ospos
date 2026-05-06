import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  Share,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, typography, spacing, borderRadius, touchTargets } from '../constants/theme';
import { strings } from '../constants/strings';
import { formatCurrency, getCurrencySymbol } from '../utils/currency';
import { useApp } from '../state/AppContext';
import {
  getStatsForDateRange,
  getOrdersForDateRange,
  type Order,
} from '../db/queries';
import { shareCSV, generateTextSummary } from '../utils/export';
import DaySummaryCard from '../components/DaySummaryCard';
import Button from '../components/Button';

function formatDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return formatDateStr(d);
}

const DATE_RANGE_OPTIONS = [
  { label: 'Today', days: 0 },
  { label: 'Yesterday', days: -1 },
  { label: 'Last 7 Days', days: -7 },
  { label: 'Last 30 Days', days: -30 },
];

type SummaryStackParamList = {
  SummaryMain: undefined;
  TransactionDetail: { orderId: string };
};

export default function SummaryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SummaryStackParamList>>();
  const { settings } = useApp();
  const [stats, setStats] = useState({
    totalSales: 0,
    transactionCount: 0,
    cashTotal: 0,
    cardTotal: 0,
    averageValue: 0,
  });
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedRange, setSelectedRange] = useState(0); // index into DATE_RANGE_OPTIONS
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const isPaidTier = settings.tier === 'paid';
  const today = formatDateStr(new Date());

  const getDateRange = useCallback((): { start: string; end: string; label: string } => {
    if (!isPaidTier || selectedRange === 0) {
      return { start: today, end: today, label: 'Today' };
    }
    const option = DATE_RANGE_OPTIONS[selectedRange];
    if (option.days === -1) {
      const yesterday = addDays(today, -1);
      return { start: yesterday, end: yesterday, label: 'Yesterday' };
    }
    const start = addDays(today, option.days);
    return { start, end: today, label: option.label };
  }, [isPaidTier, selectedRange, today]);

  const loadData = useCallback(async () => {
    setDataLoading(true);
    try {
      const range = getDateRange();
      const [rangeStats, rangeOrders] = await Promise.all([
        getStatsForDateRange(range.start, range.end),
        getOrdersForDateRange(range.start, range.end),
      ]);
      setStats(rangeStats);
      setOrders(rangeOrders);
    } catch (e) {
      if (__DEV__) console.warn('[SummaryScreen] Failed to load data:', e);
      Alert.alert('Load Failed', 'Could not load sales data. Pull down to retry.');
    } finally {
      setDataLoading(false);
    }
  }, [getDateRange]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleShare = useCallback(async () => {
    try {
      const range = getDateRange();
      const text = generateTextSummary(
        range.start === range.end ? range.start : `${range.start} to ${range.end}`,
        stats.totalSales,
        stats.transactionCount,
        stats.cashTotal,
        stats.cardTotal,
        stats.averageValue,
        getCurrencySymbol(settings.currency),
        settings.currency
      );
      await Share.share({ message: text });
    } catch {
      // Share cancelled or failed
    }
  }, [getDateRange, stats, settings.currency]);

  const handleExportCSV = useCallback(async () => {
    setExporting(true);
    try {
      const range = getDateRange();
      await shareCSV(range.start, range.end !== range.start ? range.end : undefined, settings.currency);
    } catch {
      Alert.alert(strings.errors.generic);
    } finally {
      setExporting(false);
    }
  }, [getDateRange, settings.currency]);

  const range = getDateRange();
  const dateLabel = range.start === range.end
    ? range.start === today
      ? 'Today'
      : range.start
    : `${range.start} — ${range.end}`;

  const renderOrder = useCallback(({ item }: { item: Order }) => {
    const time = new Date(item.created_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    const date = formatDateStr(new Date(item.created_at));
    const showDate = range.start !== range.end;

    return (
      <TouchableOpacity
        style={styles.orderRow}
        onPress={() => navigation.navigate('TransactionDetail', { orderId: item.id })}
        activeOpacity={0.7}
        accessibilityLabel={`${item.payment_method === 'cash' ? 'Cash' : 'Card'} transaction, ${formatCurrency(item.total, settings.currency)}, ${showDate ? `${date} ${time}` : time}`}
        accessibilityRole="button"
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.orderTime}>
            {showDate ? `${date} ${time}` : time}
          </Text>
        </View>
        <Text style={styles.orderTotal}>
          {formatCurrency(item.total, settings.currency)}
        </Text>
        <Text style={styles.orderMethod}>
          {item.payment_method === 'cash'
            ? 'Cash'
            : item.card_last4
              ? `${item.card_brand ?? ''} ••••${item.card_last4}`.trim()
              : 'Card'}
        </Text>
      </TouchableOpacity>
    );
  }, [range.start, range.end, navigation, settings.currency]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {settings.testMode === 'on'
            ? 'Test Mode Total (not real revenue)'
            : strings.summary.today}
        </Text>
        <TouchableOpacity
          onPress={isPaidTier ? () => setShowDatePicker(true) : undefined}
          disabled={!isPaidTier}
        >
          <Text style={[styles.date, isPaidTier && styles.dateClickable]}>
            {dateLabel}{isPaidTier ? ' ▼' : ''}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={renderOrder}
        contentContainerStyle={styles.list}
        refreshing={dataLoading}
        onRefresh={loadData}
        ListHeaderComponent={
          <DaySummaryCard
            totalSales={stats.totalSales}
            transactionCount={stats.transactionCount}
            cashTotal={stats.cashTotal}
            cardTotal={stats.cardTotal}
            averageValue={stats.averageValue}
            currency={settings.currency}
          />
        }
        ListEmptyComponent={
          dataLoading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xxxl }} />
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={56} color={colors.primary} style={{ marginBottom: spacing.md }} />
              <Text style={styles.emptyText}>{strings.summary.noTransactions}</Text>
            </View>
          )
        }
      />

      <View style={styles.footer}>
        <View style={{ flex: 1 }}>
          <Button label={strings.summary.share} variant="ghost" size="md" onPress={handleShare} />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label={exporting ? '…' : strings.summary.exportCsv}
            variant="primary"
            size="md"
            onPress={handleExportCSV}
            disabled={exporting}
          />
        </View>
      </View>

      {/* Date Range Picker Modal (paid tier) */}
      <Modal visible={showDatePicker} animationType="slide" transparent>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowDatePicker(false)}
        >
          <View style={styles.modal} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Select Date Range</Text>
            {DATE_RANGE_OPTIONS.map((option, index) => (
              <TouchableOpacity
                key={option.label}
                style={[
                  styles.dateOption,
                  selectedRange === index && styles.dateOptionSelected,
                ]}
                onPress={() => {
                  setSelectedRange(index);
                  setShowDatePicker(false);
                }}
              >
                <Text
                  style={[
                    styles.dateOptionText,
                    selectedRange === index && styles.dateOptionTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setShowDatePicker(false)}
            >
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  title: {
    ...typography.title1,
  },
  date: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  dateClickable: {
    color: colors.primary,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  orderRow: {
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  orderTime: {
    ...typography.eyebrow,
    fontSize: 12,
  },
  orderTotal: {
    ...typography.priceMuted,
    marginRight: spacing.md,
  },
  orderMethod: {
    ...typography.eyebrow,
    fontSize: 11,
    width: 110,
    textAlign: 'right',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.xxxl,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  shareButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: touchTargets.minimum,
    justifyContent: 'center',
  },
  shareButtonText: {
    ...typography.bodyBold,
    color: colors.text,
  },
  exportButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    minHeight: touchTargets.minimum,
    justifyContent: 'center',
  },
  exportButtonText: {
    ...typography.bodyBold,
    color: colors.black,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xxl,
  },
  modalTitle: {
    ...typography.title2,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  dateOption: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.xs,
  },
  dateOptionSelected: {
    backgroundColor: colors.cardHighlight,
  },
  dateOptionText: {
    ...typography.body,
  },
  dateOptionTextSelected: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  modalClose: {
    marginTop: spacing.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    backgroundColor: colors.cardHighlight,
    borderRadius: borderRadius.md,
  },
  modalCloseText: {
    ...typography.bodyBold,
    color: colors.textSecondary,
  },
});

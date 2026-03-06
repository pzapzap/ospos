import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius, touchTargets } from '../constants/theme';
import { strings } from '../constants/strings';
import { formatCurrency } from '../utils/currency';
import type { OrderLineItem } from '../state/reducers';

interface OrderPanelProps {
  items: OrderLineItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: string;
  onIncrement: (itemId: string) => void;
  onDecrement: (itemId: string) => void;
  onRemove: (itemId: string) => void;
}

export default function OrderPanel({
  items,
  subtotal,
  taxAmount,
  total,
  currency,
  onIncrement,
  onDecrement,
  onRemove,
}: OrderPanelProps) {
  const totalAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (total > 0) {
      Animated.sequence([
        Animated.timing(totalAnim, {
          toValue: 1.05,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(totalAnim, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [total, totalAnim]);

  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const itemYPositions = useRef<Record<string, number>>({});

  useEffect(() => {
    if (items.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [items.length]);

  useEffect(() => {
    if (expandedId && itemYPositions.current[expandedId] != null) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: itemYPositions.current[expandedId], animated: true });
      }, 100);
    }
  }, [expandedId]);

  return (
    <View style={styles.container}>
      <ScrollView ref={scrollRef} style={styles.itemsList} showsVerticalScrollIndicator={false}>
        {items.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={48} color={colors.textMuted} style={{ marginBottom: spacing.md }} />
            <Text style={styles.emptyText}>{strings.order.empty}</Text>
          </View>
        ) : (
          items.map((item) => (
            <View key={item.itemId} onLayout={(e) => { itemYPositions.current[item.itemId] = e.nativeEvent.layout.y; }}>
              <TouchableOpacity
                style={styles.lineItem}
                onPress={() =>
                  setExpandedId(expandedId === item.itemId ? null : item.itemId)
                }
                activeOpacity={0.7}
                accessibilityLabel={`${item.quantity} ${item.itemName}, tap to edit`}
                accessibilityRole="button"
              >
                <View style={styles.lineItemLeft}>
                  <Text style={styles.quantity}>{item.quantity}x</Text>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.itemName}
                  </Text>
                </View>
                <Text style={styles.lineTotal}>
                  {formatCurrency(item.itemPrice * item.quantity, currency)}
                </Text>
              </TouchableOpacity>

              {expandedId === item.itemId ? (
                <View style={styles.controls}>
                  <TouchableOpacity
                    style={styles.controlButton}
                    onPress={() => onDecrement(item.itemId)}
                    accessibilityLabel={`Decrease ${item.itemName} quantity`}
                    accessibilityRole="button"
                  >
                    <Text style={styles.controlText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.controlQty} accessibilityLabel={`Quantity ${item.quantity}`}>{item.quantity}</Text>
                  <TouchableOpacity
                    style={styles.controlButton}
                    onPress={() => onIncrement(item.itemId)}
                    accessibilityLabel={`Increase ${item.itemName} quantity`}
                    accessibilityRole="button"
                  >
                    <Text style={styles.controlText}>+</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.controlButton, styles.removeButton]}
                    onPress={() => onRemove(item.itemId)}
                    accessibilityLabel={`Remove ${item.itemName} from order`}
                    accessibilityRole="button"
                  >
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.totals}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{strings.order.subtotal}</Text>
          <Text style={styles.totalValue}>
            {formatCurrency(subtotal, currency)}
          </Text>
        </View>
        {taxAmount > 0 ? (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>{strings.order.tax}</Text>
            <Text style={styles.totalValue}>
              {formatCurrency(taxAmount, currency)}
            </Text>
          </View>
        ) : null}
        <View style={styles.totalRow}>
          <Text style={styles.grandTotalLabel}>{strings.order.total}</Text>
          <Animated.Text
            style={[
              styles.grandTotalValue,
              { transform: [{ scale: totalAnim }] },
            ]}
          >
            {formatCurrency(total, currency)}
          </Animated.Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    paddingTop: spacing.md,
  },
  itemsList: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
  lineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    minHeight: touchTargets.minimum,
  },
  lineItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  quantity: {
    ...typography.bodyBold,
    color: colors.primary,
    width: 32,
  },
  itemName: {
    ...typography.body,
    flex: 1,
  },
  lineTotal: {
    ...typography.priceMuted,
    marginLeft: spacing.md,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 32,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  controlButton: {
    backgroundColor: colors.cardHighlight,
    borderRadius: borderRadius.sm,
    width: touchTargets.minimum,
    height: touchTargets.minimum,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlText: {
    ...typography.bodyBold,
    fontSize: 20,
  },
  controlQty: {
    ...typography.bodyBold,
    width: 24,
    textAlign: 'center',
  },
  removeButton: {
    width: 'auto' as unknown as number,
    paddingHorizontal: spacing.md,
    marginLeft: spacing.sm,
  },
  removeText: {
    ...typography.caption,
    color: colors.danger,
  },
  totals: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  totalLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  totalValue: {
    ...typography.priceMuted,
  },
  grandTotalLabel: {
    ...typography.bodyBold,
    fontSize: 18,
  },
  grandTotalValue: {
    ...typography.statNumber,
  },
});

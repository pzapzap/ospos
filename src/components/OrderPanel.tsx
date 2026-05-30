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
import type { OrderLineItem, OrderDiscount } from '../state/reducers';
import Button from './Button';

interface OrderPanelProps {
  items: OrderLineItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: string;
  // Line index, not itemId — customized items can share itemId so we address
  // by position in the array.
  onIncrement: (lineIndex: number) => void;
  onDecrement: (lineIndex: number) => void;
  onRemove: (lineIndex: number) => void;
  // Optional: tap to re-open the customize sheet for a line. OrderScreen only
  // wires this for items that have at least one modifier group.
  onCustomize?: (lineIndex: number) => void;
  // Set of line indices for which the underlying item has modifier groups —
  // shows the Customize button on the expanded controls only when applicable.
  customizableLineIndices?: Set<number>;
  // Order-level discount; tap the row to open the discount modal.
  discount?: OrderDiscount | null;
  onDiscountTap?: () => void;
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
  onCustomize,
  customizableLineIndices,
  discount,
  onDiscountTap,
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

  const [expandedIndex, setExpandedIndex] = React.useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const itemYPositions = useRef<Record<number, number>>({});

  useEffect(() => {
    if (items.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [items.length]);

  useEffect(() => {
    if (expandedIndex !== null && itemYPositions.current[expandedIndex] != null) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: itemYPositions.current[expandedIndex], animated: true });
      }, 100);
    }
  }, [expandedIndex]);

  return (
    <View style={styles.container}>
      <ScrollView ref={scrollRef} style={styles.itemsList} showsVerticalScrollIndicator={false}>
        {items.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={48} color={colors.textMuted} style={{ marginBottom: spacing.md }} />
            <Text style={styles.emptyText}>{strings.order.empty}</Text>
          </View>
        ) : (
          items.map((item, index) => {
            const modAdjustment = item.modifiers.reduce((sum, m) => sum + m.price_cents, 0);
            const lineTotal = (item.itemPrice + modAdjustment) * item.quantity;
            return (
              <View key={index} onLayout={(e) => { itemYPositions.current[index] = e.nativeEvent.layout.y; }}>
                <TouchableOpacity
                  style={styles.lineItem}
                  onPress={() =>
                    setExpandedIndex(expandedIndex === index ? null : index)
                  }
                  activeOpacity={0.7}
                  accessibilityLabel={`${item.quantity} ${item.itemName}, tap to edit`}
                  accessibilityRole="button"
                >
                  <View style={styles.lineItemLeft}>
                    <Text style={styles.quantity}>{item.quantity}x</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {item.itemName}
                      </Text>
                      {item.modifiers.length > 0 ? (
                        <Text style={styles.modifierLine} numberOfLines={2}>
                          {item.modifiers.map((m) => m.name).join(' · ')}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <Text style={styles.lineTotal}>
                    {formatCurrency(lineTotal, currency)}
                  </Text>
                </TouchableOpacity>

                {expandedIndex === index ? (
                  <View style={styles.controls}>
                    <Button
                      label="−"
                      variant="ghost"
                      size="sm"
                      onPress={() => onDecrement(index)}
                      accessibilityLabel={`Decrease ${item.itemName} quantity`}
                    />
                    <Text style={styles.controlQty} accessibilityLabel={`Quantity ${item.quantity}`}>{item.quantity}</Text>
                    <Button
                      label="+"
                      variant="ghost"
                      size="sm"
                      onPress={() => onIncrement(index)}
                      accessibilityLabel={`Increase ${item.itemName} quantity`}
                    />
                    {onCustomize && customizableLineIndices?.has(index) ? (
                      <Button
                        label="Customize"
                        variant="ghost"
                        size="sm"
                        onPress={() => onCustomize(index)}
                        accessibilityLabel={`Customize ${item.itemName}`}
                      />
                    ) : null}
                    <View style={{ marginLeft: 'auto' }}>
                      <Button
                        label="Remove"
                        variant="destructive"
                        size="sm"
                        onPress={() => onRemove(index)}
                        accessibilityLabel={`Remove ${item.itemName} from order`}
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={styles.totals}>
        {/* Discount add affordance — only shows when cart has items and no
            discount applied. Once a discount is set, the totals block below
            shows the editable Discount row instead. */}
        {items.length > 0 && !discount && onDiscountTap ? (
          <TouchableOpacity
            style={styles.discountAddRow}
            onPress={onDiscountTap}
            accessibilityRole="button"
            accessibilityLabel="Add discount"
          >
            <Text style={styles.discountAddText}>+ Discount</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{strings.order.subtotal}</Text>
          <Text style={styles.totalValue}>
            {formatCurrency(subtotal, currency)}
          </Text>
        </View>

        {discount ? (
          <TouchableOpacity
            style={styles.totalRow}
            onPress={onDiscountTap}
            accessibilityRole="button"
            accessibilityLabel={`Discount, tap to edit. ${discount.type === 'percent' ? `${discount.value} percent off` : `${formatCurrency(discount.value, currency)} off`}${discount.reason ? `, ${discount.reason}` : ''}`}
          >
            <Text style={styles.discountLabel} numberOfLines={1}>
              Discount
              {discount.type === 'percent' ? ` · ${discount.value}% off` : null}
              {discount.reason ? ` · ${discount.reason}` : null}
            </Text>
            <Text style={styles.discountValue}>
              −{formatCurrency(discount.amount, currency)}
            </Text>
          </TouchableOpacity>
        ) : null}

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
  modifierLine: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
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
  controlQty: {
    ...typography.bodyBold,
    width: 32,
    textAlign: 'center',
  },
  totals: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  discountAddRow: {
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
  },
  discountAddText: {
    ...typography.body,
    color: colors.primary,
  },
  discountLabel: {
    ...typography.body,
    color: colors.primary,
    flex: 1,
    marginRight: spacing.sm,
  },
  discountValue: {
    ...typography.priceMuted,
    color: colors.primary,
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

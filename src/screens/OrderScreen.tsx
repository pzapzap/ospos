import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Text,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors, fonts, typography, spacing, borderRadius, touchTargets } from '../constants/theme';
import { strings } from '../constants/strings';
import { useApp } from '../state/AppContext';
import { getActiveItems, type Item } from '../db/queries';
import ItemButton from '../components/ItemButton';
import OrderPanel from '../components/OrderPanel';
import ChargeButton, { type ChargeButtonState } from '../components/ChargeButton';

interface OrderScreenProps {
  onCharge: () => void;
  onMenuEdit: () => void;
}

export default function OrderScreen({ onCharge, onMenuEdit }: OrderScreenProps) {
  const { order, orderDispatch, settings } = useApp();
  const [menuItems, setMenuItems] = useState<Item[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const navigatingRef = React.useRef(false);

  // Derive charge state — no need for separate state + effect
  const chargeState: ChargeButtonState = order.total > 0 ? 'ready' : 'disabled';

  const loadItems = useCallback(async () => {
    try {
      const items = await getActiveItems();
      setMenuItems(items);
    } catch (e) {
      if (__DEV__) console.warn('[OrderScreen] Failed to load items:', e);
    } finally {
      setMenuLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [loadItems])
  );

  const handleItemPress = useCallback((item: Item) => {
    orderDispatch({
      type: 'ADD_ITEM',
      payload: {
        itemId: item.id,
        itemName: item.name,
        itemPrice: item.price,
      },
    });
  }, [orderDispatch]);

  const handleClear = useCallback(() => {
    Alert.alert(
      'Clear Order',
      'Remove all items from the current order?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => orderDispatch({ type: 'CLEAR_ORDER' }) },
      ]
    );
  }, [orderDispatch]);

  const handleCharge = useCallback(() => {
    if (chargeState !== 'ready' || navigatingRef.current) return;
    navigatingRef.current = true;
    onCharge();
    // Reset after short delay to allow re-navigation if user comes back
    setTimeout(() => { navigatingRef.current = false; }, 1000);
  }, [chargeState, onCharge]);

  const renderItemButton = useCallback(({ item }: { item: Item }) => (
    <ItemButton
      name={item.name}
      price={item.price}
      currency={settings.currency}
      imageUri={item.image_uri}
      stickerId={item.sticker_id}
      onPress={() => handleItemPress(item)}
    />
  ), [settings.currency, handleItemPress]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Top 60%: Item Grid */}
      <View style={styles.gridSection}>
        <View style={styles.gridHeader}>
          <TouchableOpacity onPress={onMenuEdit} accessibilityLabel="Go to menu editor" accessibilityRole="button">
            <Text style={styles.editMenuLink}>{strings.order.editMenu}</Text>
          </TouchableOpacity>
          {order.items.length > 0 ? (
            <TouchableOpacity onPress={handleClear} accessibilityLabel="Clear all items from order" accessibilityRole="button">
              <Text style={styles.clearText}>{strings.order.clear}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <FlatList
          data={menuItems}
          keyExtractor={(item) => item.id}
          renderItem={renderItemButton}
          numColumns={3}
          contentContainerStyle={menuItems.length === 0 ? styles.gridEmpty : styles.grid}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            menuLoading ? (
              <ActivityIndicator size="large" color={colors.primary} />
            ) : (
              <View style={styles.emptyGrid}>
                <View style={styles.emptyHero}>
                  <Text style={styles.emptyHeroGlyph}>M</Text>
                </View>
                <Text style={styles.emptyGridTitle}>Your menu is empty</Text>
                <Text style={styles.emptyGridText}>Add items to start taking orders</Text>
                <TouchableOpacity onPress={onMenuEdit} style={styles.emptyGridButton}>
                  <Ionicons name="add-circle-outline" size={20} color={colors.black} />
                  <Text style={styles.emptyGridButtonText}>Edit Menu</Text>
                </TouchableOpacity>
              </View>
            )
          }
        />
      </View>

      {/* Bottom 40%: Order Panel — ALWAYS VISIBLE */}
      <View style={styles.panelSection}>
        <OrderPanel
          items={order.items}
          subtotal={order.subtotal}
          taxAmount={order.taxAmount}
          total={order.total}
          currency={settings.currency}
          onIncrement={(itemId) =>
            orderDispatch({ type: 'INCREMENT_ITEM', payload: { itemId } })
          }
          onDecrement={(itemId) =>
            orderDispatch({ type: 'DECREMENT_ITEM', payload: { itemId } })
          }
          onRemove={(itemId) =>
            orderDispatch({ type: 'REMOVE_ITEM', payload: { itemId } })
          }
        />
        <View style={styles.chargeContainer}>
          <ChargeButton
            state={chargeState}
            total={order.total}
            currency={settings.currency}
            onPress={handleCharge}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  gridSection: {
    flex: 6, // 60%
  },
  gridHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  editMenuLink: {
    ...typography.body,
    color: colors.primary,
  },
  clearText: {
    ...typography.body,
    color: colors.danger,
  },
  grid: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  gridEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyGrid: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyHero: {
    width: 140,
    height: 140,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyHeroGlyph: {
    fontFamily: fonts.bodyItalic,
    fontSize: 96,
    color: colors.primary,
    lineHeight: 100,
  },
  emptyGridTitle: {
    ...typography.title3,
    color: colors.text,
  },
  emptyGridText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  emptyGridButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  emptyGridButtonText: {
    ...typography.bodyBold,
    color: colors.black,
  },
  panelSection: {
    flex: 4, // 40%
  },
  chargeContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
  },
});

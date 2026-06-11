import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Text,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  LayoutAnimation,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { colors, fonts, typography, spacing, borderRadius, touchTargets } from '../constants/theme';
import { strings } from '../constants/strings';
import { useApp } from '../state/AppContext';
import { getOrderableItems, getModifiersForItem, type Item, type ModifierSnapshot } from '../db/queries';
import ItemButton from '../components/ItemButton';
import Button from '../components/Button';
import OrderPanel from '../components/OrderPanel';
import ChargeButton, { type ChargeButtonState } from '../components/ChargeButton';
import CustomizeItemModal from '../components/CustomizeItemModal';
import DiscountModal from '../components/DiscountModal';
import CategoryStrip, { UNCATEGORIZED } from '../components/CategoryStrip';

interface OrderScreenProps {
  onCharge: () => void;
  onMenuEdit: () => void;
}

export default function OrderScreen({ onCharge, onMenuEdit }: OrderScreenProps) {
  const { order, orderDispatch, settings } = useApp();
  const [menuItems, setMenuItems] = useState<Item[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  // Track which items have at least one modifier so we know whether tap should
  // route to CustomizeItemModal (immediate) or add-to-cart directly.
  const [itemsWithModifiers, setItemsWithModifiers] = useState<Set<string>>(new Set());
  const [customizingItem, setCustomizingItem] = useState<Item | null>(null);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  // QSR mode category filter. null = ALL ITEMS; UNCATEGORIZED for null-category items.
  // Only rendered when settings.qsrMode === 'on'.
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Cart panel grows as items are rung in, but never dominates. Empty cart
  // gives the menu 60% of the screen (the original 6:4 layout); each item
  // shifts the split slowly toward the cart. Capped at 6:4 so the menu
  // always retains AT LEAST 40% of the screen — enough for 2 rows of
  // sticker tiles + the category strip + the grid header. Beyond the cap
  // the cart scrolls internally.
  //
  // Tuning history:
  //   Original:  max 7, growth 0.5 — too aggressive, menu collapsed to 1 row.
  //   Attempt 1: max 5, growth 0.25 — over-corrected, cart starved at scale.
  //   Current:   max 6, growth 0.4  — splits the difference; ~2 rows at cap.
  const panelFlex = Math.min(6, 4 + order.items.length * 0.4);
  const gridFlex = 10 - panelFlex;

  // Animate the flex transition so the panel doesn't snap when an item is
  // added or removed. iOS Simulator + device both honor this without setup.
  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [order.items.length]);
  // Edit-from-cart context. When set, the customize sheet opens in edit mode
  // pre-filled with the line's current modifiers + quantity.
  const [editingLine, setEditingLine] = useState<{
    lineIndex: number;
    modifiers: ModifierSnapshot[];
    quantity: number;
  } | null>(null);
  const navigatingRef = React.useRef(false);

  // Derive charge state — no need for separate state + effect
  const chargeState: ChargeButtonState = order.total > 0 ? 'ready' : 'disabled';

  const loadItems = useCallback(async () => {
    try {
      const items = await getOrderableItems();
      setMenuItems(items);
      // Parallel-fetch modifier counts so tap routing is instant. Items with
      // 1+ active modifiers go in the set; others fall through to direct add.
      const counts = await Promise.all(
        items.map(async (it) => {
          const mods = await getModifiersForItem(it.id);
          return [it.id, mods.length > 0] as const;
        })
      );
      setItemsWithModifiers(new Set(counts.filter(([, has]) => has).map(([id]) => id)));
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

  // QSR mode is opt-in via Settings. When it's flipped off, drop any active
  // filter so the merchant doesn't carry a stale selection back into a
  // non-categorized flow next time they flip it on.
  const qsrEnabled = settings.qsrMode === 'on';
  useEffect(() => {
    if (!qsrEnabled && selectedCategory !== null) {
      setSelectedCategory(null);
    }
  }, [qsrEnabled, selectedCategory]);

  // Derive the category list from loaded items every time menuItems changes.
  // Free-form text → Set → sorted array. hasUncategorized flags whether any
  // item lacks a category (drives whether to render the trailing pill).
  const { categories, hasUncategorized } = useMemo(() => {
    const set = new Set<string>();
    let hasNull = false;
    for (const it of menuItems) {
      const c = it.category?.trim();
      if (c) set.add(c);
      else hasNull = true;
    }
    return { categories: Array.from(set).sort(), hasUncategorized: hasNull };
  }, [menuItems]);

  // Stale-selection guard: if the merchant renames or deletes the selected
  // category in Edit Menu, the previous string no longer exists in the
  // derived list. Drop to null silently.
  useEffect(() => {
    if (!selectedCategory || selectedCategory === UNCATEGORIZED) return;
    if (!categories.includes(selectedCategory)) {
      setSelectedCategory(null);
    }
  }, [categories, selectedCategory]);

  // Filtered grid data. When QSR mode is off, never filter — always show all.
  const filteredItems = useMemo(() => {
    if (!qsrEnabled || !selectedCategory) return menuItems;
    if (selectedCategory === UNCATEGORIZED) {
      return menuItems.filter((i) => !i.category?.trim());
    }
    return menuItems.filter((i) => i.category?.trim() === selectedCategory);
  }, [menuItems, selectedCategory, qsrEnabled]);

  const handleItemPress = useCallback((item: Item) => {
    // Items with modifiers route to the customize sheet first; everything
    // else adds straight to the cart for fast tapping.
    //
    // No auto-scroll on add. Attempts to keep the tapped tile in view
    // fought the user's spatial expectation: tapping a visible tile
    // would silently reposition the grid (e.g. scroll the top item
    // down to expose empty space above it). The panelFlex cap of 6:4
    // already guarantees the menu retains 2 rows of tiles, so the
    // tapped tile stays visible naturally. If a merchant has scrolled
    // deep into a long menu and adds a tile near the bottom edge, they
    // can scroll manually — that's the same interaction Square / Toast
    // expose, and it doesn't fight the user.
    if (itemsWithModifiers.has(item.id)) {
      setCustomizingItem(item);
      return;
    }
    orderDispatch({
      type: 'ADD_ITEM',
      payload: {
        itemId: item.id,
        itemName: item.name,
        itemPrice: item.price,
        isTaxable: item.is_taxable === 1,
      },
    });
  }, [orderDispatch, itemsWithModifiers]);

  const handleCustomizeAdd = useCallback((selectedModifiers: ModifierSnapshot[], quantity: number) => {
    if (!customizingItem) return;
    orderDispatch({
      type: 'ADD_ITEM',
      payload: {
        itemId: customizingItem.id,
        itemName: customizingItem.name,
        itemPrice: customizingItem.price,
        modifiers: selectedModifiers,
        quantity,
        isTaxable: customizingItem.is_taxable === 1,
      },
    });
    setCustomizingItem(null);
    setEditingLine(null);
  }, [customizingItem, orderDispatch]);

  const handleCustomizeUpdate = useCallback((lineIndex: number, modifiers: ModifierSnapshot[], quantity: number) => {
    orderDispatch({ type: 'UPDATE_LINE', payload: { lineIndex, modifiers, quantity } });
    setCustomizingItem(null);
    setEditingLine(null);
  }, [orderDispatch]);

  // Tap a cart line's "Customize" → reopen the sheet in edit mode pre-filled
  // with the current line's modifiers + quantity.
  const handleEditLine = useCallback((lineIndex: number) => {
    const line = order.items[lineIndex];
    if (!line) return;
    const itemRow = menuItems.find((it) => it.id === line.itemId);
    if (!itemRow) return;
    setEditingLine({ lineIndex, modifiers: line.modifiers, quantity: line.quantity });
    setCustomizingItem(itemRow);
  }, [order.items, menuItems]);

  // Cart-line indices whose underlying item still has at least one modifier
  // group — the "Customize" button only shows on these. Recomputed every
  // render but the set is tiny so this is cheap.
  const customizableLineIndices = useMemo(() => {
    const set = new Set<number>();
    order.items.forEach((line, idx) => {
      if (itemsWithModifiers.has(line.itemId)) set.add(idx);
    });
    return set;
  }, [order.items, itemsWithModifiers]);

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
      {/* Item grid — shrinks as the cart fills (see panelFlex calc above) */}
      <View style={[styles.gridSection, { flex: gridFlex }]}>
        <View style={styles.gridHeader}>
          <Button label={strings.order.editMenu} variant="ghost" size="sm" onPress={onMenuEdit} accessibilityLabel="Go to menu editor" />
          {order.items.length > 0 ? (
            <Button label={strings.order.clear} variant="destructive" size="sm" onPress={handleClear} accessibilityLabel="Clear all items from order" />
          ) : null}
        </View>
        {/* QSR-only: category strip + filter eyebrow. Only renders when the
            merchant has opted into QSR mode AND has at least one item with
            a category (so single-menu coffee shops who flip it on don't see
            an empty strip). */}
        {qsrEnabled && (categories.length > 0 || hasUncategorized) ? (
          <CategoryStrip
            categories={categories}
            selected={selectedCategory}
            hasUncategorized={hasUncategorized}
            onSelect={setSelectedCategory}
          />
        ) : null}
        <FlatList
          data={filteredItems}
          extraData={selectedCategory}
          keyExtractor={(item) => item.id}
          renderItem={renderItemButton}
          numColumns={3}
          contentContainerStyle={filteredItems.length === 0 ? styles.gridEmpty : styles.grid}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            menuLoading ? (
              <ActivityIndicator size="large" color={colors.primary} />
            ) : qsrEnabled && selectedCategory && menuItems.length > 0 ? (
              // Filtered-empty state: the merchant has a menu, but the
              // selected category has zero visible items (likely all 86'd
              // today). Use the first letter of the selected category as the
              // hero monogram — the one place reusing Bitter italic is
              // earned because it echoes the menu-tile fallback grammar.
              <View style={styles.emptyGrid}>
                <View style={styles.emptyHero}>
                  <Text style={styles.emptyHeroGlyph}>
                    {selectedCategory === UNCATEGORIZED
                      ? '·'
                      : (selectedCategory[0] ?? '·').toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.emptyGridTitle}>
                  {strings.categories.emptyFilterTitle(
                    selectedCategory === UNCATEGORIZED ? strings.categories.uncategorized : selectedCategory
                  )}
                </Text>
                <Text style={styles.emptyGridText}>{strings.categories.emptyFilterHint}</Text>
                <View style={{ marginTop: spacing.md, minWidth: 180 }}>
                  <Button
                    label={strings.categories.clearFilter}
                    variant="ghost"
                    size="md"
                    onPress={() => setSelectedCategory(null)}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.emptyGrid}>
                <View style={styles.emptyHero}>
                  <Text style={styles.emptyHeroGlyph}>M</Text>
                </View>
                <Text style={styles.emptyGridTitle}>Your menu is empty</Text>
                <Text style={styles.emptyGridText}>Add items to start taking orders</Text>
                <View style={{ marginTop: spacing.md, minWidth: 180 }}>
                  <Button label="Edit Menu" variant="primary" size="md" onPress={onMenuEdit} />
                </View>
              </View>
            )
          }
        />
      </View>

      {/* Cart panel — grows as items are added */}
      <View style={[styles.panelSection, { flex: panelFlex }]}>
        <OrderPanel
          items={order.items}
          subtotal={order.subtotal}
          taxAmount={order.taxAmount}
          total={order.total}
          currency={settings.currency}
          onIncrement={(lineIndex) =>
            orderDispatch({ type: 'INCREMENT_ITEM', payload: { lineIndex } })
          }
          onDecrement={(lineIndex) =>
            orderDispatch({ type: 'DECREMENT_ITEM', payload: { lineIndex } })
          }
          onRemove={(lineIndex) =>
            orderDispatch({ type: 'REMOVE_ITEM', payload: { lineIndex } })
          }
          onCustomize={handleEditLine}
          customizableLineIndices={customizableLineIndices}
          discount={order.discount}
          onDiscountTap={() => setShowDiscountModal(true)}
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

      {/* Order-level discount editor */}
      <DiscountModal
        visible={showDiscountModal}
        currency={settings.currency}
        subtotal={order.subtotal}
        existing={order.discount}
        onClose={() => setShowDiscountModal(false)}
        onSave={(data) => {
          orderDispatch({ type: 'SET_DISCOUNT', payload: data });
          setShowDiscountModal(false);
        }}
        onRemove={() => {
          orderDispatch({ type: 'CLEAR_DISCOUNT' });
          setShowDiscountModal(false);
        }}
      />

      {/* Customize sheet — opens for items with modifiers (add mode) and for
          cart-line edits (edit mode, pre-filled). */}
      <CustomizeItemModal
        visible={customizingItem !== null}
        item={customizingItem}
        currency={settings.currency}
        mode={editingLine ? 'edit' : 'add'}
        initialLineIndex={editingLine?.lineIndex}
        initialModifiers={editingLine?.modifiers}
        initialQuantity={editingLine?.quantity}
        onClose={() => {
          setCustomizingItem(null);
          setEditingLine(null);
        }}
        onAdd={handleCustomizeAdd}
        onUpdate={handleCustomizeUpdate}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  gridSection: {
    // flex value is set inline (varies with cart item count — see panelFlex /
    // gridFlex in the component body)
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
    // flex value is set inline (varies with cart item count)
  },
  chargeContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
  },
});

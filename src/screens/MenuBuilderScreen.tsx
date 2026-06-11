import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  Alert,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { useFocusEffect } from '@react-navigation/native';
import { colors, fonts, typography, spacing, borderRadius, touchTargets } from '../constants/theme';
import { strings } from '../constants/strings';
import { useApp } from '../state/AppContext';
import Button from '../components/Button';
import Sticker from '../components/Sticker';
import { formatCurrency } from '../utils/currency';
import { lightTap } from '../utils/haptics';
import {
  getActiveItems,
  createItem,
  updateItem,
  softDeleteItem,
  type Item,
} from '../db/queries';
import AddItemModal from '../components/AddItemModal';

interface MenuBuilderScreenProps {
  onStartSelling: () => void;
}

export default function MenuBuilderScreen({ onStartSelling }: MenuBuilderScreenProps) {
  const { settings } = useApp();
  const [items, setItems] = useState<Item[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  const loadItems = useCallback(async () => {
    try {
      const loaded = await getActiveItems();
      setItems(loaded);
    } catch {
      Alert.alert(strings.errors.generic);
    }
  }, []);

  // Re-fetch whenever this screen comes into focus, not just on mount.
  // Tabs in React Navigation stay mounted, so a one-shot useEffect would
  // miss new items added via Settings → Import while the Menu tab was
  // sitting in the background. useFocusEffect fires every focus, so
  // popping back to Menu after an import shows fresh data.
  useFocusEffect(
    useCallback(() => {
      loadItems();
    }, [loadItems])
  );

  const handleAddItem = () => {
    setEditingItem(null);
    setModalVisible(true);
  };

  const handleEditItem = (item: Item) => {
    setEditingItem(item);
    setModalVisible(true);
  };

  const handleSave = async (data: {
    name: string;
    price: number;
    category?: string;
    imageUri?: string;
    stickerId?: string;
    isTaxable: boolean;
    isAvailable: boolean;
  }) => {
    try {
      if (editingItem) {
        await updateItem(editingItem.id, {
          name: data.name,
          price: data.price,
          category: data.category ?? null,
          image_uri: data.imageUri ?? null,
          sticker_id: data.stickerId ?? null,
          is_taxable: data.isTaxable,
          is_available: data.isAvailable,
        });
      } else {
        await createItem(data.name, data.price, data.category, data.imageUri, data.stickerId, data.isTaxable, data.isAvailable);
      }
      setModalVisible(false);
      await loadItems();
    } catch {
      Alert.alert(strings.errors.generic);
    }
  };

  const handleDelete = async () => {
    if (!editingItem) return;
    Alert.alert(
      'Delete Item',
      `Remove "${editingItem.name}" from your menu?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await softDeleteItem(editingItem.id);
              setModalVisible(false);
              setEditingItem(null);
              await loadItems();
            } catch {
              Alert.alert(strings.errors.generic);
            }
          },
        },
      ]
    );
  };

  const handleSwipeDelete = async (itemId: string, itemName: string) => {
    Alert.alert(
      'Delete Item',
      `Remove "${itemName}" from your menu?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await softDeleteItem(itemId);
              await loadItems();
            } catch {
              Alert.alert(strings.errors.generic);
            }
          },
        },
      ]
    );
  };

  const renderRightActions = (itemId: string, itemName: string) => (
    <TouchableOpacity
      style={styles.swipeDelete}
      onPress={() => handleSwipeDelete(itemId, itemName)}
      accessibilityLabel={`Delete ${itemName}`}
      accessibilityRole="button"
    >
      <Text style={styles.swipeDeleteText}>{strings.menuBuilder.delete}</Text>
    </TouchableOpacity>
  );

  const renderItem = ({ item }: { item: Item }) => {
    const isSoldOut = item.is_available === 0;
    // Three-layer visual: photo → sticker → monogram glyph fallback.
    // Same resolution order as ItemButton on the order grid.
    const hasPhoto = !!item.image_uri;
    const hasSticker = !!item.sticker_id && item.sticker_id !== 'custom';
    return (
      <Swipeable renderRightActions={() => renderRightActions(item.id, item.name)}>
        <TouchableOpacity
          style={[styles.itemRow, isSoldOut && styles.itemRowSoldOut]}
          onPress={() => handleEditItem(item)}
          activeOpacity={0.7}
          accessibilityLabel={`${item.name}, ${formatCurrency(item.price, settings.currency)}${isSoldOut ? ', sold out today' : ''}. Tap to edit, swipe left to delete`}
          accessibilityRole="button"
        >
          {/* Thumb with chunky-card depth — same grammar as ItemButton on
              the order grid. A 2pt shadow strip peeks below the card,
              giving the tile visible weight against the row surface. */}
          <View style={[styles.itemThumbWrapper, isSoldOut && styles.itemThumbSoldOut]}>
            <View style={styles.itemThumbShadow} />
            <View style={styles.itemThumb}>
              {hasPhoto ? (
                <Image source={{ uri: item.image_uri! }} style={styles.itemThumbPhoto} resizeMode="cover" />
              ) : hasSticker ? (
                <Sticker id={item.sticker_id!} size={32} />
              ) : (
                <Text style={styles.itemThumbGlyph}>
                  {(item.name?.[0] ?? '·').toUpperCase()}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.itemTextColumn}>
            <Text style={[styles.itemName, isSoldOut && styles.itemNameSoldOut]}>{item.name}</Text>
            {isSoldOut ? (
              <Text style={styles.soldOutBadge}>SOLD OUT TODAY</Text>
            ) : null}
          </View>
          <Text style={[styles.itemPrice, isSoldOut && styles.itemPriceSoldOut]}>
            {formatCurrency(item.price, settings.currency)}
          </Text>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityLabel="Your Menu">{strings.menuBuilder.title}</Text>
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyHero}>
            <Text style={styles.emptyHeroGlyph}>M</Text>
          </View>
          <Text style={styles.emptyText}>{strings.menuBuilder.emptyState}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}

      <View style={styles.footer}>
        <Button
          label={strings.menuBuilder.addItem}
          variant="ghost"
          size="lg"
          onPress={handleAddItem}
        />

        {items.length > 0 ? (
          <Button
            label={strings.menuBuilder.startSelling}
            variant="primary"
            size="lg"
            onPress={onStartSelling}
          />
        ) : null}
      </View>

      <AddItemModal
        visible={modalVisible}
        onClose={() => {
          setModalVisible(false);
          setEditingItem(null);
        }}
        onSave={handleSave}
        onDelete={editingItem ? handleDelete : undefined}
        editItem={editingItem}
      />
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
    paddingBottom: spacing.lg,
  },
  title: {
    ...typography.title1,
  },
  list: {
    paddingHorizontal: spacing.lg,
  },
  itemRow: {
    backgroundColor: colors.surface,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: spacing.md,         // tighter left so thumb sits comfortably
    paddingRight: spacing.xl,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
    minHeight: touchTargets.minimum,
    gap: spacing.md,
  },
  itemRowSoldOut: {
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
  },
  // 44pt thumb with chunky-card depth. Wrapper matches card height so the
  // row's alignItems:'center' aligns the CARD's visual center (not the
  // wrapper's geometric center) with sibling text. Shadow strip peeks
  // visually 2pt below the wrapper — that overflow is intentional and
  // doesn't break layout because the row doesn't clip children.
  itemThumbWrapper: {
    width: 44,
    height: 44,
  },
  itemThumbShadow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 2,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.border,
  },
  itemThumb: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  itemThumbSoldOut: {
    opacity: 0.4,
  },
  itemThumbPhoto: {
    width: '100%',
    height: '100%',
  },
  itemThumbGlyph: {
    fontFamily: fonts.bodyItalic,
    fontSize: 28,
    color: colors.primary,
    lineHeight: 32,
  },
  // Match thumb height so the text container shares the thumb's vertical
  // span exactly. justifyContent centers the text inside; lineHeight tight to
  // fontSize means the glyph's visible center equals the container's center.
  itemTextColumn: {
    flex: 1,
    height: 44,
    justifyContent: 'center',
  },
  itemName: {
    ...typography.body,
    lineHeight: 17,
  },
  itemNameSoldOut: {
    color: colors.textMuted,
  },
  soldOutBadge: {
    ...typography.caption,
    color: colors.warning,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  // Price matches the name's 17pt so the two baselines line up visually;
  // emphasis comes from cyan + SemiBold weight, not size. Previously was
  // typography.price (20pt) which made the row look uneven.
  itemPrice: {
    fontSize: 17,
    fontFamily: fonts.numSemiBold,
    color: colors.primary,
    fontVariant: ['tabular-nums'],
    marginLeft: spacing.md,
  },
  itemPriceSoldOut: {
    color: colors.textMuted,
  },
  swipeDelete: {
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
  },
  swipeDeleteText: {
    ...typography.bodyBold,
    color: colors.white,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
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
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
});

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { colors, typography, spacing, borderRadius, touchTargets } from '../constants/theme';
import { strings } from '../constants/strings';
import { useApp } from '../state/AppContext';
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

  useEffect(() => {
    loadItems();
  }, [loadItems]);

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
  }) => {
    try {
      if (editingItem) {
        await updateItem(editingItem.id, {
          name: data.name,
          price: data.price,
          category: data.category ?? null,
          image_uri: data.imageUri ?? null,
        });
      } else {
        await createItem(data.name, data.price, data.category, data.imageUri);
      }
      setModalVisible(false);
      await loadItems();
    } catch {
      Alert.alert(strings.errors.generic);
    }
  };

  const handleDelete = async () => {
    if (!editingItem) return;
    try {
      await softDeleteItem(editingItem.id);
      setModalVisible(false);
      setEditingItem(null);
      await loadItems();
    } catch {
      Alert.alert(strings.errors.generic);
    }
  };

  const handleSwipeDelete = async (itemId: string) => {
    try {
      await softDeleteItem(itemId);
      await loadItems();
    } catch {
      Alert.alert(strings.errors.generic);
    }
  };

  const renderRightActions = (itemId: string) => (
    <TouchableOpacity
      style={styles.swipeDelete}
      onPress={() => handleSwipeDelete(itemId)}
    >
      <Text style={styles.swipeDeleteText}>{strings.menuBuilder.delete}</Text>
    </TouchableOpacity>
  );

  const renderItem = ({ item }: { item: Item }) => (
    <Swipeable renderRightActions={() => renderRightActions(item.id)}>
      <TouchableOpacity
        style={styles.itemRow}
        onPress={() => handleEditItem(item)}
        activeOpacity={0.7}
      >
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemPrice}>
          {formatCurrency(item.price, settings.currency)}
        </Text>
      </TouchableOpacity>
    </Swipeable>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityLabel="Your Menu">{strings.menuBuilder.title}</Text>
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="restaurant-outline" size={48} color={colors.textMuted} style={{ marginBottom: spacing.md }} />
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
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAddItem}
          activeOpacity={0.7}
        >
          <Text style={styles.addButtonText}>{strings.menuBuilder.addItem}</Text>
        </TouchableOpacity>

        {items.length > 0 ? (
          <TouchableOpacity
            style={styles.startButton}
            onPress={async () => {
              await lightTap();
              onStartSelling();
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.startButtonText}>
              {strings.menuBuilder.startSelling}
            </Text>
          </TouchableOpacity>
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
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
    minHeight: touchTargets.minimum,
  },
  itemName: {
    ...typography.body,
    flex: 1,
  },
  itemPrice: {
    ...typography.price,
    marginLeft: spacing.md,
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
  addButton: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    minHeight: touchTargets.minimum,
    justifyContent: 'center',
  },
  addButtonText: {
    ...typography.bodyBold,
    color: colors.primary,
  },
  startButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    minHeight: touchTargets.chargeButton,
    justifyContent: 'center',
  },
  startButtonText: {
    ...typography.bodyBold,
    color: colors.black,
    fontSize: 18,
  },
});

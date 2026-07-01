import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../constants/theme';
import { lightTap } from '../utils/haptics';
import Sticker from './Sticker';
import Button from './Button';
import { STICKERS, STICKERS_BY_CATEGORY, type StickerCategory } from '../assets/stickers';
import { STICKER_KEYWORDS } from '../assets/stickers/keywords';

// Full-screen browse-and-pick sticker library. Replaces the long inline
// "all categories stacked vertically" picker that used to live inside
// AddItemModal and ModifierEditModal. With 190+ stickers, the inline
// approach scrolled forever and made it hard to find anything.
//
// Layout:
//   Header:  [Cancel]        Choose a sticker        [Clear]
//   Search:  [ "search stickers..." 🔍 ]
//   Tabs:    [ Drinks ] [ Food ] [ Retail ] [ Service ]
//   Grid:    4-col grid of the active category (or search results when
//            the search input is non-empty — tabs hide in that case so
//            the result set is unambiguous).
//
// Tap a sticker = pick + close. Tap Clear = unset current + close.

interface StickerPickerModalProps {
  visible: boolean;
  currentStickerId: string | null;
  onClose: () => void;
  onSelect: (stickerId: string | null) => void;
}

const CATEGORIES: { id: StickerCategory; label: string }[] = [
  { id: 'food', label: 'Food' },         // default tab — most-used for menu items
  { id: 'drinks', label: 'Drinks' },
  { id: 'retail', label: 'Retail' },
  { id: 'service', label: 'Service' },
];

export default function StickerPickerModal({
  visible,
  currentStickerId,
  onClose,
  onSelect,
}: StickerPickerModalProps) {
  const [activeCategory, setActiveCategory] = useState<StickerCategory>('food');
  const [searchQuery, setSearchQuery] = useState('');

  // When the modal opens, jump to the category containing the current
  // sticker (if any) so the merchant sees it pre-highlighted instead of
  // landing on Food by default and having to navigate.
  useEffect(() => {
    if (!visible) return;
    setSearchQuery('');
    if (currentStickerId) {
      const sticker = STICKERS.find((s) => s.id === currentStickerId);
      if (sticker) setActiveCategory(sticker.category);
    }
  }, [visible, currentStickerId]);

  // When search is empty, show the active category. When search has text,
  // hide the tab strip and show flat matching results across all categories.
  //
  // Matching: substring against the sticker's name (with underscores
  // normalized to spaces so "ice cream" matches "ice_cream"), the id, and
  // any hand-curated aliases in STICKER_KEYWORDS. Aliases cover common-
  // language menu terms that aren't substrings of the technical Unicode
  // name (e.g. "lettuce" → leafy_green, "pickle" → cucumber).
  const searchActive = searchQuery.trim().length > 0;
  const visibleStickers = useMemo(() => {
    if (searchActive) {
      const q = searchQuery.trim().toLowerCase();
      return STICKERS.filter((s) => {
        const normalizedName = s.name.replace(/_/g, ' ');
        if (normalizedName.includes(q) || s.name.includes(q) || s.id.includes(q)) return true;
        const aliases = STICKER_KEYWORDS[s.id];
        return aliases?.some((k) => k.toLowerCase().includes(q)) ?? false;
      });
    }
    return STICKERS_BY_CATEGORY[activeCategory];
  }, [searchActive, searchQuery, activeCategory]);

  const handlePick = async (id: string) => {
    await lightTap();
    onSelect(id);
  };

  const handleClear = async () => {
    await lightTap();
    onSelect(null);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header row */}
          <View style={styles.headerRow}>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.headerSide}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Choose a sticker</Text>
            {currentStickerId ? (
              <TouchableOpacity
                onPress={handleClear}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel="Clear current sticker"
              >
                <Text style={[styles.headerSide, { color: colors.danger }]}>Clear</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 50 }} />
            )}
          </View>

          {/* Search input */}
          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search stickers"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search stickers"
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Clear search"
              >
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Tab strip — hidden when searching. Plain flex row (not a
              horizontal ScrollView) because 4 tabs always fit; ScrollView
              was stretching vertically because of sibling-flex distribution
              with the grid below. */}
          {!searchActive ? (
            <View style={styles.tabStrip}>
              {CATEGORIES.map((c) => {
                const isActive = c.id === activeCategory;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.tab, isActive && styles.tabActive]}
                    onPress={() => {
                      lightTap();
                      setActiveCategory(c.id);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                  >
                    <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          {/* Sticker grid */}
          <ScrollView
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.grid}>
              {visibleStickers.map((s) => {
                const isSelected = s.id === currentStickerId;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.cell, isSelected && styles.cellSelected]}
                    onPress={() => handlePick(s.id)}
                    accessibilityRole="button"
                    accessibilityLabel={s.name.replace(/_/g, ' ')}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Sticker id={s.id} size={48} />
                  </TouchableOpacity>
                );
              })}
              {visibleStickers.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>No stickers match &ldquo;{searchQuery}&rdquo;</Text>
                  <View style={{ marginTop: spacing.md, minWidth: 160 }}>
                    <Button label="Clear search" variant="ghost" size="md" onPress={() => setSearchQuery('')} />
                  </View>
                </View>
              ) : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const CELL_SIZE = 64;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  headerSide: {
    ...typography.body,
    color: colors.primary,
    minWidth: 50,
  },
  headerTitle: {
    ...typography.bodyBold,
    color: colors.text,
    textAlign: 'center',
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: spacing.xxl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  searchIcon: { marginRight: spacing.sm },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    paddingVertical: 0,
  },

  tabStrip: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  // Tab pill — mirrors CategoryStrip's maxChip grammar for consistency
  tab: {
    flex: 1,           // equal share of the row, no awkward right-of-tabs gap
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  tabText: { ...typography.caption, color: colors.text },
  tabTextActive: { color: colors.primary },

  gridContent: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxxl,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',  // centers each row + the orphan last row
    gap: spacing.sm,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },

  emptyState: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    paddingTop: spacing.xxxl,
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
});

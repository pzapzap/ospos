import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { colors, typography, spacing, borderRadius } from '../constants/theme';
import { strings } from '../constants/strings';
import { lightTap } from '../utils/haptics';

// Sentinel selection value for items whose category column is null.
// Distinct from null (which means "All items, no filter").
export const UNCATEGORIZED = '__uncategorized__';

// Horizontal pill strip for QSR mode — filters the order grid by category.
// Eyebrow above names the current mode transparently (ALL ITEMS / SHOWING ·
// COFFEE) so the cashier sees what's filtered without parsing pill state.
// Reuses the maxChip selection grammar from ModifierGroupEditModal verbatim
// so the strip reads as part of the design system, not bolted on.
interface CategoryStripProps {
  categories: string[];          // deduplicated, alphabetical
  selected: string | null;       // null = ALL ITEMS; UNCATEGORIZED constant for null-category items
  hasUncategorized: boolean;
  onSelect: (category: string | null) => void;
}

export default function CategoryStrip({
  categories,
  selected,
  hasUncategorized,
  onSelect,
}: CategoryStripProps) {
  // Tap a pill to filter; tap the active pill to clear (back to ALL ITEMS).
  const handleTap = async (value: string) => {
    await lightTap();
    onSelect(selected === value ? null : value);
  };

  const modeLabel = (() => {
    if (selected === null) return strings.categories.allItems;
    if (selected === UNCATEGORIZED) {
      return `${strings.categories.showingPrefix} · ${strings.categories.uncategorized}`;
    }
    return `${strings.categories.showingPrefix} · ${selected}`;
  })();

  return (
    <View style={styles.container}>
      <Text style={styles.modeLabel} numberOfLines={1}>
        {modeLabel}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
        keyboardShouldPersistTaps="handled"
      >
        {categories.map((cat) => {
          const isSelected = selected === cat;
          return (
            <TouchableOpacity
              key={cat}
              style={[styles.pill, isSelected && styles.pillSelected]}
              onPress={() => handleTap(cat)}
              accessibilityRole="button"
              accessibilityLabel={`${cat} category${isSelected ? ', selected' : ''}`}
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[styles.pillText, isSelected && styles.pillTextSelected]} numberOfLines={1}>
                {cat}
              </Text>
            </TouchableOpacity>
          );
        })}
        {hasUncategorized ? (
          <TouchableOpacity
            style={[styles.pill, selected === UNCATEGORIZED && styles.pillSelected]}
            onPress={() => handleTap(UNCATEGORIZED)}
            accessibilityRole="button"
            accessibilityLabel={`Uncategorized${selected === UNCATEGORIZED ? ', selected' : ''}`}
            accessibilityState={{ selected: selected === UNCATEGORIZED }}
          >
            <Text style={[styles.pillText, selected === UNCATEGORIZED && styles.pillTextSelected]}>
              {strings.categories.uncategorized}
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  modeLabel: {
    ...typography.eyebrow,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    paddingHorizontal: 2,
  },
  strip: {
    gap: spacing.xs,
  },
  // Pill style — verbatim from ModifierGroupEditModal.maxChip / .maxChipActive
  // so the strip lives inside the same Liquid Glass selection grammar as the
  // modifier rule chips, segmented controls, and customize tiles.
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pillSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  pillText: {
    ...typography.caption,
    color: colors.text,
  },
  pillTextSelected: {
    color: colors.primary,
  },
});

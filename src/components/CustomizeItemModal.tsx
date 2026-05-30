import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { colors, typography, spacing, borderRadius, fonts } from '../constants/theme';
import { formatCurrency } from '../utils/currency';
import { lightTap } from '../utils/haptics';
import { getGroupsForItem, getModifiersForItem } from '../db/queries';
import type { Item, Modifier, ModifierGroup, ModifierSnapshot } from '../db/queries';
import Sticker from './Sticker';
import Button from './Button';

// Order screen customization sheet — opens when the cashier taps a menu item
// that has 1+ modifier groups, OR when they tap an existing cart line with
// modifiers to edit it. Habit/Sweetgreen-style: hero, grouped tile grid with
// per-group rules, sticky footer with running total + quantity stepper +
// Add/Update CTA.
interface CustomizeItemModalProps {
  visible: boolean;
  item: Item | null;
  currency: string;
  onClose: () => void;
  // Add mode: append a new line. Edit mode: replace the line at lineIndex.
  mode?: 'add' | 'edit';
  initialLineIndex?: number;
  initialModifiers?: ModifierSnapshot[];
  initialQuantity?: number;
  /** Add mode: returns the customized item to append. */
  onAdd?: (selectedModifiers: ModifierSnapshot[], quantity: number) => void;
  /** Edit mode: returns the updated line to replace. */
  onUpdate?: (lineIndex: number, modifiers: ModifierSnapshot[], quantity: number) => void;
}

const MAX_QTY = 99;

export default function CustomizeItemModal({
  visible,
  item,
  currency,
  onClose,
  mode = 'add',
  initialLineIndex,
  initialModifiers,
  initialQuantity,
  onAdd,
  onUpdate,
}: CustomizeItemModalProps) {
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (!visible || !item) {
      setGroups([]);
      setModifiers([]);
      setSelectedIds(new Set());
      setQuantity(1);
      return;
    }
    setLoading(true);
    (async () => {
      const [gs, ms] = await Promise.all([
        getGroupsForItem(item.id),
        getModifiersForItem(item.id),
      ]);
      setGroups(gs);
      setModifiers(ms);

      if (mode === 'edit' && initialModifiers) {
        // Map snapshot names back to modifier IDs by matching on (group, name).
        // Snapshots only carry name + price_cents (+ optional group_name), so
        // we re-resolve to live modifier rows for selection state.
        const matched = new Set<string>();
        for (const snap of initialModifiers) {
          const m = ms.find((mm) => mm.name === snap.name && (!snap.group_name || mm.group_name === snap.group_name));
          if (m) matched.add(m.id);
        }
        setSelectedIds(matched);
        setQuantity(Math.max(1, Math.min(initialQuantity ?? 1, MAX_QTY)));
      } else {
        // Pre-select defaults on add. Editor enforces one default per
        // single-select group, but legacy data (from before the radio-swap
        // logic was added) may still contain duplicates. Defense in depth:
        // at runtime, keep only the first default per single-select group.
        const defaultIds = new Set<string>();
        const claimedSingleGroups = new Set<string>();
        for (const m of ms) {
          if (m.is_default !== 1) continue;
          const group = gs.find((g) => g.id === m.group_id);
          if (group?.select_type === 'single') {
            if (claimedSingleGroups.has(group.id)) continue;
            claimedSingleGroups.add(group.id);
          }
          defaultIds.add(m.id);
        }
        setSelectedIds(defaultIds);
        setQuantity(1);
      }
      setLoading(false);
    })().catch(() => {
      setGroups([]);
      setModifiers([]);
      setLoading(false);
    });
  }, [visible, item, mode, initialModifiers, initialQuantity]);

  // Group → its modifiers (ordered). Memoized for the render loop.
  const groupedMods = useMemo(() => {
    return groups.map((g) => ({
      group: g,
      mods: modifiers.filter((m) => m.group_id === g.id),
    })).filter((g) => g.mods.length > 0);  // hide empty groups in customer view
  }, [groups, modifiers]);

  // Per-group selected count — feeds rule enforcement + validation.
  const selectedByGroup = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of modifiers) {
      if (!m.group_id || !selectedIds.has(m.id)) continue;
      map.set(m.group_id, (map.get(m.group_id) ?? 0) + 1);
    }
    return map;
  }, [modifiers, selectedIds]);

  // Validation — required groups must have ≥1 (or ≥ min for explicit min).
  // Single-select groups implicitly cap at 1; multi enforces max_select at tap time.
  const unmetGroups = useMemo(() => {
    return groupedMods
      .filter(({ group }) => group.is_required === 1 && (selectedByGroup.get(group.id) ?? 0) === 0)
      .map(({ group }) => group.id);
  }, [groupedMods, selectedByGroup]);
  const isValid = unmetGroups.length === 0;

  const totalPrice = useMemo(() => {
    if (!item) return 0;
    let unit = item.price;
    for (const id of selectedIds) {
      const mod = modifiers.find((m) => m.id === id);
      if (mod) unit += mod.price_cents;
    }
    return unit * quantity;
  }, [item, modifiers, selectedIds, quantity]);

  const toggle = (m: Modifier) => {
    const group = groups.find((g) => g.id === m.group_id);
    if (!group) return;

    setSelectedIds((prev) => {
      const next = new Set(prev);
      const isCurrentlySelected = next.has(m.id);

      if (group.select_type === 'single') {
        // Radio: clear siblings in the same group, then select this one.
        // Allow deselect when not required (so customer can clear).
        for (const sibling of modifiers) {
          if (sibling.group_id === group.id) next.delete(sibling.id);
        }
        if (!isCurrentlySelected || group.is_required === 1) {
          next.add(m.id);
        }
      } else {
        // Multi: toggle, respecting max_select on add.
        if (isCurrentlySelected) {
          next.delete(m.id);
        } else {
          const currentCount = Array.from(next).filter((id) => {
            const mm = modifiers.find((x) => x.id === id);
            return mm?.group_id === group.id;
          }).length;
          if (group.max_select && currentCount >= group.max_select) {
            return prev; // at cap — ignore
          }
          next.add(m.id);
        }
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!item || !isValid) return;
    await lightTap();
    const snapshots: ModifierSnapshot[] = [];
    // Preserve group order in the snapshot so receipts/edit-mode resolution
    // keep things sensible.
    for (const { group, mods } of groupedMods) {
      for (const m of mods) {
        if (!selectedIds.has(m.id)) continue;
        snapshots.push({
          name: m.name,
          price_cents: m.price_cents,
          group_name: group.name,
        });
      }
    }
    if (mode === 'edit' && onUpdate && initialLineIndex != null) {
      onUpdate(initialLineIndex, snapshots, quantity);
    } else if (onAdd) {
      onAdd(snapshots, quantity);
    }
  };

  if (!item) return null;

  const groupRule = (g: ModifierGroup) => {
    if (g.select_type === 'single') {
      return g.is_required === 1 ? 'Required · Pick 1' : 'Optional · Pick 1';
    }
    const cap = g.max_select && g.max_select > 0 ? `up to ${g.max_select}` : 'any';
    return g.is_required === 1 ? `Required · Pick ${cap}` : `Optional · Pick ${cap}`;
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={styles.container}>
        <TouchableOpacity
          onPress={onClose}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.backText}>Cancel</Text>
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero — item visual, name, base price */}
          <View style={styles.hero}>
            <View style={styles.heroVisual}>
              {item.sticker_id && item.sticker_id !== 'custom' ? (
                <Sticker id={item.sticker_id} size={72} />
              ) : item.image_uri ? (
                <View style={styles.heroPhotoPlaceholder} />
              ) : (
                <Text style={styles.heroGlyph}>{item.name[0]?.toUpperCase() ?? '·'}</Text>
              )}
            </View>
            <Text style={styles.eyebrow}>
              {mode === 'edit' ? 'EDITING' : 'CUSTOMIZE YOUR'}
            </Text>
            <Text style={styles.heroTitle}>{item.name}</Text>
            <Text style={styles.heroBasePrice}>{formatCurrency(item.price, currency)}</Text>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
          ) : groupedMods.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                No customization options for this item.
              </Text>
            </View>
          ) : (
            groupedMods.map(({ group, mods }) => {
              const isUnmet = unmetGroups.includes(group.id);
              return (
                <View key={group.id} style={styles.groupSection}>
                  <View style={styles.groupHeaderRow}>
                    <Text style={styles.groupLabel}>{group.name.toUpperCase()}</Text>
                    <Text style={[styles.groupRule, isUnmet && styles.groupRuleUnmet]}>
                      {groupRule(group)}
                    </Text>
                  </View>
                  <View style={styles.modGrid}>
                    {mods.map((m) => {
                      const isSelected = selectedIds.has(m.id);
                      const atCap =
                        !isSelected &&
                        group.select_type === 'multi' &&
                        group.max_select != null &&
                        (selectedByGroup.get(group.id) ?? 0) >= group.max_select;
                      return (
                        <TouchableOpacity
                          key={m.id}
                          style={[
                            styles.modTile,
                            isSelected && styles.modTileSelected,
                            atCap && styles.modTileDisabled,
                          ]}
                          onPress={() => !atCap && toggle(m)}
                          disabled={atCap}
                          accessibilityRole="button"
                          accessibilityLabel={`${m.name}${m.price_cents > 0 ? `, plus ${formatCurrency(m.price_cents, currency)}` : ''}`}
                          accessibilityState={{ selected: isSelected, disabled: atCap }}
                        >
                          <View style={styles.modVisual}>
                            {m.sticker_id ? (
                              <Sticker id={m.sticker_id} size={40} />
                            ) : (
                              <Text style={styles.modGlyph}>{m.name[0]?.toUpperCase() ?? '·'}</Text>
                            )}
                            {isSelected ? (
                              <View style={styles.checkBadge}>
                                <Text style={styles.checkBadgeText}>✓</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.modName} numberOfLines={2}>{m.name}</Text>
                          <Text style={styles.modPrice}>
                            {m.price_cents > 0
                              ? `+${formatCurrency(m.price_cents, currency)}`
                              : m.price_cents < 0
                                ? formatCurrency(m.price_cents, currency)
                                : 'Free'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Sticky footer — quantity + total + CTA */}
        <View style={styles.footer}>
          <View style={styles.footerTopRow}>
            <View style={styles.qtyStepper}>
              <TouchableOpacity
                style={[styles.qtyButton, quantity <= 1 && styles.qtyButtonDisabled]}
                onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                accessibilityRole="button"
                accessibilityLabel="Decrease quantity"
              >
                <Text style={styles.qtyButtonText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.qtyValue} accessibilityLabel={`Quantity ${quantity}`}>
                {quantity}
              </Text>
              <TouchableOpacity
                style={[styles.qtyButton, quantity >= MAX_QTY && styles.qtyButtonDisabled]}
                onPress={() => setQuantity((q) => Math.min(MAX_QTY, q + 1))}
                disabled={quantity >= MAX_QTY}
                accessibilityRole="button"
                accessibilityLabel="Increase quantity"
              >
                <Text style={styles.qtyButtonText}>+</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.totalCol}>
              <Text style={styles.totalLabel}>Item total</Text>
              <Text style={styles.totalValue}>{formatCurrency(totalPrice, currency)}</Text>
            </View>
          </View>
          <Button
            label={mode === 'edit' ? 'Update order' : 'Add to order'}
            variant="primary"
            size="lg"
            onPress={handleSubmit}
            disabled={!isValid}
            accessibilityLabel={mode === 'edit' ? 'Update line' : `Add ${item.name} to order`}
          />
          {!isValid ? (
            <Text style={styles.validationHint}>
              Pick a required option above to continue.
            </Text>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backButton: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    alignSelf: 'flex-start',
  },
  backText: {
    ...typography.body,
    color: colors.primary,
  },
  scrollContent: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
    gap: spacing.sm,
  },
  heroVisual: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  heroPhotoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 16,
    backgroundColor: colors.surfaceLight,
  },
  heroGlyph: {
    fontFamily: fonts.bodyItalic,
    fontSize: 64,
    color: colors.primary,
    lineHeight: 72,
  },
  eyebrow: {
    ...typography.eyebrow,
    fontSize: 11,
    color: colors.textMuted,
  },
  heroTitle: {
    ...typography.displayMedium,
    textAlign: 'center',
  },
  heroBasePrice: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    fontVariant: ['tabular-nums'],
  },
  groupSection: {
    marginBottom: spacing.xl,
  },
  groupHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.sm,
    paddingHorizontal: 2,
  },
  groupLabel: {
    ...typography.eyebrow,
    fontSize: 11,
    color: colors.textMuted,
  },
  groupRule: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontSize: 10,
  },
  groupRuleUnmet: {
    color: colors.danger,
  },
  modGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  modTile: {
    flexBasis: '31.5%',
    flexGrow: 0,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    gap: spacing.xs,
  },
  modTileSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  modTileDisabled: {
    opacity: 0.35,
  },
  modVisual: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  modGlyph: {
    fontFamily: fonts.bodyItalic,
    fontSize: 32,
    color: colors.primary,
  },
  checkBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadgeText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.black,
    fontWeight: '700',
  },
  modName: {
    ...typography.caption,
    color: colors.text,
    textAlign: 'center',
    fontFamily: fonts.body,
  },
  modPrice: {
    fontSize: 12,
    fontFamily: fonts.numSemiBold,
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  emptyState: {
    paddingVertical: spacing.xxxl,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.textMuted,
  },
  footer: {
    padding: spacing.xxl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    gap: spacing.md,
  },
  footerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qtyStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  qtyButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyButtonDisabled: {
    opacity: 0.35,
  },
  qtyButtonText: {
    ...typography.title3,
    color: colors.primary,
  },
  qtyValue: {
    ...typography.bodyBold,
    fontVariant: ['tabular-nums'],
    minWidth: 32,
    textAlign: 'center',
    color: colors.text,
  },
  totalCol: {
    alignItems: 'flex-end',
  },
  totalLabel: {
    ...typography.eyebrow,
    fontSize: 10,
    color: colors.textMuted,
  },
  totalValue: {
    ...typography.displayMedium,
    fontSize: 28,
  },
  validationHint: {
    ...typography.caption,
    color: colors.danger,
    textAlign: 'center',
  },
});

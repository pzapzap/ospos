import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  SafeAreaView,
  Switch,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, fonts, typography, spacing, borderRadius, touchTargets } from '../constants/theme';
import { strings } from '../constants/strings';
import Button from './Button';
import Sticker from './Sticker';
import StickerPickerModal from './StickerPickerModal';
import { lightTap } from '../utils/haptics';
import { MAX_ITEM_NAME_LENGTH, MAX_CATEGORY_LENGTH } from '../utils/validation';
import {
  getModifiersForItem,
  getGroupsForItem,
  createModifier,
  updateModifier,
  softDeleteModifier,
  createGroup,
  updateGroup,
  softDeleteGroup,
  getDistinctCategories,
} from '../db/queries';
import type { Item, Modifier, ModifierGroup } from '../db/queries';
import ModifierEditModal from './ModifierEditModal';
import ModifierGroupEditModal from './ModifierGroupEditModal';
import { formatCurrency } from '../utils/currency';

interface AddItemModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: { name: string; price: number; category?: string; imageUri?: string; stickerId?: string; isTaxable: boolean; isAvailable: boolean }) => void;
  onDelete?: () => void;
  editItem?: Item | null;
}

export default function AddItemModal({
  visible,
  onClose,
  onSave,
  onDelete,
  editItem,
}: AddItemModalProps) {
  const [name, setName] = useState('');
  // Calculator-style entry: store cents directly, render formatted. Each digit
  // typed shifts the buffer left (00 → 01 → 15 → 1.50). 8-digit cap = $999,999.99.
  const [cents, setCents] = useState(0);
  const [category, setCategory] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [stickerId, setStickerId] = useState<string | null>(null);
  // Taxable defaults on — preserves pre-v11 behavior where every item was
  // taxed under the global rate. Merchants flip this off for packaged retail.
  const [isTaxable, setIsTaxable] = useState(true);
  // 86'd toggle. Default available; flip to false = "Sold out today",
  // hides item from order grid but keeps it in the editor.
  const [isAvailable, setIsAvailable] = useState(true);
  const [errors, setErrors] = useState<{ name?: string; price?: string }>({});
  // Existing categories pulled fresh each time the modal opens, so the
  // suggestion strip stays in sync if the merchant added items in another
  // session. The strip below the category input filters down to matches as
  // the user types.
  const [existingCategories, setExistingCategories] = useState<string[]>([]);
  // Modifiers — only loaded/shown for existing items. New items must save first
  // before adding modifiers (the modifier_groups + modifiers tables both need
  // an item_id FK that doesn't exist until the item is created).
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [editingGroup, setEditingGroup] = useState<ModifierGroup | null>(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  // Tracks which group the next modifier add/edit belongs to. Set when the
  // user taps "+ Add option" inside a group card or an existing mod row.
  const [activeGroup, setActiveGroup] = useState<ModifierGroup | null>(null);
  const [editingModifier, setEditingModifier] = useState<Modifier | null>(null);
  const [showModifierModal, setShowModifierModal] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);

  const priceDisplay = (cents / 100).toFixed(2);

  useEffect(() => {
    if (editItem) {
      setName(editItem.name);
      setCents(editItem.price);
      setCategory(editItem.category ?? '');
      setImageUri(editItem.image_uri);
      setStickerId(editItem.sticker_id);
      setIsTaxable(editItem.is_taxable === 1);
      setIsAvailable(editItem.is_available === 1);
    } else {
      setName('');
      setCents(0);
      setCategory('');
      setImageUri(null);
      setStickerId(null);
      setIsTaxable(true);
      setIsAvailable(true);
    }
    setErrors({});
  }, [editItem, visible]);

  // Load existing categories each time the modal becomes visible so the
  // suggestion strip stays current across sessions.
  useEffect(() => {
    if (!visible) return;
    getDistinctCategories().then(setExistingCategories).catch(() => {
      setExistingCategories([]);
    });
  }, [visible]);

  // Filter to matches that contain the typed substring but aren't already an
  // exact match (no point suggesting what the user already typed). Cap at 6
  // to keep the strip from running off-screen with large category lists.
  const categorySuggestions = (() => {
    const q = category.trim().toLowerCase();
    if (q.length === 0) return [];
    return existingCategories
      .filter((c) => c.toLowerCase().includes(q) && c.toLowerCase() !== q)
      .slice(0, 6);
  })();

  // Load groups + modifiers when editing an existing item. Re-fetch when any
  // child modal closes so the list reflects fresh adds/edits/deletes.
  useEffect(() => {
    if (!visible || !editItem) {
      setGroups([]);
      setModifiers([]);
      return;
    }
    if (showModifierModal || showGroupModal) return;
    (async () => {
      const [gs, ms] = await Promise.all([
        getGroupsForItem(editItem.id),
        getModifiersForItem(editItem.id),
      ]);
      setGroups(gs);
      setModifiers(ms);
    })().catch(() => {
      setGroups([]);
      setModifiers([]);
    });
  }, [editItem, visible, showModifierModal, showGroupModal]);

  const handleSaveGroup = async (data: {
    name: string;
    selectType: 'single' | 'multi';
    isRequired: boolean;
    maxSelect: number | null;
  }) => {
    if (!editItem) return;
    if (editingGroup) {
      await updateGroup(editingGroup.id, data);
    } else {
      await createGroup({ itemId: editItem.id, ...data });
    }
    setShowGroupModal(false);
    setEditingGroup(null);
  };

  const handleDeleteGroup = async () => {
    if (!editingGroup) return;
    await softDeleteGroup(editingGroup.id);
    setShowGroupModal(false);
    setEditingGroup(null);
  };

  const handleSaveModifier = async (data: { name: string; priceCents: number; stickerId?: string; isDefault: boolean; isAvailable: boolean }) => {
    if (!editItem || !activeGroup) return;

    // Single-select groups behave like radios — only one option can be the
    // pre-selected default. If the merchant marks a new one as default, any
    // sibling already flagged default gets auto-cleared (silent swap, no nag).
    if (data.isDefault && activeGroup.select_type === 'single') {
      const siblingsToClear = modifiers.filter(
        (m) =>
          m.group_id === activeGroup.id &&
          m.is_default === 1 &&
          m.id !== editingModifier?.id
      );
      for (const sibling of siblingsToClear) {
        await updateModifier(sibling.id, { isDefault: false });
      }
    }

    if (editingModifier) {
      await updateModifier(editingModifier.id, {
        name: data.name,
        priceCents: data.priceCents,
        groupId: activeGroup.id,
        groupName: activeGroup.name,
        stickerId: data.stickerId ?? null,
        isDefault: data.isDefault,
        isAvailable: data.isAvailable,
      });
    } else {
      const sortOrder = modifiers.filter((m) => m.group_id === activeGroup.id).length;
      await createModifier({
        itemId: editItem.id,
        groupId: activeGroup.id,
        name: data.name,
        priceCents: data.priceCents,
        groupName: activeGroup.name,
        stickerId: data.stickerId ?? null,
        isDefault: data.isDefault,
        isAvailable: data.isAvailable,
        sortOrder,
      });
    }
    setShowModifierModal(false);
    setEditingModifier(null);
    setActiveGroup(null);
  };

  const handleDeleteModifier = async () => {
    if (!editingModifier) return;
    await softDeleteModifier(editingModifier.id);
    setShowModifierModal(false);
    setEditingModifier(null);
    setActiveGroup(null);
  };

  // Group rule summary copy — drives the chip under the group title.
  const groupRuleChip = (g: ModifierGroup): string => {
    if (g.select_type === 'single') {
      return g.is_required === 1 ? 'Required · Pick 1' : 'Optional · Pick 1';
    }
    const cap = g.max_select && g.max_select > 0 ? `up to ${g.max_select}` : 'any';
    return g.is_required === 1 ? `Required · Pick ${cap}` : `Optional · Pick ${cap}`;
  };

  const handlePriceChange = (text: string) => {
    if (errors.price) setErrors((prev) => ({ ...prev, price: undefined }));
    if (text.length > priceDisplay.length) {
      const last = text[text.length - 1];
      if (/\d/.test(last)) {
        const next = cents * 10 + parseInt(last, 10);
        if (next <= 99999999) setCents(next);
      }
    } else if (text.length < priceDisplay.length) {
      setCents(Math.floor(cents / 10));
    }
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Photo Access Required', 'Please enable photo library access in Settings to add item images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const commitSave = async () => {
    await lightTap();
    onSave({
      name: name.trim(),
      price: cents,
      category: category.trim() || undefined,
      imageUri: imageUri ?? undefined,
      stickerId: stickerId ?? undefined,
      isTaxable,
      isAvailable,
    });
  };

  const handleSave = async () => {
    const newErrors: { name?: string; price?: string } = {};

    if (!name.trim()) {
      newErrors.name = strings.menuBuilder.nameRequired;
    }

    if (cents < 0) {
      newErrors.price = strings.menuBuilder.invalidPrice;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Hard warning for empty groups — they'd be invisible to customers but
    // visible in the editor, which is the worst kind of silent failure.
    // Offer to delete them; otherwise force the merchant back to fix.
    const emptyGroups = groups.filter(
      (g) => modifiers.filter((m) => m.group_id === g.id).length === 0
    );
    if (emptyGroups.length > 0) {
      const groupList = emptyGroups.map((g) => `“${g.name}”`).join(', ');
      const isMultiple = emptyGroups.length > 1;
      Alert.alert(
        isMultiple ? 'Empty groups won\'t show' : 'Empty group won\'t show',
        `${groupList} ${isMultiple ? 'have' : 'has'} no options yet — customers won't see ${isMultiple ? 'them' : 'it'} on the customize sheet.`,
        [
          { text: 'Cancel and add options', style: 'cancel' },
          {
            text: isMultiple ? 'Delete empty groups' : 'Delete empty group',
            style: 'destructive',
            onPress: async () => {
              for (const g of emptyGroups) {
                await softDeleteGroup(g.id);
              }
              await commitSave();
            },
          },
        ]
      );
      return;
    }

    await commitSave();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={styles.fullScreenContainer}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            onPress={onClose}
            style={styles.backButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Text style={styles.backText}>Cancel</Text>
          </TouchableOpacity>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>
              {editItem ? strings.menuBuilder.editItem : strings.menuBuilder.addItem}
            </Text>

            <View style={styles.field}>
              <Text style={styles.label}>{strings.menuBuilder.itemName}</Text>
              <TextInput
                testID="input-item-name"
                style={[styles.input, errors.name ? styles.inputError : null]}
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                }}
                placeholder={strings.menuBuilder.itemName}
                placeholderTextColor={colors.textMuted}
                autoFocus={!editItem}
                autoCapitalize="words"
                maxLength={MAX_ITEM_NAME_LENGTH}
              />
              {errors.name ? (
                <Text style={styles.errorText}>{errors.name}</Text>
              ) : null}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{strings.menuBuilder.itemPrice}</Text>
              <TextInput
                testID="input-item-price"
                style={[styles.input, errors.price ? styles.inputError : null]}
                value={priceDisplay}
                onChangeText={handlePriceChange}
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                selection={{ start: priceDisplay.length, end: priceDisplay.length }}
              />
              {errors.price ? (
                <Text style={styles.errorText}>{errors.price}</Text>
              ) : null}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{strings.menuBuilder.itemCategory}</Text>
              <TextInput
                style={styles.input}
                value={category}
                onChangeText={setCategory}
                placeholder={strings.menuBuilder.itemCategory}
                placeholderTextColor={colors.textMuted}
                autoCapitalize="words"
                maxLength={MAX_CATEGORY_LENGTH}
              />
              {categorySuggestions.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.suggestionStrip}
                  keyboardShouldPersistTaps="handled"
                >
                  {categorySuggestions.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={styles.suggestionChip}
                      onPress={() => setCategory(c)}
                      accessibilityRole="button"
                      accessibilityLabel={`Use ${c} as category`}
                    >
                      <Text style={styles.suggestionChipText}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : null}
            </View>

            {/* Taxable — drives whether this item contributes to the tax base
                at sale time. Defaults on. Common off case: packaged retail
                goods (bagged coffee beans, gift cards) in jurisdictions that
                tax prepared food but not packaged. */}
            <View style={[styles.field, styles.taxableRow]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Apply tax</Text>
                <Text style={styles.taxableHint}>
                  On for most items. Turn off for packaged retail, gift cards, or anything not subject to your tax rate.
                </Text>
              </View>
              <Switch
                value={isTaxable}
                onValueChange={setIsTaxable}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.surface}
                accessibilityLabel="Apply tax to this item"
              />
            </View>

            {/* Sold out today — hides from order grid, keeps in editor. */}
            <View style={[styles.field, styles.taxableRow]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Sold out today</Text>
                <Text style={styles.taxableHint}>
                  Hide from the order screen without deleting. Flip back on tomorrow.
                </Text>
              </View>
              <Switch
                value={!isAvailable}
                onValueChange={(v) => setIsAvailable(!v)}
                trackColor={{ false: colors.border, true: colors.warning }}
                thumbColor={colors.surface}
                accessibilityLabel="Mark as sold out today"
              />
            </View>

            {/* Live preview — shows the resolved visual */}
            <View style={styles.previewRow}>
              <Text style={styles.label}>Preview</Text>
              <View style={styles.previewCard}>
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={styles.previewPhoto} resizeMode="cover" />
                ) : stickerId && stickerId !== 'custom' ? (
                  <Sticker id={stickerId} size={56} />
                ) : (
                  <Text style={styles.previewGlyph}>
                    {(name?.[0] ?? '·').toUpperCase()}
                  </Text>
                )}
              </View>
            </View>

            <TouchableOpacity style={styles.photoButton} onPress={handlePickImage}>
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.photoPreview} />
              ) : (
                <Text style={styles.photoButtonText}>{strings.menuBuilder.itemPhoto}</Text>
              )}
            </TouchableOpacity>

            {/* Sticker picker trigger — opens StickerPickerModal where the
                merchant browses all 190+ stickers with search + category tabs.
                Inline tap row keeps AddItemModal compact (was ~200 rows before). */}
            <View style={styles.field}>
              <Text style={styles.label}>Sticker</Text>
              <TouchableOpacity
                style={styles.stickerTriggerRow}
                onPress={() => setShowStickerPicker(true)}
                accessibilityRole="button"
                accessibilityLabel={stickerId ? 'Change sticker' : 'Choose a sticker'}
              >
                <View style={styles.stickerTriggerThumb}>
                  {stickerId && stickerId !== 'custom' ? (
                    <Sticker id={stickerId} size={36} />
                  ) : (
                    <Text style={styles.stickerTriggerPlus}>+</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stickerTriggerLabel}>
                    {stickerId ? 'Sticker chosen' : 'Choose a sticker'}
                  </Text>
                  <Text style={styles.stickerTriggerHint}>
                    {stickerId
                      ? 'Tap to browse the library or change'
                      : 'Browse drinks, food, retail, service'}
                  </Text>
                </View>
                <Text style={styles.stickerTriggerChevron}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Modifier groups — only for existing items (FK requires item_id).
                Each group is a card with its own rules + option rows. */}
            {editItem ? (
              <View style={styles.field}>
                <View style={styles.modSectionHeader}>
                  <Text style={styles.label}>Modifier groups</Text>
                  <Button
                    label="+ Add group"
                    variant="ghost"
                    size="sm"
                    onPress={() => {
                      setEditingGroup(null);
                      setShowGroupModal(true);
                    }}
                  />
                </View>

                {groups.length === 0 ? (
                  <Text style={styles.modifierEmpty}>
                    No groups yet. Add a group like &ldquo;Size&rdquo;, &ldquo;Milk&rdquo;, or &ldquo;Extras&rdquo; — then put the options the customer can pick inside it.
                  </Text>
                ) : (
                  <View style={{ gap: spacing.md }}>
                    {groups.map((g) => {
                      const groupMods = modifiers.filter((m) => m.group_id === g.id);
                      const isEmpty = groupMods.length === 0;
                      return (
                        <View
                          key={g.id}
                          style={[styles.groupCard, isEmpty && styles.groupCardEmpty]}
                        >
                          <View style={styles.groupHeader}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.groupName}>{g.name}</Text>
                              <Text style={styles.groupRule}>{groupRuleChip(g)}</Text>
                            </View>
                            <TouchableOpacity
                              onPress={() => {
                                setEditingGroup(g);
                                setShowGroupModal(true);
                              }}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              accessibilityLabel={`Edit group ${g.name}`}
                            >
                              <Text style={styles.groupEditLink}>Edit</Text>
                            </TouchableOpacity>
                          </View>

                          {groupMods.length > 0 ? (
                            <View style={styles.modifierList}>
                              {groupMods.map((m) => (
                                <TouchableOpacity
                                  key={m.id}
                                  style={styles.modifierRow}
                                  onPress={() => {
                                    setActiveGroup(g);
                                    setEditingModifier(m);
                                    setShowModifierModal(true);
                                  }}
                                >
                                  <View style={styles.modifierThumb}>
                                    {m.sticker_id ? (
                                      <Sticker id={m.sticker_id} size={28} />
                                    ) : (
                                      <Text style={styles.modifierGlyph}>{m.name[0]?.toUpperCase() ?? '·'}</Text>
                                    )}
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <Text style={styles.modifierName}>{m.name}</Text>
                                    {m.is_default === 1 ? (
                                      <Text style={styles.modifierDefault}>Default</Text>
                                    ) : null}
                                  </View>
                                  <Text style={styles.modifierPrice}>
                                    {m.price_cents > 0
                                      ? `+${formatCurrency(m.price_cents, 'USD')}`
                                      : m.price_cents < 0
                                        ? formatCurrency(m.price_cents, 'USD')
                                        : 'Free'}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          ) : (
                            <Text style={styles.groupEmptyWarning}>
                              Add at least one option — customers won't see this group.
                            </Text>
                          )}

                          <View style={{ marginTop: spacing.sm }}>
                            <Button
                              label="+ Add option"
                              variant={isEmpty ? 'primary' : 'ghost'}
                              size="sm"
                              onPress={() => {
                                setActiveGroup(g);
                                setEditingModifier(null);
                                setShowModifierModal(true);
                              }}
                            />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            ) : null}

            <View style={styles.actions}>
              <View style={{ flex: 1 }}>
                <Button label={strings.menuBuilder.cancel} variant="ghost" size="md" onPress={onClose} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label={strings.menuBuilder.save} variant="primary" size="md" onPress={handleSave} />
              </View>
            </View>

            {editItem && onDelete ? (
              <View style={{ marginTop: spacing.md }}>
                <Button label={strings.menuBuilder.delete} variant="destructive" size="md" onPress={onDelete} />
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Nested group editor — opens over this modal */}
      <ModifierGroupEditModal
        visible={showGroupModal}
        editGroup={editingGroup}
        onClose={() => {
          setShowGroupModal(false);
          setEditingGroup(null);
        }}
        onSave={handleSaveGroup}
        onDelete={editingGroup ? handleDeleteGroup : undefined}
      />

      {/* Nested modifier (option) editor — opens over this modal */}
      <ModifierEditModal
        visible={showModifierModal}
        editModifier={editingModifier}
        groupName={activeGroup?.name ?? ''}
        groupSelectType={activeGroup?.select_type ?? 'multi'}
        onClose={() => {
          setShowModifierModal(false);
          setEditingModifier(null);
          setActiveGroup(null);
        }}
        onSave={handleSaveModifier}
        onDelete={editingModifier ? handleDeleteModifier : undefined}
      />

      {/* Sticker browse + pick — opens over this modal from the trigger row */}
      <StickerPickerModal
        visible={showStickerPicker}
        currentStickerId={stickerId}
        onClose={() => setShowStickerPicker(false)}
        onSelect={(id) => {
          setStickerId(id);
          // Picking a sticker overrides any uploaded photo (sticker always wins
          // visually); clear the photo so the resolver lands on the sticker.
          if (id && imageUri) setImageUri(null);
          setShowStickerPicker(false);
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxl,
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
  title: {
    ...typography.title1,
    marginBottom: spacing.xxl,
    textAlign: 'left',
  },
  field: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.caption,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputError: {
    borderColor: colors.danger,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    marginTop: spacing.xs,
  },
  suggestionStrip: {
    paddingTop: spacing.sm,
    paddingBottom: 2,
    gap: spacing.xs,
  },
  suggestionChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: spacing.xs,
  },
  suggestionChipText: {
    ...typography.caption,
    color: colors.primary,
  },
  photoButton: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.border,
    borderBottomWidth: 4,
    borderStyle: 'dashed',
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
    overflow: 'hidden',
  },
  photoButtonText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  photoPreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  modSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  groupCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    // 3pt amber rail communicates "this group is incomplete" — gets paired
    // with a hard Alert on save so the merchant can't ship empty groups.
    borderLeftWidth: 1,
  },
  taxableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  taxableHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  groupCardEmpty: {
    borderColor: colors.warning,
    borderLeftWidth: 3,
    backgroundColor: colors.warningLight,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  groupName: {
    ...typography.bodyBold,
    color: colors.text,
  },
  groupRule: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  groupEditLink: {
    ...typography.caption,
    color: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  groupEmpty: {
    ...typography.caption,
    color: colors.textMuted,
    paddingVertical: spacing.sm,
  },
  groupEmptyWarning: {
    ...typography.caption,
    color: colors.warning,
    paddingVertical: spacing.sm,
  },
  modifierList: {
    gap: spacing.xs,
  },
  modifierDefault: {
    ...typography.caption,
    color: colors.primary,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modifierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  modifierThumb: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modifierGlyph: {
    fontFamily: fonts.bodyItalic,
    fontSize: 22,
    color: colors.primary,
  },
  modifierName: {
    ...typography.body,
    color: colors.text,
  },
  modifierGroup: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  modifierPrice: {
    ...typography.priceMuted,
    color: colors.primary,
  },
  modifierEmpty: {
    ...typography.caption,
    color: colors.textMuted,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  previewRow: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  previewCard: {
    width: 96,
    height: 96,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  previewPhoto: {
    width: '100%',
    height: '100%',
  },
  previewGlyph: {
    fontFamily: fonts.bodyItalic,
    fontSize: 56,
    color: colors.primary,
    lineHeight: 60,
  },
  // Tap-to-open sticker trigger row — replaces the long inline picker
  // (now lives in StickerPickerModal).
  stickerTriggerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  stickerTriggerThumb: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerTriggerPlus: {
    fontFamily: fonts.num,
    fontSize: 30,
    color: colors.primary,
  },
  stickerTriggerLabel: {
    ...typography.body,
    color: colors.text,
  },
  stickerTriggerHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  stickerTriggerChevron: {
    ...typography.title3,
    color: colors.textMuted,
  },
});

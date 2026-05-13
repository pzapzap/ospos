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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors, fonts, typography, spacing, borderRadius, touchTargets } from '../constants/theme';
import { strings } from '../constants/strings';
import Button from './Button';
import Sticker from './Sticker';
import { STICKERS_BY_CATEGORY } from '../assets/stickers';
import { lightTap } from '../utils/haptics';
import { MAX_ITEM_NAME_LENGTH, MAX_CATEGORY_LENGTH } from '../utils/validation';
import type { Item } from '../db/queries';

interface AddItemModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: { name: string; price: number; category?: string; imageUri?: string; stickerId?: string }) => void;
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
  const [errors, setErrors] = useState<{ name?: string; price?: string }>({});

  const priceDisplay = (cents / 100).toFixed(2);

  useEffect(() => {
    if (editItem) {
      setName(editItem.name);
      setCents(editItem.price);
      setCategory(editItem.category ?? '');
      setImageUri(editItem.image_uri);
      setStickerId(editItem.sticker_id);
    } else {
      setName('');
      setCents(0);
      setCategory('');
      setImageUri(null);
      setStickerId(null);
    }
    setErrors({});
  }, [editItem, visible]);

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

  const handleSave = async () => {
    const newErrors: { name?: string; price?: string } = {};

    if (!name.trim()) {
      newErrors.name = strings.menuBuilder.nameRequired;
    }

    if (cents <= 0) {
      newErrors.price = strings.menuBuilder.invalidPrice;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    await lightTap();
    onSave({
      name: name.trim(),
      price: cents,
      category: category.trim() || undefined,
      imageUri: imageUri ?? undefined,
      stickerId: stickerId ?? undefined,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modal}>
          <ScrollView showsVerticalScrollIndicator={false}>
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
                maxLength={MAX_CATEGORY_LENGTH}
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

            {/* Sticker picker — falls through to glyph if 'custom' or none */}
            <View style={styles.field}>
              <Text style={styles.label}>Sticker</Text>
              {(['drinks', 'food', 'retail', 'service'] as const).map((cat) => (
                <View key={cat} style={styles.stickerCategory}>
                  <Text style={styles.stickerCategoryLabel}>{cat.toUpperCase()}</Text>
                  <View style={styles.stickerRow}>
                    {STICKERS_BY_CATEGORY[cat].map((s) => {
                      const isSelected = stickerId === s.id;
                      return (
                        <TouchableOpacity
                          key={s.id}
                          style={[styles.stickerCell, isSelected && styles.stickerCellSelected]}
                          onPress={() => {
                            setStickerId(isSelected ? null : s.id);
                            // If selecting a sticker, clear photo so sticker wins
                            if (!isSelected && imageUri) setImageUri(null);
                          }}
                        >
                          <Sticker id={s.id} size={32} />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
              {stickerId ? (
                <View style={styles.stickerClearRow}>
                  <Button label="Clear sticker" variant="ghost" size="sm" onPress={() => setStickerId(null)} />
                </View>
              ) : null}
            </View>

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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.xxl,
    maxHeight: '85%',
  },
  title: {
    ...typography.title2,
    marginBottom: spacing.xl,
    textAlign: 'center',
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
  stickerCategory: {
    marginBottom: spacing.md,
  },
  stickerCategoryLabel: {
    ...typography.eyebrow,
    fontSize: 10,
    marginBottom: spacing.xs,
  },
  stickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  stickerCell: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerCellSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  stickerClearRow: {
    marginTop: spacing.sm,
    alignItems: 'center',
  },
});

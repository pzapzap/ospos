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
import { colors, typography, spacing, borderRadius, touchTargets } from '../constants/theme';
import { strings } from '../constants/strings';
import { lightTap } from '../utils/haptics';
import { validatePrice, MAX_ITEM_NAME_LENGTH, MAX_CATEGORY_LENGTH } from '../utils/validation';
import type { Item } from '../db/queries';

interface AddItemModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: { name: string; price: number; category?: string; imageUri?: string }) => void;
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
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ name?: string; price?: string }>({});

  useEffect(() => {
    if (editItem) {
      setName(editItem.name);
      setPrice((editItem.price / 100).toFixed(2));
      setCategory(editItem.category ?? '');
      setImageUri(editItem.image_uri);
    } else {
      setName('');
      setPrice('');
      setCategory('');
      setImageUri(null);
    }
    setErrors({});
  }, [editItem, visible]);

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

    const priceResult = validatePrice(price);
    if (!priceResult.valid) {
      newErrors.price = priceResult.error ?? strings.menuBuilder.invalidPrice;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    await lightTap();
    onSave({
      name: name.trim(),
      price: priceResult.parsed,
      category: category.trim() || undefined,
      imageUri: imageUri ?? undefined,
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
                value={price}
                onChangeText={(text) => {
                  setPrice(text);
                  if (errors.price) setErrors((prev) => ({ ...prev, price: undefined }));
                }}
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
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

            <TouchableOpacity style={styles.photoButton} onPress={handlePickImage}>
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.photoPreview} />
              ) : (
                <Text style={styles.photoButtonText}>{strings.menuBuilder.itemPhoto}</Text>
              )}
            </TouchableOpacity>

            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelText}>{strings.menuBuilder.cancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveText}>{strings.menuBuilder.save}</Text>
              </TouchableOpacity>
            </View>

            {editItem && onDelete ? (
              <TouchableOpacity style={styles.deleteButton} onPress={onDelete}>
                <Text style={styles.deleteText}>{strings.menuBuilder.delete}</Text>
              </TouchableOpacity>
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
    borderWidth: 1,
    borderColor: colors.border,
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
  cancelButton: {
    flex: 1,
    backgroundColor: colors.cardHighlight,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    minHeight: touchTargets.minimum,
    justifyContent: 'center',
  },
  cancelText: {
    ...typography.bodyBold,
    color: colors.textSecondary,
  },
  saveButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    minHeight: touchTargets.minimum,
    justifyContent: 'center',
  },
  saveText: {
    ...typography.bodyBold,
    color: colors.black,
  },
  deleteButton: {
    marginTop: spacing.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    minHeight: touchTargets.minimum,
    justifyContent: 'center',
  },
  deleteText: {
    ...typography.bodyBold,
    color: colors.danger,
  },
});

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, borderRadius } from '../constants/theme';
import { SUPPORTED_CURRENCIES } from '../utils/currency';
import { strings } from '../constants/strings';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

type CurrencyItem = (typeof SUPPORTED_CURRENCIES)[number];

interface CurrencyPickerModalProps {
  visible: boolean;
  selectedCode: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}

export default function CurrencyPickerModal({
  visible,
  selectedCode,
  onSelect,
  onClose,
}: CurrencyPickerModalProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return SUPPORTED_CURRENCIES as unknown as CurrencyItem[];
    const q = search.trim().toLowerCase();
    return (SUPPORTED_CURRENCIES as unknown as CurrencyItem[]).filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.symbol.toLowerCase().includes(q),
    );
  }, [search]);

  const handleSelect = useCallback(
    (code: string) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      onSelect(code);
    },
    [onSelect],
  );

  const handleClose = () => {
    setSearch('');
    onClose();
  };

  const renderItem = useCallback(
    ({ item }: { item: CurrencyItem }) => {
      const selected = item.code === selectedCode;
      return (
        <TouchableOpacity
          style={[styles.row, selected && styles.rowSelected]}
          onPress={() => handleSelect(item.code)}
          activeOpacity={0.7}
        >
          <Text style={styles.flag}>{item.flag}</Text>
          <View style={styles.rowMiddle}>
            <Text style={[styles.code, selected && styles.codeSelected]}>{item.code}</Text>
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          </View>
          <View style={styles.rowRight}>
            <Text style={styles.symbol}>{item.symbol}</Text>
            {selected && (
              <Ionicons name="checkmark" size={20} color={colors.primary} style={styles.check} />
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [selectedCode, handleSelect],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{strings.settings.currency}</Text>

          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search currencies..."
              placeholderTextColor={colors.textMuted}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.code}
            renderItem={renderItem}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
          />

          <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
            <Text style={styles.closeButtonText}>{strings.menuBuilder.cancel}</Text>
          </TouchableOpacity>
        </View>
      </View>
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
    maxHeight: '80%',
  },
  modalTitle: {
    ...typography.title2,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 44,
    marginBottom: spacing.md,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    ...typography.body,
    flex: 1,
    color: colors.text,
    paddingVertical: 0,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
  },
  rowSelected: {
    backgroundColor: colors.primaryLight,
  },
  flag: {
    fontSize: 22,
    marginRight: spacing.md,
  },
  rowMiddle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  code: {
    ...typography.bodyBold,
    width: 44,
  },
  codeSelected: {
    color: colors.primary,
  },
  name: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
  },
  symbol: {
    ...typography.body,
    color: colors.textMuted,
  },
  check: {
    marginLeft: spacing.xs,
  },
  closeButton: {
    marginTop: spacing.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    backgroundColor: colors.cardHighlight,
    borderRadius: borderRadius.md,
  },
  closeButtonText: {
    ...typography.bodyBold,
    color: colors.textSecondary,
  },
});

import React, { useState, useEffect } from 'react';
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
  Alert,
  Switch,
} from 'react-native';

// Group-name suggestion chips — autofill the input, dismiss on first keystroke.
// Curated, not exhaustive. The merchant can still type anything custom.
const GROUP_NAME_SUGGESTIONS = [
  'Size',
  'Milk',
  'Temperature',
  'Sweetness',
  'Toppings',
  'Extras',
  'Sauce',
  'Style',
];
import { colors, typography, spacing, borderRadius } from '../constants/theme';
import { lightTap } from '../utils/haptics';
import Button from './Button';
import type { ModifierGroup } from '../db/queries';

// Edits the *rules* for a modifier group: name, single vs multi-select,
// required, and max selections (multi only). Modifiers themselves are edited
// in ModifierEditModal — this sheet just configures the bucket.
interface ModifierGroupEditModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: {
    name: string;
    selectType: 'single' | 'multi';
    isRequired: boolean;
    maxSelect: number | null;
  }) => void;
  onDelete?: () => void;
  editGroup?: ModifierGroup | null;
}

export default function ModifierGroupEditModal({
  visible,
  onClose,
  onSave,
  onDelete,
  editGroup,
}: ModifierGroupEditModalProps) {
  const [name, setName] = useState('');
  const [selectType, setSelectType] = useState<'single' | 'multi'>('multi');
  const [isRequired, setIsRequired] = useState(false);
  const [maxSelect, setMaxSelect] = useState<number | null>(null); // null = no limit
  const [errors, setErrors] = useState<{ name?: string }>({});
  // Suggestion strip is visible for new groups (until the user types) and
  // hidden when editing an existing group with a name.
  const [suggestionsVisible, setSuggestionsVisible] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (editGroup) {
      setName(editGroup.name);
      setSelectType(editGroup.select_type);
      setIsRequired(editGroup.is_required === 1);
      setMaxSelect(editGroup.max_select);
      setSuggestionsVisible(false);
    } else {
      setName('');
      setSelectType('multi');
      setIsRequired(false);
      setMaxSelect(null);
      setSuggestionsVisible(true);
    }
    setErrors({});
  }, [editGroup, visible]);

  const handleSave = async () => {
    if (!name.trim()) {
      setErrors({ name: 'Name is required' });
      return;
    }
    await lightTap();
    onSave({
      name: name.trim(),
      selectType,
      isRequired,
      // single-select implicitly caps at 1; we store null and infer from select_type
      maxSelect: selectType === 'multi' ? maxSelect : null,
    });
  };

  const handleDelete = () => {
    if (!onDelete) return;
    Alert.alert(
      'Delete group?',
      'All options in this group will be removed from the customize screen. Past orders that used them keep their record.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ]
    );
  };

  const ruleSummary = (() => {
    if (selectType === 'single') {
      return isRequired ? 'Pick 1 — required' : 'Pick 1 — optional';
    }
    const cap = maxSelect && maxSelect > 0 ? `up to ${maxSelect}` : 'any';
    return isRequired ? `Pick ${cap} — required` : `Pick ${cap} — optional`;
  })();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={styles.container}>
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
              {editGroup ? 'Edit group' : 'New group'}
            </Text>
            <Text style={styles.subtitle}>{ruleSummary}</Text>

            {/* Name */}
            <View style={styles.field}>
              <Text style={styles.label}>Group name</Text>
              <TextInput
                style={[styles.input, errors.name ? styles.inputError : null]}
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  // First keystroke after autofill (or any typing) hides the
                  // suggestion strip — chips are scaffolding, not nagging.
                  if (suggestionsVisible) setSuggestionsVisible(false);
                  if (errors.name) setErrors({});
                }}
                onFocus={() => {
                  // Re-surface chips if the name is still empty.
                  if (!name.trim()) setSuggestionsVisible(true);
                }}
                placeholder="Size, Milk, Extras, Toppings"
                placeholderTextColor={colors.textMuted}
                autoFocus={!editGroup}
                maxLength={30}
                autoCapitalize="words"
              />
              {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}
              {suggestionsVisible ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.suggestionStrip}
                  keyboardShouldPersistTaps="handled"
                >
                  {GROUP_NAME_SUGGESTIONS.map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={styles.suggestionChip}
                      onPress={() => {
                        setName(s);
                        setSuggestionsVisible(false);
                        if (errors.name) setErrors({});
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Use ${s} as group name`}
                    >
                      <Text style={styles.suggestionChipText}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : null}
            </View>

            {/* Selection type — segmented */}
            <View style={styles.field}>
              <Text style={styles.label}>Customer can pick</Text>
              <View style={styles.segmented}>
                <TouchableOpacity
                  style={[styles.segment, selectType === 'single' && styles.segmentActive]}
                  onPress={() => setSelectType('single')}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectType === 'single' }}
                >
                  <Text style={[styles.segmentText, selectType === 'single' && styles.segmentTextActive]}>
                    Only one
                  </Text>
                  <Text style={styles.segmentHint}>Size, milk, bread</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.segment, selectType === 'multi' && styles.segmentActive]}
                  onPress={() => setSelectType('multi')}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectType === 'multi' }}
                >
                  <Text style={[styles.segmentText, selectType === 'multi' && styles.segmentTextActive]}>
                    Any of these
                  </Text>
                  <Text style={styles.segmentHint}>Toppings, extras</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Required toggle */}
            <View style={[styles.field, styles.row]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Required</Text>
                <Text style={styles.hint}>
                  Customer must pick {selectType === 'single' ? 'one' : 'at least one'} before adding to order.
                </Text>
              </View>
              <Switch
                value={isRequired}
                onValueChange={setIsRequired}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.surface}
              />
            </View>

            {/* Max selections — only meaningful for multi */}
            {selectType === 'multi' ? (
              <View style={styles.field}>
                <Text style={styles.label}>Limit selections</Text>
                <View style={styles.maxRow}>
                  {[null, 1, 2, 3, 5].map((n) => {
                    const active = (maxSelect ?? null) === n;
                    return (
                      <TouchableOpacity
                        key={String(n)}
                        style={[styles.maxChip, active && styles.maxChipActive]}
                        onPress={() => setMaxSelect(n)}
                      >
                        <Text style={[styles.maxChipText, active && styles.maxChipTextActive]}>
                          {n === null ? 'No limit' : `Up to ${n}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Save / Cancel */}
            <View style={styles.actions}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" variant="ghost" size="md" onPress={onClose} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Save" variant="primary" size="md" onPress={handleSave} />
              </View>
            </View>

            {editGroup && onDelete ? (
              <View style={{ marginTop: spacing.md }}>
                <Button label="Delete group" variant="destructive" size="md" onPress={handleDelete} />
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scrollContent: {
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxxl,
  },
  backButton: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    alignSelf: 'flex-start',
  },
  backText: { ...typography.body, color: colors.primary },
  title: { ...typography.title1 },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.xs,
    marginBottom: spacing.xxl,
  },
  field: { marginBottom: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  label: {
    ...typography.caption,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputError: { borderColor: colors.danger },
  errorText: { ...typography.caption, color: colors.danger, marginTop: spacing.xs },
  hint: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },

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

  segmented: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  segment: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'flex-start',
  },
  segmentActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  segmentText: { ...typography.bodyBold, color: colors.text },
  segmentTextActive: { color: colors.primary },
  segmentHint: { ...typography.caption, color: colors.textMuted, marginTop: 2 },

  maxRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  maxChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  maxChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  maxChipText: { ...typography.caption, color: colors.text },
  maxChipTextActive: { color: colors.primary },

  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
});

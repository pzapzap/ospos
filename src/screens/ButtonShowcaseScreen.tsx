import React from 'react';
import { ScrollView, StyleSheet, Text, View, SafeAreaView, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../constants/theme';
import Button, { ButtonVariant, ButtonSize } from '../components/Button';

const VARIANTS: ButtonVariant[] = ['primary', 'cash', 'destructive', 'ghost'];
const SIZES: ButtonSize[] = ['lg', 'md', 'sm'];

interface Props {
  onBack: () => void;
}

export default function ButtonShowcaseScreen({ onBack }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={28} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Button Showcase</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {SIZES.map((size) => (
          <View key={size} style={styles.section}>
            <Text style={styles.sectionLabel}>SIZE · {size.toUpperCase()}</Text>
            {VARIANTS.map((variant) => (
              <View key={variant} style={styles.row}>
                <Button
                  label={`${variant} ${size}`}
                  variant={variant}
                  size={size}
                  onPress={() => Alert.alert(`${variant} ${size} pressed`)}
                />
              </View>
            ))}
            <View style={styles.row}>
              <Button
                label={`${size} disabled`}
                variant="primary"
                size={size}
                disabled
                onPress={() => {}}
              />
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    ...typography.title3,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.xxl,
  },
  section: {
    gap: spacing.md,
  },
  sectionLabel: {
    ...typography.eyebrow,
    marginBottom: spacing.sm,
  },
  row: {
    alignItems: 'flex-start',
  },
});

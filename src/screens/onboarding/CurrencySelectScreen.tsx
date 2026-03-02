import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, LayoutAnimation, UIManager, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import OnboardingScreen from '../../components/OnboardingScreen';
import { colors, typography, spacing, borderRadius } from '../../constants/theme';
import { strings } from '../../constants/strings';
import { useOnboarding } from '../../state/OnboardingContext';
import { lightTap } from '../../utils/haptics';
import { SUPPORTED_CURRENCIES } from '../../utils/currency';
import type { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

type Nav = NativeStackNavigationProp<OnboardingStackParamList, 'CurrencySelect'>;
type CurrencyItem = (typeof SUPPORTED_CURRENCIES)[number];

export default function CurrencySelectScreen() {
  const navigation = useNavigation<Nav>();
  const { state, dispatch } = useOnboarding();
  const listRef = useRef<FlatList<CurrencyItem>>(null);
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

  useEffect(() => {
    if (search) return; // don't auto-scroll when filtering
    const index = SUPPORTED_CURRENCIES.findIndex((c) => c.code === state.currency);
    if (index > 0) {
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index, animated: false, viewPosition: 0.3 });
      }, 100);
    }
  }, []);

  const handleContinue = useCallback(async () => {
    await lightTap();
    navigation.navigate('TaxRate');
  }, [navigation]);

  const handleSelect = useCallback(
    (code: string) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      dispatch({ type: 'SET_CURRENCY', payload: code });
    },
    [dispatch],
  );

  const renderItem = useCallback(
    ({ item }: { item: CurrencyItem }) => {
      const selected = item.code === state.currency;
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
    [state.currency, handleSelect],
  );

  return (
    <OnboardingScreen
      title={strings.onboarding.currencyTitle}
      subtitle={strings.onboarding.currencySubtitle}
      primaryLabel={strings.onboarding.continue}
      onPrimary={handleContinue}
      currentStep={1}
      totalSteps={5}
      onBack={() => navigation.goBack()}
    >
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
        ref={listRef}
        data={filtered}
        keyExtractor={(item) => item.code}
        renderItem={renderItem}
        style={styles.list}
        keyboardShouldPersistTaps="handled"
        onScrollToIndexFailed={() => {}}
      />
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    height: 44,
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
    marginTop: spacing.sm,
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
});

import React from 'react';
import { TextInput, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import OnboardingScreen from '../../components/OnboardingScreen';
import { colors, typography, spacing, borderRadius } from '../../constants/theme';
import { strings } from '../../constants/strings';
import { useOnboarding } from '../../state/OnboardingContext';
import { lightTap } from '../../utils/haptics';
import { MAX_BUSINESS_NAME_LENGTH } from '../../utils/validation';
import type { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';

type Nav = NativeStackNavigationProp<OnboardingStackParamList, 'BusinessName'>;

export default function BusinessNameScreen() {
  const navigation = useNavigation<Nav>();
  const { state, dispatch } = useOnboarding();

  const isPaid = state.tier === 'paid';
  const totalSteps = isPaid ? 4 : 5;

  const handleContinue = async () => {
    await lightTap();
    if (isPaid) {
      navigation.navigate('TaxRate');
    } else {
      navigation.navigate('CurrencySelect');
    }
  };

  const handleBack = () => {
    if (isPaid) {
      navigation.navigate('ModeSelect');
    } else {
      navigation.goBack();
    }
  };

  return (
    <OnboardingScreen
      title={strings.onboarding.businessNameTitle}
      subtitle={strings.onboarding.businessNameSubtitle}
      primaryLabel={strings.onboarding.continue}
      onPrimary={handleContinue}
      currentStep={0}
      totalSteps={totalSteps}
      onBack={handleBack}
    >
      <TextInput
        style={styles.input}
        value={state.businessName}
        onChangeText={(text) => dispatch({ type: 'SET_BUSINESS_NAME', payload: text })}
        placeholder={strings.onboarding.businessNamePlaceholder}
        placeholderTextColor={colors.textMuted}
        maxLength={MAX_BUSINESS_NAME_LENGTH}
        returnKeyType="done"
        autoFocus
      />
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  input: {
    ...typography.body,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    color: colors.text,
    marginTop: spacing.lg,
  },
});

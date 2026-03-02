import React from 'react';
import { TextInput, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import OnboardingScreen from '../../components/OnboardingScreen';
import { colors, typography, spacing, borderRadius } from '../../constants/theme';
import { strings } from '../../constants/strings';
import { useOnboarding } from '../../state/OnboardingContext';
import { lightTap } from '../../utils/haptics';
import { MAX_RECEIPT_FOOTER_LENGTH } from '../../utils/validation';
import type { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';

type Nav = NativeStackNavigationProp<OnboardingStackParamList, 'ReceiptFooter'>;

export default function ReceiptFooterScreen() {
  const navigation = useNavigation<Nav>();
  const { state, dispatch } = useOnboarding();

  const isPaid = state.tier === 'paid';
  const totalSteps = isPaid ? 4 : 5;
  const currentStep = isPaid ? 2 : 3;

  const handleContinue = async () => {
    await lightTap();
    navigation.navigate('Final');
  };

  return (
    <OnboardingScreen
      title={strings.onboarding.receiptFooterTitle}
      subtitle={strings.onboarding.receiptFooterSubtitle}
      primaryLabel={strings.onboarding.continue}
      onPrimary={handleContinue}
      currentStep={currentStep}
      totalSteps={totalSteps}
      onBack={() => navigation.goBack()}
    >
      <TextInput
        style={styles.input}
        value={state.receiptFooter}
        onChangeText={(text) => dispatch({ type: 'SET_RECEIPT_FOOTER', payload: text })}
        placeholder={strings.onboarding.receiptFooterPlaceholder}
        placeholderTextColor={colors.textMuted}
        maxLength={MAX_RECEIPT_FOOTER_LENGTH}
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

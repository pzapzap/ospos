import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import OnboardingScreen from '../../components/OnboardingScreen';
import NumericPad from '../../components/NumericPad';
import TaxPreview from '../../components/TaxPreview';
import { typography, spacing } from '../../constants/theme';
import { strings } from '../../constants/strings';
import { useOnboarding } from '../../state/OnboardingContext';
import { lightTap } from '../../utils/haptics';
import {
  formatPercentageDisplay,
  digitsToTaxRateString,
  taxRateStringToDigits,
} from '../../utils/numericPad';
import type { OnboardingStackParamList } from '../../navigation/OnboardingNavigator';

type Nav = NativeStackNavigationProp<OnboardingStackParamList, 'TaxRate'>;

export default function TaxRateScreen() {
  const navigation = useNavigation<Nav>();
  const { state, dispatch } = useOnboarding();
  const [digits, setDigits] = useState(() => taxRateStringToDigits(state.taxRate));

  const isPaid = state.tier === 'paid';
  const totalSteps = isPaid ? 4 : 5;
  const currentStep = isPaid ? 1 : 2;

  const handleValueChange = useCallback(
    (d: string) => {
      setDigits(d);
      dispatch({ type: 'SET_TAX_RATE', payload: digitsToTaxRateString(d) });
    },
    [dispatch],
  );

  const handleNoTax = useCallback(async () => {
    await lightTap();
    dispatch({ type: 'SET_TAX_RATE', payload: '0' });
    navigation.navigate('ReceiptFooter');
  }, [dispatch, navigation]);

  const handleContinue = useCallback(async () => {
    await lightTap();
    if (!digits) {
      dispatch({ type: 'SET_TAX_RATE', payload: '0' });
    }
    navigation.navigate('ReceiptFooter');
  }, [digits, dispatch, navigation]);

  return (
    <OnboardingScreen
      title={strings.onboarding.taxRateTitle}
      subtitle={strings.onboarding.taxRateSubtitle}
      primaryLabel={strings.onboarding.continue}
      onPrimary={handleContinue}
      currentStep={currentStep}
      totalSteps={totalSteps}
      onBack={() => navigation.goBack()}
    >
      <View style={styles.displayArea}>
        <Text style={styles.percentageDisplay}>{formatPercentageDisplay(digits)}</Text>
        <TaxPreview taxRateDigits={digits} currencyCode={state.currency} />
      </View>

      <View style={styles.spacer} />

      <NumericPad
        mode="percentage"
        value={digits}
        onValueChange={handleValueChange}
        specialKeyLabel={strings.onboarding.taxRateNoTax}
        onSpecialKey={handleNoTax}
      />
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  displayArea: {
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  percentageDisplay: {
    ...typography.total,
  },
  spacer: {
    flex: 1,
  },
});

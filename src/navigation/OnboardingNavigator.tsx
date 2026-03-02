import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../constants/theme';
import ModeSelectScreen from '../screens/onboarding/ModeSelectScreen';
import StripeAuthScreen from '../screens/onboarding/StripeAuthScreen';
import StripeOnboardingScreen from '../screens/StripeOnboardingScreen';
import BusinessNameScreen from '../screens/onboarding/BusinessNameScreen';
import CurrencySelectScreen from '../screens/onboarding/CurrencySelectScreen';
import TaxRateScreen from '../screens/onboarding/TaxRateScreen';
import ReceiptFooterScreen from '../screens/onboarding/ReceiptFooterScreen';
import FinalScreen from '../screens/onboarding/FinalScreen';

export type OnboardingStackParamList = {
  ModeSelect: undefined;
  StripeAuth: undefined;
  StripeOnboarding: undefined;
  BusinessName: undefined;
  CurrencySelect: undefined;
  TaxRate: undefined;
  ReceiptFooter: undefined;
  Final: undefined;
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export default function OnboardingNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="ModeSelect" component={ModeSelectScreen} />
      <Stack.Screen name="StripeAuth" component={StripeAuthScreen} />
      <Stack.Screen name="StripeOnboarding" component={StripeOnboardingScreen} />
      <Stack.Screen name="BusinessName" component={BusinessNameScreen} />
      <Stack.Screen name="CurrencySelect" component={CurrencySelectScreen} />
      <Stack.Screen name="TaxRate" component={TaxRateScreen} />
      <Stack.Screen name="ReceiptFooter" component={ReceiptFooterScreen} />
      <Stack.Screen name="Final" component={FinalScreen} />
    </Stack.Navigator>
  );
}

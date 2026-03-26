import React, { createContext, useContext, useReducer, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { batchSetSettings } from '../db/queries';
import { getDefaultCurrency } from '../utils/currency';

// ─── State ────────────────────────────────────────────────────────────────────

export interface OnboardingState {
  tier: 'free' | 'paid' | null;
  businessName: string;
  currency: string;
  taxRate: string;
  receiptFooter: string;
  stripeAccountId?: string;
}

const initialState: OnboardingState = {
  tier: null,
  businessName: '',
  currency: getDefaultCurrency(),
  taxRate: '0',
  receiptFooter: '',
};

// ─── Actions ──────────────────────────────────────────────────────────────────

type OnboardingAction =
  | { type: 'SET_TIER'; payload: 'free' | 'paid' }
  | { type: 'SET_BUSINESS_NAME'; payload: string }
  | { type: 'SET_CURRENCY'; payload: string }
  | { type: 'SET_TAX_RATE'; payload: string }
  | { type: 'SET_RECEIPT_FOOTER'; payload: string }
  | { type: 'SET_STRIPE_ACCOUNT_ID'; payload: string }
  | { type: 'RESET' };

function onboardingReducer(state: OnboardingState, action: OnboardingAction): OnboardingState {
  switch (action.type) {
    case 'SET_TIER':
      return { ...state, tier: action.payload };
    case 'SET_BUSINESS_NAME':
      return { ...state, businessName: action.payload };
    case 'SET_CURRENCY':
      return { ...state, currency: action.payload };
    case 'SET_TAX_RATE':
      return { ...state, taxRate: action.payload };
    case 'SET_RECEIPT_FOOTER':
      return { ...state, receiptFooter: action.payload };
    case 'SET_STRIPE_ACCOUNT_ID':
      return { ...state, stripeAccountId: action.payload };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface OnboardingContextValue {
  state: OnboardingState;
  dispatch: React.Dispatch<OnboardingAction>;
  commitOnboarding: (overrides?: Partial<OnboardingState>, options?: { initialTab?: string }) => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

interface OnboardingProviderProps {
  children: React.ReactNode;
  onComplete: (options?: { initialTab?: string }) => void;
}

export function OnboardingProvider({ children, onComplete }: OnboardingProviderProps) {
  const [state, dispatch] = useReducer(onboardingReducer, initialState);

  const commitOnboarding = useCallback(async (overrides?: Partial<OnboardingState>, options?: { initialTab?: string }) => {
    const effective = overrides ? { ...state, ...overrides } : state;
    const settings: Record<string, string> = {};

    if (effective.tier) settings['tier'] = effective.tier;
    if (effective.businessName) settings['business_name'] = effective.businessName;
    if (effective.currency) settings['currency'] = effective.currency;
    if (effective.taxRate) settings['tax_rate'] = effective.taxRate;
    if (effective.receiptFooter) settings['receipt_footer'] = effective.receiptFooter;
    if (effective.stripeAccountId) settings['stripe_account_id'] = effective.stripeAccountId;

    await batchSetSettings(settings);
    // Reset TTPOi awareness flag so the modal triggers after fresh onboarding
    await SecureStore.deleteItemAsync('ttpoi_awareness_shown').catch(() => {});
    await SecureStore.deleteItemAsync('ttpoi_setup_complete').catch(() => {});
    await AsyncStorage.setItem('onboardingComplete', 'true');
    onComplete(options);
  }, [state, onComplete]);

  return (
    <OnboardingContext.Provider value={{ state, dispatch, commitOnboarding }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(): OnboardingContextValue {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return context;
}

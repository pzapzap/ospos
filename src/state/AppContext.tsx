import React, { createContext, useContext, useReducer, useEffect, useState, useCallback, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { initDatabase, type InitResult } from '../db/database';
import { getAllSettings, setSetting } from '../db/queries';
import {
  orderReducer,
  settingsReducer,
  initialOrderState,
  initialSettingsState,
  type OrderState,
  type OrderAction,
  type SettingsState,
  type SettingsAction,
} from './reducers';
import { shouldAutoBackup, performBackup, recordBackupTime } from '../utils/backup';
import { startSyncEngine, stopSyncEngine, processSyncQueue } from '../services/sync';
import { registerForPushNotifications } from '../services/notifications';
import { registerPushToken, getAccountRequirements } from '../services/api';

export interface StripeRequirements {
  has_requirements: boolean;
  currently_due: string[];
  eventually_due: string[];
  past_due: string[];
  disabled_reason: string | null;
  remediation_url: string | null;
  charges_enabled: boolean;
}

interface AppContextValue {
  dbReady: boolean;
  dbStatus: InitResult | null;

  order: OrderState;
  orderDispatch: React.Dispatch<OrderAction>;

  settings: SettingsState;
  updateSetting: (key: keyof SettingsState, value: string) => Promise<void>;

  lastOrder: {
    orderId: string;
    total: number;
    paymentMethod: string;
    createdAt: string;
    items: OrderState['items'];
    cardLast4?: string;
    cardBrand?: string;
    subtotal: number;
    taxAmount: number;
    tipAmount: number;
    cashTendered?: number;
    discount?: { type: 'percent' | 'amount'; value: number; amount: number; reason?: string };
  } | null;
  setLastOrder: (order: AppContextValue['lastOrder']) => void;

  isOnline: boolean;
  isTestMode: boolean;
  reloadSettings: () => Promise<void>;
  stripeRequirements: StripeRequirements | null;
  checkStripeRequirements: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const TEST_MODE_KEY = 'ospos_test_mode';

// Pin Keychain items to this device only — see services/api.ts SECURE_OPTS.
const SECURE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

async function getTestMode(): Promise<string | null> {
  const value = await SecureStore.getItemAsync(TEST_MODE_KEY);
  if (value) return value;
  // One-time migration from AsyncStorage
  const legacy = await AsyncStorage.getItem(TEST_MODE_KEY);
  if (legacy) {
    await SecureStore.setItemAsync(TEST_MODE_KEY, legacy, SECURE_OPTS);
    await AsyncStorage.removeItem(TEST_MODE_KEY);
    return legacy;
  }
  return null;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [dbReady, setDbReady] = useState(false);
  const [dbStatus, setDbStatus] = useState<InitResult | null>(null);
  const [order, orderDispatch] = useReducer(orderReducer, initialOrderState);
  const [settings, settingsDispatch] = useReducer(settingsReducer, initialSettingsState);
  const [lastOrder, setLastOrder] = useState<AppContextValue['lastOrder']>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [stripeRequirements, setStripeRequirements] = useState<StripeRequirements | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const isTestMode = settings.testMode === 'on';

  // Check Stripe account requirements
  const checkStripeRequirements = useCallback(async () => {
    if (settings.tier !== 'paid') return;
    try {
      const requirements = await getAccountRequirements();
      setStripeRequirements(requirements);
    } catch (err) {
      if (__DEV__) console.warn('[OSPOS] Failed to check Stripe requirements:', err);
    }
  }, [settings.tier]);

  // Connectivity monitoring
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      setIsOnline(online);

      // Update settings for components to read
      settingsDispatch({
        type: 'SET_SETTING',
        payload: { key: 'isOnline', value: online ? 'true' : 'false' },
      });

      // When connectivity returns, trigger sync immediately
      if (online) {
        processSyncQueue();
      }
    });

    return () => unsubscribe();
  }, []);

  // Initialize database and load settings
  useEffect(() => {
    (async () => {
      const result = await initDatabase();
      setDbStatus(result);

      if (result.status === 'ok' || result.status === 'recovered') {
        const dbSettings = await getAllSettings();
        const testMode = await getTestMode();

        settingsDispatch({
          type: 'LOAD_SETTINGS',
          payload: {
            businessName: dbSettings['business_name'] ?? '',
            taxRate: dbSettings['tax_rate'] ?? '0',
            currency: dbSettings['currency'] ?? 'USD',
            autoBackup: dbSettings['auto_backup'] ?? 'on',
            receiptFooter: dbSettings['receipt_footer'] ?? '',
            tier: dbSettings['tier'] === 'paid' ? 'paid' : 'free',
            testMode: testMode === 'on' ? 'on' : 'off',
            isOnline: 'true',
            userEmail: dbSettings['user_email'] ?? '',
            stripeVerified: dbSettings['stripe_verified'] ?? 'true',
            ttpOiSetupComplete: dbSettings['ttpoi_setup_complete'] ?? 'false',
            qsrMode: dbSettings['qsr_mode'] ?? 'off',
          },
        });

        const rate = parseFloat(dbSettings['tax_rate'] ?? '0');
        if (!isNaN(rate)) {
          orderDispatch({ type: 'SET_TAX_RATE', payload: { rate } });
        }

        setDbReady(true);

        // Auto-backup check
        if (dbSettings['auto_backup'] === 'on') {
          const needsBackup = await shouldAutoBackup();
          if (needsBackup) {
            await performBackup();
            await recordBackupTime();
          }
        }

        // Start sync engine for anyone with an account (cash or paid tier).
        // processSyncQueue() internally guards on hasToken() — a truly
        // anonymous cash user's engine boot is a no-op, but a cash-tier
        // merchant who created an account via Sign in with Apple/Google +
        // skipped Stripe still needs their orders to reach the server.
        startSyncEngine();

        // Push notifications + Stripe requirements stay paid-tier-only —
        // both require a linked Stripe account.
        if (dbSettings['tier'] === 'paid') {
          registerForPushNotifications()
            .then((token) => { if (token) registerPushToken(token).catch(() => {}); })
            .catch(() => {});
          getAccountRequirements()
            .then(setStripeRequirements)
            .catch(() => {});
        }
      }
    })();

    return () => {
      stopSyncEngine();
    };
  }, []);

  // Check Stripe requirements when app returns to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        // App came to foreground — flush any queued sales to the server.
        // Android throttles/suspends the 30s setInterval while backgrounded,
        // so a sale rung right before backgrounding can otherwise sit unsynced
        // until the next lucky foreground tick. processSyncQueue() guards on
        // hasToken(), so this is a no-op when signed out.
        processSyncQueue();

        // App came to foreground - check requirements
        if (settings.tier === 'paid') {
          getAccountRequirements()
            .then(setStripeRequirements)
            .catch(() => {});
        }
      }
      appStateRef.current = nextState;
    });

    return () => subscription.remove();
  }, [settings.tier]);

  const reloadSettings = useCallback(async () => {
    const dbSettings = await getAllSettings();
    const testMode = await getTestMode();
    settingsDispatch({
      type: 'LOAD_SETTINGS',
      payload: {
        businessName: dbSettings['business_name'] ?? '',
        taxRate: dbSettings['tax_rate'] ?? '0',
        currency: dbSettings['currency'] ?? 'USD',
        autoBackup: dbSettings['auto_backup'] ?? 'on',
        receiptFooter: dbSettings['receipt_footer'] ?? '',
        tier: dbSettings['tier'] === 'paid' ? 'paid' : 'free',
        testMode: testMode === 'on' ? 'on' : 'off',
        isOnline: 'true',
        userEmail: dbSettings['user_email'] ?? '',
        stripeVerified: dbSettings['stripe_verified'] ?? 'true',
        ttpOiSetupComplete: dbSettings['ttpoi_setup_complete'] ?? 'false',
        qsrMode: dbSettings['qsr_mode'] ?? 'off',
      },
    });
    const rate = parseFloat(dbSettings['tax_rate'] ?? '0');
    if (!isNaN(rate)) {
      orderDispatch({ type: 'SET_TAX_RATE', payload: { rate } });
    }
  }, []);

  const updateSetting = useCallback(async (key: keyof SettingsState, value: string) => {
    settingsDispatch({ type: 'SET_SETTING', payload: { key, value } });

    const dbKeyMap: Record<string, string> = {
      businessName: 'business_name',
      taxRate: 'tax_rate',
      currency: 'currency',
      autoBackup: 'auto_backup',
      receiptFooter: 'receipt_footer',
      userEmail: 'user_email',
      stripeVerified: 'stripe_verified',
      ttpOiSetupComplete: 'ttpoi_setup_complete',
      qsrMode: 'qsr_mode',
    };

    // Some keys are stored in AsyncStorage, not SQLite settings
    if (key === 'tier') {
      await setSetting('tier', value);
      // Sync runs for ANY account, cash or paid (matches the boot effect and
      // the v1.1.3 intent): a cash-tier merchant who created an account still
      // needs their orders to reach the server. Previously a non-'paid' tier
      // called stopSyncEngine(), which silently killed sync for those users.
      // startSyncEngine() guards against double-start; processSyncQueue()
      // inside it guards on hasToken(), so this is a no-op when signed out.
      startSyncEngine();
      return;
    }

    if (key === 'testMode') {
      await SecureStore.setItemAsync(TEST_MODE_KEY, value, SECURE_OPTS);
      return;
    }

    if (key === 'isOnline') return; // Managed by NetInfo, not persisted

    if (dbKeyMap[key]) {
      await setSetting(dbKeyMap[key], value);
    }

    if (key === 'taxRate') {
      const rate = parseFloat(value);
      if (!isNaN(rate)) {
        orderDispatch({ type: 'SET_TAX_RATE', payload: { rate } });
      }
    }
  }, []);

  return (
    <AppContext.Provider
      value={{
        dbReady,
        dbStatus,
        order,
        orderDispatch,
        settings,
        updateSetting,
        lastOrder,
        setLastOrder,
        isOnline,
        isTestMode,
        reloadSettings,
        stripeRequirements,
        checkStripeRequirements,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}

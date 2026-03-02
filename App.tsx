import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, Alert, LogBox, TouchableOpacity } from 'react-native';

LogBox.ignoreLogs([
  'Require cycle',
  'Non-serializable values',
  'VirtualizedLists should never',
  'expo-dev-client',
  'SafeAreaView has been deprecated',
]);
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView as SafeAreaViewCompat } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { Bitter_400Regular, Bitter_500Medium, Bitter_600SemiBold, Bitter_700Bold } from '@expo-google-fonts/bitter';
import { Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold, Archivo_700Bold } from '@expo-google-fonts/archivo';
import { Ionicons } from '@expo/vector-icons';
import { AppProvider, useApp } from './src/state/AppContext';
import { StripeTerminalProvider } from './src/services/terminal';
import { fetchConnectionToken } from './src/services/terminal';
import { colors, typography, spacing } from './src/constants/theme';
import { strings } from './src/constants/strings';

import TierSelectionScreen, { TIER_KEY } from './src/screens/TierSelectionScreen';
import AccountCreationScreen from './src/screens/AccountCreationScreen';
import StripeOnboardingScreen from './src/screens/StripeOnboardingScreen';
import MenuBuilderScreen from './src/screens/MenuBuilderScreen';
import OrderScreen from './src/screens/OrderScreen';
import PaymentScreen from './src/screens/PaymentScreen';
import ReceiptScreen from './src/screens/ReceiptScreen';
import SummaryScreen from './src/screens/SummaryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import TransactionDetailScreen from './src/screens/TransactionDetailScreen';
import DisputesScreen from './src/screens/DisputesScreen';
import StatusBanner from './src/components/StatusBanner';
import * as Sentry from '@sentry/react-native';

// ─── ErrorBoundary (class — must be defined before App references it) ───────

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background, padding: 32 }}>
          <Text style={{ color: colors.danger, fontSize: 20, fontWeight: 'bold', marginBottom: 12, textAlign: 'center' }}>
            Something went wrong
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 24 }}>
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </Text>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false, error: null })}
            style={{ backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, paddingHorizontal: 32 }}
          >
            <Text style={{ color: colors.black, fontSize: 16, fontWeight: 'bold' }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// ─── Sentry ─────────────────────────────────────────────────────────────────

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

try {
  Sentry.init({
    dsn: SENTRY_DSN,
    sendDefaultPii: false,
    enableLogs: !__DEV__,
    replaysSessionSampleRate: __DEV__ ? 0 : 0.1,
    replaysOnErrorSampleRate: 1,
    integrations: [Sentry.mobileReplayIntegration({
      maskAllText: true,
      maskAllImages: true,
    })],
  });
} catch {}

// ─── Navigation ─────────────────────────────────────────────────────────────

type OrderStackParamList = {
  OrderMain: undefined;
  Payment: undefined;
  Receipt: undefined;
  MenuEdit: undefined;
};

type SummaryStackParamList = {
  SummaryMain: undefined;
  TransactionDetail: { orderId: string };
};

type SettingsStackParamList = {
  SettingsMain: undefined;
  Disputes: undefined;
};

const Tab = createBottomTabNavigator();
const OrderStack = createNativeStackNavigator<OrderStackParamList>();
const SummaryStack = createNativeStackNavigator<SummaryStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

const noHeader = { headerShown: false, contentStyle: { backgroundColor: colors.background } };

function OrderStackNavigator() {
  const { isOnline, isTestMode, settings } = useApp();
  return (
    <SafeAreaViewCompat style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <StatusBanner visible={isTestMode} message="TEST MODE" backgroundColor={colors.dangerLight} textColor={colors.danger} />
      <StatusBanner visible={!isOnline} message="Offline — Cash only" backgroundColor={colors.warningLight} textColor={colors.warning} />
      <OrderStack.Navigator screenOptions={noHeader}>
        <OrderStack.Screen name="OrderMain">
          {({ navigation }) => (
            <OrderScreen
              onCharge={() => navigation.navigate('Payment')}
              onMenuEdit={() => navigation.navigate('MenuEdit')}
            />
          )}
        </OrderStack.Screen>
        <OrderStack.Screen name="Payment">
          {({ navigation }) => (
            <PaymentScreen
              onPaymentComplete={() => navigation.navigate('Receipt')}
              onBack={() => navigation.goBack()}
            />
          )}
        </OrderStack.Screen>
        <OrderStack.Screen name="Receipt">
          {({ navigation }) => (
            <ReceiptScreen
              onNewOrder={() => navigation.reset({ index: 0, routes: [{ name: 'OrderMain' }] })}
            />
          )}
        </OrderStack.Screen>
        <OrderStack.Screen name="MenuEdit">
          {({ navigation }) => (
            <MenuBuilderScreen onStartSelling={() => navigation.goBack()} />
          )}
        </OrderStack.Screen>
      </OrderStack.Navigator>
    </SafeAreaViewCompat>
  );
}

function SummaryStackNavigator() {
  return (
    <SummaryStack.Navigator screenOptions={noHeader}>
      <SummaryStack.Screen name="SummaryMain" component={SummaryScreen} />
      <SummaryStack.Screen name="TransactionDetail">
        {({ route, navigation }) => (
          <TransactionDetailScreen
            orderId={(route.params as { orderId: string }).orderId}
            onBack={() => navigation.goBack()}
          />
        )}
      </SummaryStack.Screen>
    </SummaryStack.Navigator>
  );
}

function SettingsStackNavigator() {
  return (
    <SettingsStack.Navigator screenOptions={noHeader}>
      <SettingsStack.Screen name="SettingsMain">
        {({ navigation }) => (
          <SettingsScreen
            onDisputesTap={() => navigation.navigate('Disputes')}
            onUpgrade={() => {
              Alert.alert(
                'Upgrade to Card Payments',
                'This will begin the account setup process to accept card payments with a 1% per-transaction fee.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Continue',
                    onPress: async () => {
                      await AsyncStorage.removeItem(TIER_KEY);
                      await AsyncStorage.removeItem('ospos_auth_token');
                      Alert.alert('Restart Required', 'Please restart the app to begin card payment setup.');
                    },
                  },
                ]
              );
            }}
          />
        )}
      </SettingsStack.Screen>
      <SettingsStack.Screen name="Disputes">
        {({ navigation }) => (
          <DisputesScreen onBack={() => navigation.goBack()} />
        )}
      </SettingsStack.Screen>
    </SettingsStack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(9,9,11,0.85)',
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { ...typography.body, fontSize: 10 },
      }}
    >
      <Tab.Screen
        name="Order"
        component={OrderStackNavigator}
        options={{
          tabBarLabel: 'Order',
          tabBarIcon: ({ color }) => <Ionicons name="grid-outline" size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="Menu"
        options={{
          tabBarLabel: 'Menu',
          tabBarIcon: ({ color }) => <Ionicons name="list-outline" size={22} color={color} />,
        }}
      >
        {({ navigation }) => (
          <MenuBuilderScreen onStartSelling={() => navigation.navigate('Order')} />
        )}
      </Tab.Screen>
      <Tab.Screen
        name="Summary"
        component={SummaryStackNavigator}
        options={{
          tabBarLabel: 'Sales',
          tabBarIcon: ({ color }) => <Ionicons name="bar-chart-outline" size={22} color={color} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsStackNavigator}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color }) => <Ionicons name="settings-outline" size={22} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

// ─── App content ────────────────────────────────────────────────────────────

type OnboardingStep = 'tier' | 'account' | 'stripe' | 'done';

function AppContent() {
  const { dbReady, dbStatus, updateSetting, settings } = useApp();
  const [tierValue, setTierValue] = useState<string | null>(null);
  const [tierChecked, setTierChecked] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>('tier');

  useEffect(() => {
    (async () => {
      const tier = await AsyncStorage.getItem(TIER_KEY);
      setTierValue(tier);
      if (tier) {
        setOnboardingStep('done');
      }
      setTierChecked(true);
    })();
  }, []);

  if (!dbReady || !tierChecked) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (onboardingStep !== 'done') {
    switch (onboardingStep) {
      case 'tier':
        return (
          <TierSelectionScreen
            onTierSelected={(tier) => {
              if (tier === 'free') {
                updateSetting('tier', 'free');
                setTierValue('free');
                setOnboardingStep('done');
              } else {
                setOnboardingStep('account');
              }
            }}
          />
        );
      case 'account':
        return (
          <AccountCreationScreen
            onAccountCreated={() => setOnboardingStep('stripe')}
            onBack={() => setOnboardingStep('tier')}
          />
        );
      case 'stripe':
        return (
          <StripeOnboardingScreen
            onComplete={(verified) => {
              updateSetting('tier', 'paid');
              updateSetting('stripeVerified', verified ? 'true' : 'pending');
              AsyncStorage.setItem(TIER_KEY, 'paid');
              setTierValue('paid');
              setOnboardingStep('done');
            }}
            onBack={() => setOnboardingStep('account')}
          />
        );
    }
  }

  return (
    <StripeTerminalProvider
      logLevel={__DEV__ ? 'verbose' : 'none'}
      tokenProvider={fetchConnectionToken}
    >
      <NavigationContainer>
        <MainTabs />
      </NavigationContainer>
    </StripeTerminalProvider>
  );
}

// ─── Root ───────────────────────────────────────────────────────────────────

function App() {
  const [fontsLoaded, fontError] = useFonts({
    Bitter_400Regular,
    Bitter_500Medium,
    Bitter_600SemiBold,
    Bitter_700Bold,
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
  });

  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppProvider>
        <StatusBar style="light" />
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>
      </AppProvider>
    </GestureHandlerRootView>
  );
}

let ExportedApp: React.ComponentType;
try {
  ExportedApp = Sentry.wrap(App);
} catch {
  ExportedApp = App;
}
export default ExportedApp;

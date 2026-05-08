// API service — real HTTP calls to OSPOS backend
// All calls include JWT in Authorization header. Handle 401 → force re-login.

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock mode: points to mock-backend for development/contribution
// Production mode: points to real server
// Toggle via EXPO_PUBLIC_API_MODE env var or defaults based on __DEV__
const API_MODE = process.env.EXPO_PUBLIC_API_MODE ?? 'production';
const API_BASE_URL = API_MODE === 'mock'
  ? (process.env.EXPO_PUBLIC_MOCK_API_URL ?? 'http://localhost:3000')
  : (process.env.EXPO_PUBLIC_API_URL ?? 'https://api.ospos.app');

const TOKEN_KEY = 'ospos_auth_token';
const TERMINAL_LOCATION_KEY = 'ospos_terminal_location_id';

let authToken: string | null = null;
let terminalLocationId: string | null = null;
let onAuthExpired: (() => void) | null = null;

// Pin Keychain items to this device only — prevents the JWT and other
// secrets from being copied to a new device via iCloud Keychain sync.
// AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY allows access while the device is
// locked (needed for background sync), but never leaves the device.
const SECURE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export function setOnAuthExpired(callback: () => void): void {
  onAuthExpired = callback;
}

async function getToken(): Promise<string | null> {
  if (authToken) return authToken;
  // Try SecureStore first (new location)
  authToken = await SecureStore.getItemAsync(TOKEN_KEY);
  if (authToken) return authToken;
  // One-time migration from AsyncStorage → SecureStore
  const legacyToken = await AsyncStorage.getItem(TOKEN_KEY);
  if (legacyToken) {
    await SecureStore.setItemAsync(TOKEN_KEY, legacyToken, SECURE_OPTS);
    await AsyncStorage.removeItem(TOKEN_KEY);
    authToken = legacyToken;
  }
  return authToken;
}

async function setToken(token: string): Promise<void> {
  authToken = token;
  await SecureStore.setItemAsync(TOKEN_KEY, token, SECURE_OPTS);
}

export async function clearToken(): Promise<void> {
  // Best-effort server-side revocation. Fires before we wipe the local token
  // so the request still has the Authorization header. Failures (offline,
  // server error, legacy token without jti) don't block the logout flow —
  // worst case the JWT expires naturally within 24h.
  try {
    if (authToken) {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      }).catch(() => {});
    }
  } catch {
    // ignore
  }

  authToken = null;
  terminalLocationId = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(TERMINAL_LOCATION_KEY);
  // Also clear legacy location in case migration hasn't happened
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
}

async function setTerminalLocationId(locationId: string | null): Promise<void> {
  terminalLocationId = locationId;
  if (locationId) {
    await SecureStore.setItemAsync(TERMINAL_LOCATION_KEY, locationId, SECURE_OPTS);
  } else {
    await SecureStore.deleteItemAsync(TERMINAL_LOCATION_KEY);
  }
}

export async function getTerminalLocationId(): Promise<string | null> {
  if (terminalLocationId) return terminalLocationId;
  terminalLocationId = await SecureStore.getItemAsync(TERMINAL_LOCATION_KEY);
  return terminalLocationId;
}

export async function hasToken(): Promise<boolean> {
  const token = await getToken();
  return token !== null;
}

const DEFAULT_TIMEOUT_MS = 15000;

interface RequestOptions {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  rawBody?: boolean;
  formData?: FormData;
  timeoutMs?: number;
}

async function request<T>(options: RequestOptions): Promise<T> {
  const token = await getToken();

  const headers: Record<string, string> = {
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const fetchOptions: RequestInit = {
    method: options.method,
    headers,
    signal: controller.signal,
  };

  if (options.formData) {
    fetchOptions.body = options.formData;
  } else if (options.body) {
    headers['Content-Type'] = 'application/json';
    fetchOptions.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${options.path}`, fetchOptions);

    if (response.status === 401) {
      // Only treat as expired session if we actually sent a token. A 401 on an
      // unauthenticated request just means "you need to sign in" — clearing
      // the token here would wipe a freshly-set token from a parallel request.
      if (token) {
        await clearToken();
        onAuthExpired?.();
      }
      throw new Error('Authentication expired');
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({})) as { error?: string; details?: string };
      const message = errorBody.details
        ? `${errorBody.error}: ${errorBody.details}`
        : (errorBody.error ?? `HTTP ${response.status}`);
      throw new Error(message);
    }

    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out. Check your connection and try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function register(
  email: string,
  password: string
): Promise<{ token: string; userId: string; terminalLocationId?: string }> {
  const result = await request<{ token: string; userId: string; terminalLocationId?: string }>({
    method: 'POST',
    path: '/auth/register',
    body: { email, password },
  });
  await setToken(result.token);
  if (result.terminalLocationId) {
    await setTerminalLocationId(result.terminalLocationId);
  }
  return result;
}

export async function login(
  email: string,
  password: string
): Promise<{ token: string; userId: string; terminalLocationId?: string }> {
  const result = await request<{ token: string; userId: string; terminalLocationId?: string }>({
    method: 'POST',
    path: '/auth/login',
    body: { email, password },
  });
  await setToken(result.token);
  if (result.terminalLocationId) {
    await setTerminalLocationId(result.terminalLocationId);
  }
  return result;
}

export async function loginWithApple(
  identityToken: string,
  email?: string | null,
  fullName?: string | null
): Promise<{ token: string; userId: string; isNewUser: boolean; terminalLocationId?: string }> {
  const result = await request<{ token: string; userId: string; isNewUser: boolean; terminalLocationId?: string }>({
    method: 'POST',
    path: '/auth/apple',
    body: { identityToken, email, fullName },
  });
  await setToken(result.token);
  if (result.terminalLocationId) {
    await setTerminalLocationId(result.terminalLocationId);
  }
  return result;
}

export async function deleteAccount(): Promise<{ success: boolean }> {
  return request({
    method: 'POST',
    path: '/auth/delete-account',
  });
}

// ─── Stripe Connect ──────────────────────────────────────────────────────────

export async function startOnboarding(): Promise<{ url: string; stripeAccountId: string; terminalLocationId?: string }> {
  const result = await request<{ url: string; stripeAccountId: string; terminalLocationId?: string }>({
    method: 'POST',
    path: '/stripe/onboarding',
  });
  if (result.terminalLocationId) {
    await setTerminalLocationId(result.terminalLocationId);
  }
  return result;
}

export async function refreshOnboarding(): Promise<{ url: string }> {
  return request({
    method: 'POST',
    path: '/stripe/onboarding/refresh',
  });
}

export async function getAccountStatus(): Promise<{
  charges_enabled: boolean;
  details_submitted: boolean;
  payouts_enabled: boolean;
}> {
  return request({
    method: 'GET',
    path: '/stripe/account-status',
  });
}

export interface AccountDetails {
  business_name: string | null;
  default_currency: string | null;
  support_address_zip: string | null;
  support_address_state: string | null;
  support_address_country: string | null;
}

export async function getAccountDetails(): Promise<AccountDetails> {
  return request({
    method: 'GET',
    path: '/stripe/account-details',
  });
}

export async function getAccountRequirements(): Promise<{
  has_requirements: boolean;
  currently_due: string[];
  eventually_due: string[];
  past_due: string[];
  disabled_reason: string | null;
  remediation_url: string | null;
  charges_enabled: boolean;
}> {
  return request({
    method: 'GET',
    path: '/stripe/account-requirements',
  });
}

export async function getConnectionToken(): Promise<{ secret: string }> {
  // Check if test mode is enabled
  const testMode = await SecureStore.getItemAsync('ospos_test_mode');
  return request({
    method: 'POST',
    path: '/stripe/connection-token',
    body: { test_mode: testMode === 'on' },
  });
}

// ─── Payments ────────────────────────────────────────────────────────────────

export async function createPaymentIntent(
  amount: number,
  currency: string,
  tipAmount?: number,
  testMode?: boolean
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  return request({
    method: 'POST',
    path: '/payments/create-intent',
    body: { amount, currency, tip_amount: tipAmount, test_mode: testMode },
  });
}

export async function issueRefund(
  paymentIntentId: string,
  amount?: number,
  testMode?: boolean
): Promise<{ refundId: string; status: string; amount: number }> {
  return request({
    method: 'POST',
    path: '/payments/refund',
    body: { paymentIntentId, amount, test_mode: testMode },
  });
}

// ─── Disputes ────────────────────────────────────────────────────────────────

export interface DisputeRecord {
  id: string;
  stripe_dispute_id: string;
  stripe_payment_id: string;
  amount: number;
  reason: string | null;
  status: string;
  evidence_submitted: boolean;
  deadline: string | null;
  created_at: string;
  updated_at: string;
}

export async function getDisputes(): Promise<{ disputes: DisputeRecord[] }> {
  return request({
    method: 'GET',
    path: '/disputes/list',
  });
}

export async function submitDisputeEvidence(
  disputeId: string,
  description: string,
  imageUri?: string
): Promise<{ success: boolean }> {
  const formData = new FormData();
  formData.append('dispute_id', disputeId);
  formData.append('description', description);

  if (imageUri) {
    const filename = imageUri.split('/').pop() ?? 'evidence.jpg';
    formData.append('image', {
      uri: imageUri,
      name: filename,
      type: 'image/jpeg',
    } as unknown as Blob);
  }

  return request({
    method: 'POST',
    path: '/disputes/submit-evidence',
    formData,
  });
}

// ─── Sync ────────────────────────────────────────────────────────────────────

export async function syncPush(
  records: unknown[]
): Promise<{ synced: number[] }> {
  return request({
    method: 'POST',
    path: '/sync/push',
    body: { records },
  });
}

export async function syncPull(
  since: string
): Promise<{ orders: unknown[] }> {
  return request({
    method: 'GET',
    path: `/sync/pull?since=${encodeURIComponent(since)}`,
  });
}

// ─── Receipts ────────────────────────────────────────────────────────────────

export interface ReceiptOrderData {
  subtotal: number;
  taxAmount: number;
  tipAmount: number;
  total: number;
  paymentMethod: string;
  createdAt: string;
  cashTendered?: number;
  items: Array<{ name: string; price: number; quantity: number }>;
}

export async function sendReceipt(
  orderId: string,
  method: 'sms' | 'email',
  recipient: string,
  businessName?: string,
  orderData?: ReceiptOrderData
): Promise<{ success: boolean }> {
  return request({
    method: 'POST',
    path: '/receipts/send',
    body: { orderId, method, recipient, businessName, orderData },
  });
}

// ─── Notifications ──────────────────────────────────────────────────────────

export async function registerPushToken(
  pushToken: string
): Promise<{ success: boolean }> {
  return request({
    method: 'POST',
    path: '/notifications/push-token',
    body: { pushToken },
  });
}

export async function sendTTPOiLaunchEmail(
  businessName?: string
): Promise<{ success: boolean }> {
  return request({
    method: 'POST',
    path: '/notifications/ttpoi-launch-email',
    body: { businessName },
  });
}

export async function sendTTPOiLaunchPush(): Promise<{ success: boolean }> {
  return request({
    method: 'POST',
    path: '/notifications/ttpoi-launch-push',
    body: {},
  });
}

// Stripe Terminal SDK integration
// Tap to Pay (local mobile reader) with Bluetooth reader fallback

import { Platform, PermissionsAndroid } from 'react-native';
import {
  StripeTerminalProvider,
  useStripeTerminal,
  type Reader,
} from '@stripe/stripe-terminal-react-native';
import { getConnectionToken } from './api';

export { StripeTerminalProvider };
export { useStripeTerminal };
export type { Reader };

// Android requires ACCESS_FINE_LOCATION to be granted at RUNTIME before the
// Terminal SDK will discover readers (manifest declaration alone is not enough;
// the SDK throws "You must request location permissions before discovering
// readers" otherwise). On Android 12+ it also needs the runtime Bluetooth
// permissions for reader discovery. iOS handles this via Info.plist + the SDK.
export async function ensureTerminalPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const P = PermissionsAndroid.PERMISSIONS;
    const needsBt = typeof Platform.Version === 'number' && Platform.Version >= 31;
    const result = await PermissionsAndroid.requestMultiple(
      needsBt
        ? [P.ACCESS_FINE_LOCATION, P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT]
        : [P.ACCESS_FINE_LOCATION],
    );
    return result[P.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

// Fetch connection token from our backend
// Returns empty string if not authenticated yet — SDK will retry when needed
export async function fetchConnectionToken(): Promise<string> {
  try {
    const result = await getConnectionToken();
    if (__DEV__) console.log('[OSPOS] Connection token fetched:', result.secret ? 'ok' : 'EMPTY');
    if (!result.secret) throw new Error('Empty connection token');
    return result.secret;
  } catch (err) {
    if (__DEV__) console.warn('[OSPOS] Connection token FAILED:', err instanceof Error ? err.message : err);
    throw err;
  }
}

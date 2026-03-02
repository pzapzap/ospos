// Stripe Terminal SDK integration
// Tap to Pay (local mobile reader) with Bluetooth reader fallback

import {
  StripeTerminalProvider,
  useStripeTerminal,
  type Reader,
} from '@stripe/stripe-terminal-react-native';
import { getConnectionToken } from './api';

export { StripeTerminalProvider };
export { useStripeTerminal };
export type { Reader };

// Fetch connection token from our backend
// Returns empty string if not authenticated yet — SDK will retry when needed
export async function fetchConnectionToken(): Promise<string> {
  try {
    const result = await getConnectionToken();
    if (__DEV__) console.log('[OSPOS] Connection token fetched:', result.secret ? 'ok' : 'EMPTY');
    return result.secret;
  } catch (err) {
    console.warn('[OSPOS] Connection token FAILED:', err instanceof Error ? err.message : err);
    return '';
  }
}

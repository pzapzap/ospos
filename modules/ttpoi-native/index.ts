import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

interface OsposTtpoiNativeModule {
  isAppleEducationSupported(): boolean;
  showHowToTap(): Promise<void>;
}

let nativeModule: OsposTtpoiNativeModule | null = null;

if (Platform.OS === 'ios') {
  try {
    nativeModule = requireNativeModule<OsposTtpoiNativeModule>('OsposTtpoi');
  } catch {
    // Module unavailable (e.g. running in Expo Go without the custom dev client).
    nativeModule = null;
  }
}

/**
 * True on iOS 18+, where Apple's ProximityReaderDiscovery provides the
 * Apple-authored merchant education overlay that satisfies TTPOi entitlement
 * requirements 4.3 / 4.4 / 4.5.
 *
 * Returns false on iOS < 18, Android, and web (use the fallback slides instead).
 */
export function isAppleEducationSupported(): boolean {
  if (Platform.OS !== 'ios' || !nativeModule) return false;
  return nativeModule.isAppleEducationSupported();
}

/**
 * Present Apple's "How to Tap" merchant education overlay. Requires iOS 18+.
 * Throws on older OS or non-iOS platforms — callers should gate on
 * {@link isAppleEducationSupported} first.
 */
export async function showHowToTap(): Promise<void> {
  if (!nativeModule) {
    throw new Error('Apple merchant education UI is only available on iOS 18+.');
  }
  return nativeModule.showHowToTap();
}

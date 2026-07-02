// Step-up authentication helper.
// Wraps expo-local-authentication so callers can require a Face ID / Touch ID /
// device-passcode confirmation before sensitive operations (refund, delete
// account, Stripe Connect onboarding).
//
// Returns true on success, false on cancel or unavailable hardware. Callers
// should bail out on false.

import * as LocalAuthentication from 'expo-local-authentication';

export interface StepUpOptions {
  promptMessage: string;
  fallbackLabel?: string;        // shown after biometric fails — defaults to passcode
  cancelLabel?: string;          // iOS only
  // If hardware is unavailable (no biometric enrollment + no passcode) we
  // default to FAIL CLOSED — the caller's sensitive action does not proceed.
  // Every current caller (refund, delete-account) is a destructive money-
  // moving op that must not silently skip step-up on a passcode-less phone.
  // Non-sensitive UX prompts that want to fail open can pass true explicitly.
  allowWhenUnavailable?: boolean;
}

export async function stepUpAuth(opts: StepUpOptions): Promise<boolean> {
  const allowWhenUnavailable = opts.allowWhenUnavailable ?? false;

  const compatible = await LocalAuthentication.hasHardwareAsync();
  if (!compatible) return allowWhenUnavailable;

  // hasEnrolledAsync() returns true if the user has any biometric enrolled
  // OR a device passcode set (depending on the policy). We use the default
  // policy which falls back to passcode.
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!enrolled) return allowWhenUnavailable;

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: opts.promptMessage,
    fallbackLabel: opts.fallbackLabel ?? 'Use Passcode',
    cancelLabel: opts.cancelLabel ?? 'Cancel',
    disableDeviceFallback: false,
  });

  return result.success;
}

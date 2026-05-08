import { useEffect } from 'react';
import {
  preventScreenCaptureAsync,
  allowScreenCaptureAsync,
} from 'expo-screen-capture';

// Blocks screenshots and blacks out live screen recordings while the
// hosting screen is mounted. iOS 14+. Use on screens that display
// sensitive financial data: Payment, Receipt, TransactionDetail.
//
// Multiple components can call this concurrently; expo-screen-capture
// reference-counts internally so the guard only releases when every
// caller has unmounted.
export function useScreenCaptureGuard(): void {
  useEffect(() => {
    preventScreenCaptureAsync().catch(() => {});
    return () => {
      allowScreenCaptureAsync().catch(() => {});
    };
  }, []);
}

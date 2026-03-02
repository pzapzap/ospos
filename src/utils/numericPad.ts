// Pure formatting utilities for NumericPad component
// No React dependencies — used by NumericPad, TaxPreview, TaxRateScreen

import { getCurrencyDecimals, getCurrencySymbol } from './currency';

/** "825" → "8.25%", "" → "0.00%", "5" → "0.05%" */
export function formatPercentageDisplay(digits: string): string {
  if (!digits) return '0.00%';
  const padded = digits.padStart(3, '0');
  const intPart = padded.slice(0, -2) || '0';
  const decPart = padded.slice(-2);
  return `${intPart}.${decPart}%`;
}

/** "825" → 8.25, "" → 0 */
export function digitsToPercentage(digits: string): number {
  if (!digits) return 0;
  return parseInt(digits, 10) / 100;
}

/** "825" → "8.25", "800" → "8", "" → "0" (stored in OnboardingContext) */
export function digitsToTaxRateString(digits: string): string {
  if (!digits) return '0';
  const pct = parseInt(digits, 10) / 100;
  // Remove trailing zeros: 8.00 → "8", 8.25 → "8.25", 8.50 → "8.5"
  return String(pct);
}

/** "8.25" → "825", "8" → "800", "0" → "" (restore from context on back-nav) */
export function taxRateStringToDigits(rateString: string): string {
  if (!rateString || rateString === '0') return '';
  const num = parseFloat(rateString);
  if (isNaN(num) || num === 0) return '';
  return String(Math.round(num * 100));
}

/** parseInt(digits) <= 1500 (i.e. max 15.00%) */
export function isPercentageWithinRange(digits: string): boolean {
  if (!digits) return true;
  return parseInt(digits, 10) <= 1500;
}

/** For currency mode (built now, used later on charge screen)
 *  "599" + "USD" → "$5.99", "1000" + "JPY" → "¥1000" */
export function formatCurrencyDigits(digits: string, currencyCode: string): string {
  const decimals = getCurrencyDecimals(currencyCode);
  const symbol = getCurrencySymbol(currencyCode);

  if (!digits) {
    return decimals === 0 ? `${symbol}0` : `${symbol}0.${'0'.repeat(decimals)}`;
  }

  if (decimals === 0) {
    return `${symbol}${digits}`;
  }

  const padded = digits.padStart(decimals + 1, '0');
  const intPart = padded.slice(0, -decimals) || '0';
  const decPart = padded.slice(-decimals);
  return `${symbol}${intPart}.${decPart}`;
}

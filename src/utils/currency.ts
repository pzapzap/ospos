// Currency formatting by locale/symbol

// Use RN's built-in I18nManager to avoid native module dependency
import { Platform, NativeModules } from 'react-native';

const CURRENCY_CONFIG: Record<string, { symbol: string; locale: string; decimals: number }> = {
  USD: { symbol: '$', locale: 'en-US', decimals: 2 },
  EUR: { symbol: '€', locale: 'de-DE', decimals: 2 },
  GBP: { symbol: '£', locale: 'en-GB', decimals: 2 },
  MXN: { symbol: '$', locale: 'es-MX', decimals: 2 },
  INR: { symbol: '₹', locale: 'en-IN', decimals: 2 },
  JPY: { symbol: '¥', locale: 'ja-JP', decimals: 0 },
  BRL: { symbol: 'R$', locale: 'pt-BR', decimals: 2 },
  CAD: { symbol: '$', locale: 'en-CA', decimals: 2 },
  AUD: { symbol: '$', locale: 'en-AU', decimals: 2 },
  CHF: { symbol: 'CHF', locale: 'de-CH', decimals: 2 },
  CNY: { symbol: '¥', locale: 'zh-CN', decimals: 2 },
  KRW: { symbol: '₩', locale: 'ko-KR', decimals: 0 },
  SEK: { symbol: 'kr', locale: 'sv-SE', decimals: 2 },
  NOK: { symbol: 'kr', locale: 'nb-NO', decimals: 2 },
  DKK: { symbol: 'kr', locale: 'da-DK', decimals: 2 },
  SGD: { symbol: '$', locale: 'en-SG', decimals: 2 },
  HKD: { symbol: '$', locale: 'en-HK', decimals: 2 },
  NZD: { symbol: '$', locale: 'en-NZ', decimals: 2 },
  ZAR: { symbol: 'R', locale: 'en-ZA', decimals: 2 },
  THB: { symbol: '฿', locale: 'th-TH', decimals: 2 },
  TWD: { symbol: 'NT$', locale: 'zh-TW', decimals: 0 },
  PLN: { symbol: 'zł', locale: 'pl-PL', decimals: 2 },
  TRY: { symbol: '₺', locale: 'tr-TR', decimals: 2 },
  ILS: { symbol: '₪', locale: 'he-IL', decimals: 2 },
  PHP: { symbol: '₱', locale: 'en-PH', decimals: 2 },
  MYR: { symbol: 'RM', locale: 'ms-MY', decimals: 2 },
  IDR: { symbol: 'Rp', locale: 'id-ID', decimals: 0 },
  COP: { symbol: '$', locale: 'es-CO', decimals: 0 },
  ARS: { symbol: '$', locale: 'es-AR', decimals: 2 },
  CLP: { symbol: '$', locale: 'es-CL', decimals: 0 },
};

/** Format an integer cents value for display (e.g. 599 → "$5.99") */
export function formatCurrency(amountCents: number, currencyCode: string): string {
  const config = CURRENCY_CONFIG[currencyCode];
  const divisor = config?.decimals === 0 ? 1 : 100;
  const decimals = config?.decimals ?? 2;
  const symbol = config?.symbol ?? currencyCode;
  const display = (amountCents / divisor).toFixed(decimals);

  if (config) {
    return `${symbol}${display}`;
  }
  return `${currencyCode} ${display}`;
}

export function getCurrencySymbol(currencyCode: string): string {
  const config = CURRENCY_CONFIG[currencyCode];
  return config ? config.symbol : currencyCode;
}

export function getCurrencyDecimals(code: string): number {
  return CURRENCY_CONFIG[code]?.decimals ?? 2;
}

/** Parse a display-value string into integer smallest-unit (e.g. "5.99" → 599 for USD, "1000" → 1000 for JPY) */
export function parseCurrencyInput(text: string, currencyCode?: string): number {
  const cleaned = text.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned);
  if (isNaN(parsed)) return 0;
  const decimals = currencyCode ? getCurrencyDecimals(currencyCode) : 2;
  const multiplier = decimals === 0 ? 1 : Math.pow(10, decimals);
  return Math.round(parsed * multiplier);
}

export const SUPPORTED_CURRENCIES = [
  { code: 'ARS', name: 'Argentine Peso', symbol: '$', flag: '🇦🇷' },
  { code: 'AUD', name: 'Australian Dollar', symbol: '$', flag: '🇦🇺' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', flag: '🇧🇷' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: '$', flag: '🇨🇦' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', flag: '🇨🇭' },
  { code: 'CLP', name: 'Chilean Peso', symbol: '$', flag: '🇨🇱' },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', flag: '🇨🇳' },
  { code: 'COP', name: 'Colombian Peso', symbol: '$', flag: '🇨🇴' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr', flag: '🇩🇰' },
  { code: 'EUR', name: 'Euro', symbol: '€', flag: '🇪🇺' },
  { code: 'GBP', name: 'British Pound', symbol: '£', flag: '🇬🇧' },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: '$', flag: '🇭🇰' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', flag: '🇮🇩' },
  { code: 'ILS', name: 'Israeli Shekel', symbol: '₪', flag: '🇮🇱' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', flag: '🇮🇳' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', flag: '🇯🇵' },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩', flag: '🇰🇷' },
  { code: 'MXN', name: 'Mexican Peso', symbol: '$', flag: '🇲🇽' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', flag: '🇲🇾' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', flag: '🇳🇴' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: '$', flag: '🇳🇿' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱', flag: '🇵🇭' },
  { code: 'PLN', name: 'Polish Zloty', symbol: 'zł', flag: '🇵🇱' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', flag: '🇸🇪' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: '$', flag: '🇸🇬' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿', flag: '🇹🇭' },
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺', flag: '🇹🇷' },
  { code: 'TWD', name: 'Taiwan Dollar', symbol: 'NT$', flag: '🇹🇼' },
  { code: 'USD', name: 'US Dollar', symbol: '$', flag: '🇺🇸' },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', flag: '🇿🇦' },
] as const;

const LOCALE_CURRENCY_MAP: Record<string, string> = {
  US: 'USD', CA: 'CAD', MX: 'MXN', BR: 'BRL', AR: 'ARS', CL: 'CLP', CO: 'COP',
  GB: 'GBP', DE: 'EUR', FR: 'EUR', IT: 'EUR', ES: 'EUR', NL: 'EUR', BE: 'EUR',
  AT: 'EUR', PT: 'EUR', IE: 'EUR', FI: 'EUR', GR: 'EUR',
  CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', TR: 'TRY', IL: 'ILS',
  JP: 'JPY', CN: 'CNY', KR: 'KRW', TW: 'TWD', IN: 'INR',
  SG: 'SGD', HK: 'HKD', NZ: 'NZD', AU: 'AUD', ZA: 'ZAR',
  TH: 'THB', PH: 'PHP', MY: 'MYR', ID: 'IDR',
};

export function getDefaultCurrency(): string {
  try {
    const locale = Platform.OS === 'ios'
      ? NativeModules.SettingsManager?.settings?.AppleLocale ?? NativeModules.SettingsManager?.settings?.AppleLanguages?.[0] ?? 'en_US'
      : NativeModules.I18nManager?.localeIdentifier ?? 'en_US';
    const regionCode = locale.split(/[_-]/).pop()?.toUpperCase();
    if (regionCode && LOCALE_CURRENCY_MAP[regionCode]) return LOCALE_CURRENCY_MAP[regionCode];
  } catch {}
  return 'USD';
}

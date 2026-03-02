// Currency formatting by locale/symbol

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

/** Parse a dollar-string input into integer cents (e.g. "5.99" → 599) */
export function parseCurrencyInput(text: string): number {
  const cleaned = text.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : Math.round(parsed * 100);
}

export const SUPPORTED_CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'MXN', name: 'Mexican Peso', symbol: '$' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: '$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: '$' },
] as const;

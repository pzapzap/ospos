import usTaxRates from '../data/us_tax_rates.json';

const rates = usTaxRates as Record<string, string>;

/** Look up base state-level sales tax rate for a US state abbreviation.
 *  Returns the rate string (e.g. "6.25") or null if not found. */
export function lookupTaxRateByState(stateCode: string | null): string | null {
  if (!stateCode) return null;
  return rates[stateCode.toUpperCase()] ?? null;
}

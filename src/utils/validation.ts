// Input validation utilities

export function validateTaxRate(rate: string): { valid: boolean; error?: string } {
  const parsed = parseFloat(rate);
  if (isNaN(parsed)) return { valid: false, error: 'Tax rate must be a number' };
  if (parsed < 0) return { valid: false, error: 'Tax rate cannot be negative' };
  if (parsed > 100) return { valid: false, error: 'Tax rate cannot exceed 100%' };
  return { valid: true };
}

/** Validate a dollar-string price input and return integer cents */
export function validatePrice(price: string): { valid: boolean; parsed: number; error?: string } {
  const parsed = parseFloat(price);
  if (!price.trim() || isNaN(parsed)) return { valid: false, parsed: 0, error: 'Price must be a number' };
  if (parsed <= 0) return { valid: false, parsed: 0, error: 'Price must be greater than zero' };
  if (parsed > 999999.99) return { valid: false, parsed: 0, error: 'Price cannot exceed 999,999.99' };
  return { valid: true, parsed: Math.round(parsed * 100) };
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function validatePhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

/** Max quantity per line item */
export const MAX_ITEM_QUANTITY = 999;

/** Max tip as multiple of subtotal */
export const MAX_TIP_MULTIPLIER = 2;

/** Max length for text fields */
export const MAX_BUSINESS_NAME_LENGTH = 256;
export const MAX_ITEM_NAME_LENGTH = 256;
export const MAX_CATEGORY_LENGTH = 50;
export const MAX_RECEIPT_FOOTER_LENGTH = 255;

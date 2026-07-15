// Client-side receipt delivery for cash-tier merchants.
//
// Cash-tier accounts have no server-issued JWT, so the paid-tier
// /receipts/send-email + /receipts/send-sms endpoints return 401 for them.
// Rather than gate email/SMS off the free tier entirely, we hand the receipt
// off to the cashier's own Mail / Messages app via a mailto: / sms: URL.
//
// - Sender: the cashier's own email address / phone (not noreply@ospos.app).
//   That's a feature for small businesses — feels less "SaaS", more personal.
// - Works offline once the OS registers the URL scheme (which happens once).
// - Zero server, zero cost, zero deliverability worries.
//
// Paid-tier merchants keep their branded server-mediated path unchanged.

import { Linking, Platform } from 'react-native';
import { formatCurrency } from './currency';
import type { ReceiptOrderData } from '../services/api';

const HR = '─'.repeat(28);

/**
 * Format an order into a plain-text receipt suitable for the body of an
 * email or SMS. Mirrors what the server-side Resend template shows.
 */
export function formatReceiptText(
  businessName: string,
  data: ReceiptOrderData,
  currency: string
): string {
  const lines: string[] = [];
  lines.push(businessName || 'Receipt');
  lines.push(new Date(data.createdAt).toLocaleString());
  lines.push(HR);

  for (const item of data.items) {
    const modAdjustment = (item.modifiers ?? []).reduce((s, m) => s + m.priceCents, 0);
    const linePrice = (item.price + modAdjustment) * item.quantity;
    lines.push(`${item.name} × ${item.quantity}  ${formatCurrency(linePrice, currency)}`);
    for (const mod of item.modifiers ?? []) {
      const modLabel = mod.priceCents !== 0
        ? `   + ${mod.name} (${formatCurrency(mod.priceCents, currency)})`
        : `   + ${mod.name}`;
      lines.push(modLabel);
    }
  }

  lines.push(HR);
  lines.push(`Subtotal    ${formatCurrency(data.subtotal ?? data.total, currency)}`);
  if (data.discount && data.discount.amount > 0) {
    const label = data.discount.type === 'percent'
      ? `Discount (${data.discount.value}%)`
      : 'Discount';
    lines.push(`${label}    −${formatCurrency(data.discount.amount, currency)}`);
  }
  if ((data.taxAmount ?? 0) > 0) {
    lines.push(`Tax         ${formatCurrency(data.taxAmount, currency)}`);
  }
  if ((data.tipAmount ?? 0) > 0) {
    lines.push(`Tip         ${formatCurrency(data.tipAmount, currency)}`);
  }
  lines.push(`Total       ${formatCurrency(data.total, currency)}`);
  lines.push('');
  lines.push(`Paid ${data.paymentMethod === 'cash' ? 'in cash' : 'by card'}`);
  if (data.paymentMethod === 'cash' && data.cashTendered && data.cashTendered > data.total) {
    lines.push(`Tendered ${formatCurrency(data.cashTendered, currency)} · Change ${formatCurrency(data.cashTendered - data.total, currency)}`);
  }
  lines.push('');
  lines.push('Thank you.');
  return lines.join('\n');
}

/**
 * Open the customer's Mail app with a pre-filled receipt. Returns true if
 * the OS accepted the URL (Mail app opened), false otherwise.
 */
export async function openNativeMail(
  to: string,
  subject: string,
  body: string
): Promise<boolean> {
  const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Open the customer's Messages app with a pre-filled receipt SMS. Handles
 * the iOS/Android separator difference (& vs ?).
 */
export async function openNativeSms(to: string, body: string): Promise<boolean> {
  const separator = Platform.OS === 'ios' ? '&' : '?';
  const url = `sms:${encodeURIComponent(to)}${separator}body=${encodeURIComponent(body)}`;
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

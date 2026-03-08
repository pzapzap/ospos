import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { createReceiptLog, updateReceiptStatus } from '../db/queries/receipts';
import { queryOne, query } from '../db/connection';
import { sendSMS } from '../services/twilio';
import { sendEmail } from '../services/sendgrid';

const router = Router();

router.use(authMiddleware);

interface OrderRow {
  id: string;
  subtotal: number;
  tax_amount: number;
  tip_amount: number;
  total: number;
  payment_method: string;
  created_at: string;
}

interface OrderItemRow {
  item_name: string;
  item_price: number;
  quantity: number;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+[1-9]\d{1,14}$/;

// Format cents to dollars string
function formatMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatReceiptText(
  businessName: string,
  order: OrderRow,
  items: OrderItemRow[]
): string {
  const lines: string[] = [];
  if (businessName) {
    lines.push(businessName);
    lines.push('---');
  }
  lines.push(`Receipt — ${new Date(order.created_at).toLocaleString()}`);
  lines.push('');

  for (const item of items) {
    const lineTotal = formatMoney(item.item_price * item.quantity);
    lines.push(`${item.quantity}x ${item.item_name}  $${lineTotal}`);
  }

  lines.push('');
  lines.push(`Subtotal: $${formatMoney(order.subtotal)}`);
  if (order.tax_amount > 0) {
    lines.push(`Tax: $${formatMoney(order.tax_amount)}`);
  }
  if (order.tip_amount > 0) {
    lines.push(`Tip: $${formatMoney(order.tip_amount)}`);
  }
  lines.push(`Total: $${formatMoney(order.total)}`);
  lines.push(`Paid by: ${order.payment_method}`);
  lines.push('');
  lines.push('Thank you!');

  return lines.join('\n');
}

function formatReceiptHtml(
  businessName: string,
  order: OrderRow,
  items: OrderItemRow[]
): string {
  const itemRows = items
    .map(
      (item) =>
        `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee">${escapeHtml(`${item.quantity}x ${item.item_name}`)}</td>
          <td style="padding:8px 0;text-align:right;border-bottom:1px solid #eee">$${formatMoney(item.item_price * item.quantity)}</td>
        </tr>`
    )
    .join('');

  const safeName = businessName ? escapeHtml(businessName) : 'OSPOS';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
    </head>
    <body style="margin:0;padding:20px;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
      <div style="max-width:400px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
        <h1 style="text-align:center;margin:0 0 4px 0;font-size:24px;color:#111">${safeName}</h1>
        <p style="text-align:center;color:#666;font-size:14px;margin:0 0 20px 0">
          ${escapeHtml(new Date(order.created_at).toLocaleString())}
        </p>
        <table style="width:100%;border-collapse:collapse">
          ${itemRows}
        </table>
        <div style="margin-top:16px;padding-top:16px;border-top:2px solid #111">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:4px 0;color:#666">Subtotal</td><td style="padding:4px 0;text-align:right">$${formatMoney(order.subtotal)}</td></tr>
            ${order.tax_amount > 0 ? `<tr><td style="padding:4px 0;color:#666">Tax</td><td style="padding:4px 0;text-align:right">$${formatMoney(order.tax_amount)}</td></tr>` : ''}
            ${order.tip_amount > 0 ? `<tr><td style="padding:4px 0;color:#666">Tip</td><td style="padding:4px 0;text-align:right">$${formatMoney(order.tip_amount)}</td></tr>` : ''}
            <tr style="font-size:18px;font-weight:bold"><td style="padding:8px 0 0 0">Total</td><td style="padding:8px 0 0 0;text-align:right">$${formatMoney(order.total)}</td></tr>
          </table>
        </div>
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #eee;text-align:center">
          <p style="margin:0 0 4px 0;color:#666;font-size:14px">Paid by ${escapeHtml(order.payment_method === 'card' ? 'Card' : 'Cash')}</p>
          <p style="margin:0;color:#22D3EE;font-size:14px;font-weight:500">Thank you!</p>
        </div>
      </div>
      <p style="text-align:center;color:#999;font-size:12px;margin-top:16px">Powered by OSPOS</p>
    </body>
    </html>
  `;
}

// POST /receipts/send
router.post('/send', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const { orderId, method, recipient } = req.body;

    if (!orderId || !method || !recipient) {
      res.status(400).json({ error: 'orderId, method, and recipient are required' });
      return;
    }

    if (typeof orderId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
      res.status(400).json({ error: 'orderId must be a valid UUID' });
      return;
    }

    if (method !== 'sms' && method !== 'email') {
      res.status(400).json({ error: 'method must be "sms" or "email"' });
      return;
    }

    if (typeof recipient !== 'string' || recipient.length > 255) {
      res.status(400).json({ error: 'Invalid recipient' });
      return;
    }

    if (method === 'sms' && !PHONE_REGEX.test(recipient)) {
      res.status(400).json({ error: 'recipient must be a valid E.164 phone number for SMS' });
      return;
    }

    if (method === 'email' && !EMAIL_REGEX.test(recipient)) {
      res.status(400).json({ error: 'recipient must be a valid email address' });
      return;
    }

    // Fetch order details for receipt content
    const order = await queryOne<OrderRow>(
      'SELECT id, subtotal, tax_amount, tip_amount, total, payment_method, created_at FROM synced_orders WHERE id = $1 AND user_id = $2',
      [orderId, req.user.userId]
    );

    const items = order
      ? await query<OrderItemRow>(
          'SELECT item_name, item_price, quantity FROM synced_order_items WHERE order_id = $1',
          [orderId]
        )
      : [];

    // Get business name from synced settings, fall back to email or OSPOS
    const businessSetting = await queryOne<{ value: string }>(
      'SELECT value FROM synced_settings WHERE user_id = $1 AND key = $2',
      [req.user.userId, 'business_name']
    );

    let businessName = businessSetting?.value;
    if (!businessName) {
      const user = await queryOne<{ email: string }>(
        'SELECT email FROM users WHERE id = $1',
        [req.user.userId]
      );
      businessName = user?.email?.split('@')[0] ?? 'OSPOS';
    }

    const log = await createReceiptLog(req.user.userId, orderId, method, recipient);

    if (method === 'sms') {
      const body = order
        ? formatReceiptText(businessName, order, items)
        : `Your receipt from OSPOS. Order: ${orderId}`;

      const result = await sendSMS(recipient, body);
      await updateReceiptStatus(log.id, result.success ? 'sent' : 'failed');
      res.json({ success: result.success, receiptLogId: log.id });
    } else {
      const html = order
        ? formatReceiptHtml(businessName, order, items)
        : `<h1>Receipt</h1><p>Order: ${escapeHtml(orderId)}</p>`;

      const result = await sendEmail(recipient, `Receipt from ${businessName}`, html);
      await updateReceiptStatus(log.id, result.success ? 'sent' : 'failed');
      res.json({ success: result.success, receiptLogId: log.id });
    }
  } catch (error) {
    console.error('[RECEIPTS] Send error:', error);
    res.status(500).json({ error: 'Failed to send receipt' });
  }
});

export default router;

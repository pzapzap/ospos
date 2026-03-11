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
  items: OrderItemRow[],
  cashTendered?: number
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
  lines.push(`Paid by: ${order.payment_method === 'card' ? 'Card' : 'Cash'}`);
  if (order.payment_method === 'cash' && cashTendered && cashTendered > order.total) {
    lines.push(`Cash Tendered: $${formatMoney(cashTendered)}`);
    lines.push(`Change: $${formatMoney(cashTendered - order.total)}`);
  }
  lines.push('');
  lines.push('Thank you!');

  return lines.join('\n');
}

function formatReceiptHtml(
  businessName: string,
  order: OrderRow,
  items: OrderItemRow[],
  cashTendered?: number
): string {
  const itemRows = items
    .map(
      (item) =>
        `<tr>
          <td style="padding:12px 0;border-bottom:1px solid #27272a;color:#fafafa">${escapeHtml(`${item.quantity}x ${item.item_name}`)}</td>
          <td style="padding:12px 0;text-align:right;border-bottom:1px solid #27272a;color:#fafafa;font-weight:500">$${formatMoney(item.item_price * item.quantity)}</td>
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
    <body style="margin:0;padding:20px;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
      <div style="max-width:420px;margin:0 auto;background:#18181b;border-radius:16px;padding:32px;border:1px solid #27272a">
        <!-- OSPOS Logo/Brand -->
        <div style="text-align:center;margin-bottom:24px">
          <div style="display:inline-block;background:#22D3EE;color:#09090b;font-weight:bold;font-size:14px;padding:6px 16px;border-radius:6px;letter-spacing:1px">OSPOS</div>
        </div>

        <!-- Business Name -->
        <h1 style="text-align:center;margin:0 0 8px 0;font-size:28px;color:#fafafa;font-weight:600">${safeName}</h1>
        <p style="text-align:center;color:#a1a1aa;font-size:14px;margin:0 0 24px 0">
          ${escapeHtml(new Date(order.created_at).toLocaleString())}
        </p>

        <!-- Items -->
        <div style="background:#09090b;border-radius:12px;padding:16px;margin-bottom:20px">
          <table style="width:100%;border-collapse:collapse">
            ${itemRows}
          </table>
        </div>

        <!-- Totals -->
        <div style="padding:16px 0;border-top:2px solid #22D3EE">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:6px 0;color:#a1a1aa">Subtotal</td><td style="padding:6px 0;text-align:right;color:#fafafa">$${formatMoney(order.subtotal)}</td></tr>
            ${order.tax_amount > 0 ? `<tr><td style="padding:6px 0;color:#a1a1aa">Tax</td><td style="padding:6px 0;text-align:right;color:#fafafa">$${formatMoney(order.tax_amount)}</td></tr>` : ''}
            ${order.tip_amount > 0 ? `<tr><td style="padding:6px 0;color:#a1a1aa">Tip</td><td style="padding:6px 0;text-align:right;color:#fafafa">$${formatMoney(order.tip_amount)}</td></tr>` : ''}
            <tr><td style="padding:12px 0 0 0;font-size:22px;font-weight:bold;color:#fafafa">Total</td><td style="padding:12px 0 0 0;text-align:right;font-size:22px;font-weight:bold;color:#22D3EE">$${formatMoney(order.total)}</td></tr>
          </table>
        </div>

        <!-- Payment Info -->
        <div style="margin-top:20px;padding-top:20px;border-top:1px solid #27272a;text-align:center">
          <p style="margin:0 0 8px 0;color:#a1a1aa;font-size:14px">Paid by ${escapeHtml(order.payment_method === 'card' ? 'Card' : 'Cash')}</p>
          ${order.payment_method === 'cash' && cashTendered && cashTendered > order.total ? `
          <p style="margin:8px 0 4px 0;color:#a1a1aa;font-size:14px">Cash Tendered: $${formatMoney(cashTendered)}</p>
          <p style="margin:0 0 12px 0;color:#22D3EE;font-size:16px;font-weight:600">Change: $${formatMoney(cashTendered - order.total)}</p>
          ` : ''}
          <p style="margin:16px 0 0 0;color:#22D3EE;font-size:16px;font-weight:500">Thank you!</p>
        </div>
      </div>
      <p style="text-align:center;color:#52525b;font-size:12px;margin-top:20px">Powered by <span style="color:#22D3EE">OSPOS</span></p>
    </body>
    </html>
  `;
}

interface ClientOrderData {
  subtotal: number;
  taxAmount: number;
  tipAmount: number;
  total: number;
  paymentMethod: string;
  createdAt: string;
  cashTendered?: number;
  items: Array<{ name: string; price: number; quantity: number }>;
}

// POST /receipts/send
router.post('/send', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const { orderId, method, recipient, orderData } = req.body as {
      orderId: string;
      method: string;
      recipient: string;
      orderData?: ClientOrderData;
    };

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

    // Use client-provided order data, or fall back to database query
    let order: OrderRow | null = null;
    let items: OrderItemRow[] = [];

    if (orderData) {
      // Use data sent from client (immediate, no sync delay)
      order = {
        id: orderId,
        subtotal: orderData.subtotal,
        tax_amount: orderData.taxAmount,
        tip_amount: orderData.tipAmount,
        total: orderData.total,
        payment_method: orderData.paymentMethod,
        created_at: orderData.createdAt,
      };
      items = orderData.items.map(item => ({
        item_name: item.name,
        item_price: item.price,
        quantity: item.quantity,
      }));
    } else {
      // Fall back to database (for older clients or re-sends)
      order = await queryOne<OrderRow>(
        'SELECT id, subtotal, tax_amount, tip_amount, total, payment_method, created_at FROM synced_orders WHERE id = $1 AND user_id = $2',
        [orderId, req.user.userId]
      );
      items = order
        ? await query<OrderItemRow>(
            'SELECT item_name, item_price, quantity FROM synced_order_items WHERE order_id = $1',
            [orderId]
          )
        : [];
    }

    // Get business name from request body, or fall back to email/OSPOS
    let businessName = typeof req.body.businessName === 'string' ? req.body.businessName : null;
    if (!businessName) {
      const user = await queryOne<{ email: string }>(
        'SELECT email FROM users WHERE id = $1',
        [req.user.userId]
      );
      businessName = user?.email?.split('@')[0] ?? 'OSPOS';
    }

    const log = await createReceiptLog(req.user.userId, orderId, method, recipient);

    const cashTendered = orderData?.cashTendered;

    if (method === 'sms') {
      const body = order
        ? formatReceiptText(businessName, order, items, cashTendered)
        : `Your receipt from OSPOS. Order: ${orderId}`;

      const result = await sendSMS(recipient, body);
      await updateReceiptStatus(log.id, result.success ? 'sent' : 'failed');
      res.json({ success: result.success, receiptLogId: log.id });
    } else {
      const html = order
        ? formatReceiptHtml(businessName, order, items, cashTendered)
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

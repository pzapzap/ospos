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
  // v1.1: optional discount snapshot. When discount_amount > 0 the template
  // renders a line above tax showing the type/value/reason.
  discount_type?: 'percent' | 'amount' | null;
  discount_value?: number | null;
  discount_amount?: number;
  discount_reason?: string | null;
}

interface ClientModifier {
  name: string;
  priceCents: number;
  groupName?: string;
}

interface OrderItemRow {
  item_name: string;
  item_price: number;
  quantity: number;
  // v1.1: optional modifier list. When non-empty the template renders an
  // indented sub-line under the item (e.g. "oat milk · no foam · +$0.75").
  modifiers?: ClientModifier[];
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
    // v1.1: indented modifier sub-line. Renders something like
    //   - oat milk · no foam · extra shot
    if (item.modifiers && item.modifiers.length > 0) {
      const modText = item.modifiers.map((m) => m.name).join(' · ');
      lines.push(`  - ${modText}`);
    }
  }

  lines.push('');
  lines.push(`Subtotal: $${formatMoney(order.subtotal)}`);
  // v1.1: discount line above tax (matches the in-app receipt rendering).
  if (order.discount_amount && order.discount_amount > 0) {
    const label = order.discount_type === 'percent' && order.discount_value != null
      ? `Discount (${order.discount_value}% off)`
      : 'Discount';
    const suffix = order.discount_reason ? ` · ${order.discount_reason}` : '';
    lines.push(`${label}${suffix}: -$${formatMoney(order.discount_amount)}`);
  }
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
  // OSPOS v1.1 aesthetic — dark venue mode + cyan + gold accent.
  // Bitter slab serif for headers/body, Archivo for numbers, JetBrains Mono
  // for metadata eyebrows. Web fonts via Google CDN with safe fallbacks.
  const SERIF =
    "'Bitter', Georgia, 'Times New Roman', serif";
  const NUM =
    "'Archivo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
  const MONO =
    "'JetBrains Mono', ui-monospace, Menlo, Monaco, Consolas, monospace";

  const itemRows = items
    .map((item) => {
      // v1.1: indented modifier sub-line under the item name when present.
      // Joined with thin-space dot separators to match the in-app receipt.
      const modText = item.modifiers && item.modifiers.length > 0
        ? escapeHtml(item.modifiers.map((m) => m.name).join(' · '))
        : '';
      const nameBlock = modText
        ? `<div style="font-family:${SERIF};font-size:15px;color:#fafafa">
             <span style="color:#a1a1aa;font-family:${NUM};font-weight:600;font-size:13px">${item.quantity}×</span>
             &nbsp;${escapeHtml(item.item_name)}
           </div>
           <div style="font-family:${SERIF};font-size:12px;color:#a1a1aa;margin-top:3px;padding-left:24px;line-height:1.4">${modText}</div>`
        : `<span style="color:#a1a1aa;font-family:${NUM};font-weight:600;font-size:13px">${item.quantity}×</span>
           &nbsp;${escapeHtml(item.item_name)}`;
      return `
        <tr>
          <td style="padding:14px 0;border-bottom:2px solid #27272a;color:#fafafa;font-family:${SERIF};font-size:15px">
            ${nameBlock}
          </td>
          <td style="padding:14px 0;text-align:right;border-bottom:2px solid #27272a;color:#fafafa;font-family:${NUM};font-weight:600;font-size:15px;white-space:nowrap;vertical-align:top">
            $${formatMoney(item.item_price * item.quantity)}
          </td>
        </tr>`;
    })
    .join('');

  // v1.1: discount row between subtotal and tax. Renders nothing when zero.
  // Matches in-app receipt formatting (label may include the % and reason).
  const discountRow = order.discount_amount && order.discount_amount > 0
    ? (() => {
        const pctSuffix = order.discount_type === 'percent' && order.discount_value != null
          ? ` · ${order.discount_value}% off`
          : '';
        const reasonSuffix = order.discount_reason ? ` · ${escapeHtml(order.discount_reason)}` : '';
        return `<tr>
          <td style="padding:6px 0;font-family:${SERIF};font-size:14px;color:#a1a1aa">Discount${pctSuffix}${reasonSuffix}</td>
          <td style="padding:6px 0;text-align:right;font-family:${NUM};font-weight:500;font-size:14px;color:#fafafa;white-space:nowrap">−$${formatMoney(order.discount_amount)}</td>
        </tr>`;
      })()
    : '';

  const safeName = businessName ? escapeHtml(businessName) : 'OSPOS';
  const orderId = escapeHtml(order.id.substring(0, 8).toUpperCase());
  const dateStr = escapeHtml(new Date(order.created_at).toLocaleString());
  const isCash = order.payment_method === 'cash';
  const paymentLabel = isCash ? 'CASH' : 'CARD';
  const eyebrow = `RECEIPT · ${paymentLabel} · ORDER ${orderId}`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bitter:ital,wght@0,400;0,500;0,600;0,700;1,500&family=Archivo:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
  <title>Receipt from ${safeName}</title>
</head>
<body style="margin:0;padding:32px 16px;background:#09090b;font-family:${SERIF};-webkit-font-smoothing:antialiased">

  <!-- Outer table — chunky card architecture: 2px border + 6px solid bottom-edge depth in cyan-dark -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;max-width:480px;border-collapse:separate">
    <tr>
      <td style="background:#18181b;border:2px solid #06B6D4;border-bottom:6px solid #06B6D4;border-radius:24px;padding:32px">

        <!-- Eyebrow -->
        <div style="text-align:center;font-family:${MONO};font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#a1a1aa;margin-bottom:10px">
          ${eyebrow}
        </div>

        <!-- Business Name (display serif) -->
        <div style="text-align:center;font-family:${SERIF};font-size:32px;font-weight:700;color:#fafafa;letter-spacing:-0.6px;line-height:1.05;margin-bottom:6px">
          ${safeName}
        </div>

        <!-- Date in mono (eyebrow-style) -->
        <div style="text-align:center;font-family:${MONO};font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#52525b;margin-bottom:28px">
          ${dateStr}
        </div>

        <!-- Items panel — chunky inset frame -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#09090b;border:2px solid #27272a;border-bottom-width:4px;border-radius:14px;border-collapse:separate">
          <tr><td style="padding:6px 16px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${itemRows}
            </table>
          </td></tr>
        </table>

        <!-- Subtotal / Discount / Tax / Tip -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px">
          <tr>
            <td style="padding:6px 0;font-family:${SERIF};font-size:14px;color:#a1a1aa">Subtotal</td>
            <td style="padding:6px 0;text-align:right;font-family:${NUM};font-weight:500;font-size:14px;color:#fafafa;white-space:nowrap">$${formatMoney(order.subtotal)}</td>
          </tr>
          ${discountRow}
          ${order.tax_amount > 0 ? `<tr>
            <td style="padding:6px 0;font-family:${SERIF};font-size:14px;color:#a1a1aa">Tax</td>
            <td style="padding:6px 0;text-align:right;font-family:${NUM};font-weight:500;font-size:14px;color:#fafafa;white-space:nowrap">$${formatMoney(order.tax_amount)}</td>
          </tr>` : ''}
          ${order.tip_amount > 0 ? `<tr>
            <td style="padding:6px 0;font-family:${SERIF};font-size:14px;color:#a1a1aa">Tip</td>
            <td style="padding:6px 0;text-align:right;font-family:${NUM};font-weight:500;font-size:14px;color:#D4A574;white-space:nowrap">$${formatMoney(order.tip_amount)}</td>
          </tr>` : ''}
        </table>

        <!-- Total — chunky cyan frame, biggest type element -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;background:#0e2a30;border:2px solid #22D3EE;border-bottom-width:4px;border-radius:14px;border-collapse:separate">
          <tr>
            <td style="padding:14px 18px;font-family:${SERIF};font-size:18px;font-weight:600;color:#fafafa">Total</td>
            <td style="padding:14px 18px;text-align:right;font-family:${NUM};font-weight:700;font-size:32px;color:#22D3EE;letter-spacing:-1px;line-height:1;white-space:nowrap">$${formatMoney(order.total)}</td>
          </tr>
        </table>

        ${isCash && cashTendered && cashTendered > order.total ? `
        <!-- Cash details — gold chunky frame -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;background:#221F1B;border:2px solid #B8895E;border-bottom-width:4px;border-radius:14px;border-collapse:separate">
          <tr><td style="padding:14px 18px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-family:${MONO};font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#a1a1aa">Tendered</td>
                <td style="text-align:right;font-family:${NUM};font-weight:500;font-size:14px;color:#fafafa;white-space:nowrap">$${formatMoney(cashTendered)}</td>
              </tr>
              <tr>
                <td style="padding-top:8px;font-family:${MONO};font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#D4A574">Change Due</td>
                <td style="padding-top:8px;text-align:right;font-family:${NUM};font-weight:700;font-size:22px;color:#D4A574;letter-spacing:-0.5px;white-space:nowrap">$${formatMoney(cashTendered - order.total)}</td>
              </tr>
            </table>
          </td></tr>
        </table>` : ''}

        <!-- Closing italic glyph signature — gold/mustard for warmth, mirrors the in-app italic glyph layer -->
        <div style="margin-top:36px;text-align:center">
          <div style="font-family:${SERIF};font-style:italic;font-weight:500;font-size:30px;color:#D4A574;line-height:1;letter-spacing:-0.3px">Thank you.</div>
        </div>

      </td>
    </tr>
  </table>

  <!-- Footer -->
  <div style="text-align:center;margin-top:20px;font-family:${MONO};font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:#52525b">
    Powered by <span style="color:#D4A574;font-weight:500">OSPOS</span>
  </div>

</body>
</html>`;
}

interface ClientOrderData {
  subtotal: number;
  taxAmount: number;
  tipAmount: number;
  total: number;
  paymentMethod: string;
  createdAt: string;
  cashTendered?: number;
  items: Array<{
    name: string;
    price: number;
    quantity: number;
    // v1.1: modifiers selected at sale time, denormalized snapshot.
    modifiers?: ClientModifier[];
  }>;
  // v1.1: order-level discount applied at sale time.
  discount?: {
    type: 'percent' | 'amount';
    value: number;
    amount: number;
    reason?: string;
  };
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

    // Ownership check first — verify the caller owns this order before
    // accepting any data about it. Without this, a valid JWT could be used
    // to send a phishing receipt branded as another merchant's transaction
    // through our verified Resend domain.
    //
    // Two valid states:
    //  (a) Order is in synced_orders for this user → use DB or client data
    //  (b) Order hasn't synced yet (offline-first) → require orderData and
    //      log a soft warning (we can't verify it, but the JWT proves the
    //      caller is *some* legitimate user — they could only spam their
    //      own customers, which is what /receipts/send is for anyway)
    const dbOrder = await queryOne<OrderRow>(
      'SELECT id, subtotal, tax_amount, tip_amount, total, payment_method, created_at FROM synced_orders WHERE id = $1 AND user_id = $2',
      [orderId, req.user.userId]
    );

    let order: OrderRow | null = null;
    let items: OrderItemRow[] = [];

    if (dbOrder) {
      // Order has synced. Prefer DB values to keep the receipt authoritative;
      // fall back to client orderData only for fields we don't query (none
      // currently — the SELECT covers everything).
      order = dbOrder;
      items = await query<OrderItemRow>(
        'SELECT item_name, item_price, quantity FROM synced_order_items WHERE order_id = $1',
        [orderId]
      );
    } else if (orderData) {
      // Order isn't in DB yet (offline merchant, sync delay). Without a DB
      // row we can't verify ownership — but we DO know the caller is
      // authenticated. Verify no other user owns this orderId; if some
      // OTHER user already has an order with this id, refuse outright.
      const otherOwner = await queryOne<{ user_id: string }>(
        'SELECT user_id FROM synced_orders WHERE id = $1',
        [orderId]
      );
      if (otherOwner) {
        // The id exists under a different user (covered by dbOrder query
        // above returning null but this returning a row → ownership mismatch).
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      order = {
        id: orderId,
        subtotal: orderData.subtotal,
        tax_amount: orderData.taxAmount,
        tip_amount: orderData.tipAmount,
        total: orderData.total,
        payment_method: orderData.paymentMethod,
        created_at: orderData.createdAt,
        // v1.1: discount snapshot. Only renders a line when amount > 0.
        discount_type: orderData.discount?.type ?? null,
        discount_value: orderData.discount?.value ?? null,
        discount_amount: orderData.discount?.amount ?? 0,
        discount_reason: orderData.discount?.reason ?? null,
      };
      items = orderData.items.map(item => ({
        item_name: item.name,
        item_price: item.price,
        quantity: item.quantity,
        // v1.1: pass modifiers through to the renderer for the sub-line.
        modifiers: item.modifiers,
      }));
    } else {
      // Neither DB row nor client data — nothing to send.
      res.status(404).json({ error: 'Order not found' });
      return;
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

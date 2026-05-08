// Email sending via Resend.
// File kept named "sendgrid.ts" to minimize churn — the public `sendEmail`
// interface is identical, so callers (routes/receipts.ts,
// routes/notifications.ts) need no changes.

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const RESEND_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? process.env.SENDGRID_FROM_EMAIL ?? '';

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean }> {
  if (!RESEND_API_KEY) {
    console.log('[RESEND] Not configured — skipping email send');
    return { success: false };
  }
  if (!RESEND_FROM_EMAIL) {
    console.log('[RESEND] No from email configured');
    return { success: false };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: [to],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[RESEND] Email send error ${res.status}: ${body}`);
      return { success: false };
    }

    console.log(`[RESEND] Email sent to ${to}`);
    return { success: true };
  } catch (error) {
    console.error('[RESEND] Email send error:', error);
    return { success: false };
  }
}

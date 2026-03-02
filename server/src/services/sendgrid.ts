// SendGrid email sending — sends receipt emails via SendGrid API

import sgMail from '@sendgrid/mail';
import { config } from '../config';

let initialized = false;

function ensureInitialized(): boolean {
  if (initialized) return true;
  if (!config.sendgrid.apiKey) {
    return false;
  }
  sgMail.setApiKey(config.sendgrid.apiKey);
  initialized = true;
  return true;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean }> {
  if (!ensureInitialized()) {
    console.log('[SENDGRID] Not configured — skipping email send');
    return { success: false };
  }

  if (!config.sendgrid.fromEmail) {
    console.log('[SENDGRID] No from email configured');
    return { success: false };
  }

  try {
    await sgMail.send({
      to,
      from: config.sendgrid.fromEmail,
      subject,
      html,
    });

    console.log(`[SENDGRID] Email sent to ${to}`);
    return { success: true };
  } catch (error) {
    console.error('[SENDGRID] Email send error:', error);
    return { success: false };
  }
}

// Twilio SMS sending — sends receipt messages via Twilio API

import Twilio from 'twilio';
import { config } from '../config';

let client: ReturnType<typeof Twilio> | null = null;

function getClient(): ReturnType<typeof Twilio> | null {
  if (client) return client;
  if (!config.twilio.accountSid || !config.twilio.authToken) {
    return null;
  }
  client = Twilio(config.twilio.accountSid, config.twilio.authToken);
  return client;
}

export async function sendSMS(
  to: string,
  body: string
): Promise<{ success: boolean; messageId?: string }> {
  const twilioClient = getClient();

  if (!twilioClient) {
    console.log('[TWILIO] Not configured — skipping SMS send');
    return { success: false };
  }

  if (!config.twilio.phoneNumber) {
    console.log('[TWILIO] No phone number configured');
    return { success: false };
  }

  try {
    const message = await twilioClient.messages.create({
      body,
      from: config.twilio.phoneNumber,
      to,
    });

    console.log(`[TWILIO] SMS sent: ${message.sid}`);
    return { success: true, messageId: message.sid };
  } catch (error) {
    console.error('[TWILIO] SMS send error:', error);
    return { success: false };
  }
}

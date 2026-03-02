import { Expo, type ExpoPushMessage } from 'expo-server-sdk';

const expo = new Expo();

export async function sendPushNotification(
  pushToken: string,
  title: string,
  body: string
): Promise<boolean> {
  if (!Expo.isExpoPushToken(pushToken)) {
    console.error('[PUSH] Invalid push token:', pushToken);
    return false;
  }

  const message: ExpoPushMessage = {
    to: pushToken,
    sound: 'default',
    title,
    body,
  };

  try {
    const chunks = expo.chunkPushNotifications([message]);
    for (const chunk of chunks) {
      const receipts = await expo.sendPushNotificationsAsync(chunk);
      console.log('[PUSH] Sent:', receipts);
    }
    return true;
  } catch (error) {
    console.error('[PUSH] Send error:', error);
    return false;
  }
}

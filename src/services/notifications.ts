// Push notification setup with expo-notifications
// Registers device token and sends to server for dispute/status alerts

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PUSH_TOKEN_KEY = 'ospos_push_token';

// Configure notification handling behavior — wrapped in try/catch because
// this runs at module evaluation time and can crash the entire app if the
// native module isn't available (e.g., fresh build, missing native config)
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch {
  // Notifications native module not available — app will still work without push
}

export async function registerForPushNotifications(): Promise<string | null> {
  // Check existing permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request permission if not granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  // Android requires a notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'OSPOS Notifications',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  // Get push token
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: undefined, // Will use the project ID from app config
    });
    const token = tokenData.data;

    // Store locally
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);

    return token;
  } catch {
    return null;
  }
}

export async function getStoredPushToken(): Promise<string | null> {
  return AsyncStorage.getItem(PUSH_TOKEN_KEY);
}

// Add listener for received notifications (while app is open)
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationReceivedListener(callback);
}

// Add listener for notification taps (user interacted with notification)
export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

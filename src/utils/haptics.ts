// Wrapper around expo-haptics
import * as Haptics from 'expo-haptics';

export async function lightTap(): Promise<void> {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Haptics may not be available on all devices/simulators
  }
}

export async function mediumTap(): Promise<void> {
  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    // Haptics may not be available
  }
}

export async function successNotification(): Promise<void> {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // Haptics may not be available
  }
}

export async function errorNotification(): Promise<void> {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch {
    // Haptics may not be available
  }
}

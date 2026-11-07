import { AppNotification, NotificationSettings } from '@/domain/entities';

/**
 * Manages local device notifications (`expo-notifications`) without requiring
 * any remote push infrastructure. Gracefully handles environments where
 * native notification modules are unavailable (e.g., Jest tests or web preview).
 */
export class DeviceNotificationService {
  static async requestPermissionsAsync(): Promise<boolean> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Notifications = require('expo-notifications');
      const existing = await Notifications.getPermissionsAsync();
      if (existing.granted) return true;
      const requested = await Notifications.requestPermissionsAsync();
      return Boolean(requested.granted);
    } catch {
      return false;
    }
  }

  static async dispatchLocalAlert(
    notification: AppNotification | null
  ): Promise<void> {
    if (!notification) return;
    try {
      const granted = await this.requestPermissionsAsync();
      if (!granted) return;

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Notifications = require('expo-notifications');
      await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.message,
          data: {
            notificationId: notification.id,
            productId: notification.productId,
            itemKey: notification.itemKey,
          },
        },
        trigger: null, // Immediate local notification
      });
    } catch {
      // In-app notification is already persisted in SQLite `notifications` table
    }
  }

  static async syncScheduledReminders(
    settings: NotificationSettings,
    lowStockCount: number
  ): Promise<void> {
    try {
      const granted = await this.requestPermissionsAsync();
      if (!granted) return;

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Notifications = require('expo-notifications');
      await Notifications.cancelAllScheduledNotificationsAsync();

      if (settings.dailyReminderEnabled) {
        const [hourStr, minStr] = settings.dailyReminderTime.split(':');
        const hour = Number(hourStr || 20);
        const minute = Number(minStr || 0);
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Daily Stock Entry & Count Reminder',
            body: 'Record today’s incoming deliveries or perform a quick physical stock count in StockBeacon.',
          },
          trigger: {
            hour,
            minute,
            repeats: true,
          },
        });
      }

      if (settings.dailySummaryEnabled && lowStockCount > 0) {
        const [hourStr, minStr] = settings.dailySummaryTime.split(':');
        const hour = Number(hourStr || 9);
        const minute = Number(minStr || 0);
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Daily Low-Stock Summary',
            body: `${lowStockCount} item(s) are currently at or below their minimum stock threshold.`,
          },
          trigger: {
            hour,
            minute,
            repeats: true,
          },
        });
      }
    } catch {
      // Safe fallback on simulators/environments without background alarm scheduling
    }
  }
}

/**
 * Notification delivery channel interface.
 * Currently: SSE only.
 * Future: Add PushNotificationChannel for PWA push notifications.
 *
 * To add PWA Push later:
 * 1. Create `push_subscriptions` table (userId, endpoint, p256dh, auth)
 * 2. Install `web-push` package
 * 3. Implement PushNotificationChannel
 * 4. Register it in NotificationService.channels[]
 */

export interface NotificationPayload {
	type: string;
	title: string;
	body: string;
	url?: string;
	data?: Record<string, unknown>;
}

export interface NotificationChannel {
	send(userId: number, notification: NotificationPayload): Promise<void>;
}

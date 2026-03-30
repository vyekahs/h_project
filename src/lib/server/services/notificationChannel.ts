/**
 * Notification delivery channel interface.
 * Channels: SSE (real-time in-app) + Web Push (background/lock screen).
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

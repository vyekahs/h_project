import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { emitNotification } from '$lib/server/liveEvents';
import type { NotificationPayload, NotificationChannel } from './notificationChannel';

class SSENotificationChannel implements NotificationChannel {
	async send(userId: number, notification: NotificationPayload) {
		emitNotification(userId, {
			type: notification.type,
			title: notification.title,
			body: notification.body,
			url: notification.url,
		});
	}
}

const channels: NotificationChannel[] = [new SSENotificationChannel()];

export const NotificationService = {
	async notify(userId: number, payload: NotificationPayload, fromUserId?: number, referenceId?: string) {
		// 1. Save to DB
		await db.execute(sql`
			INSERT INTO notifications (user_id, type, message, from_user_id, reference_id)
			VALUES (${userId}, ${payload.type}, ${payload.body}, ${fromUserId ?? null}, ${referenceId ?? null})
		`);

		// 2. Send via all channels
		await Promise.allSettled(channels.map(ch => ch.send(userId, payload)));
	},

	async getNotifications(userId: number, limit = 20): Promise<NotificationItem[]> {
		const res = await db.execute(sql`
			SELECT
				n.id,
				n.type,
				n.message,
				n.from_user_id,
				a.name as from_user_name,
				n.reference_id,
				n.is_read,
				n.created_at
			FROM notifications n
			LEFT JOIN attendees a ON n.from_user_id = a.id
			WHERE n.user_id = ${userId}
			ORDER BY n.is_read ASC, n.created_at DESC
			LIMIT ${limit}
		`);
		return res as unknown as NotificationItem[];
	},

	async markAsRead(userId: number, notificationIds: number[]) {
		if (notificationIds.length === 0) return;
		const idConditions = sql.join(notificationIds.map(id => sql`${id}`), sql`, `);
		await db.execute(sql`
			UPDATE notifications
			SET is_read = true
			WHERE user_id = ${userId} AND id IN (${idConditions})
		`);
	},

	async markAllAsRead(userId: number) {
		await db.execute(sql`
			UPDATE notifications
			SET is_read = true
			WHERE user_id = ${userId} AND is_read = false
		`);
	},

	async getUnreadCount(userId: number): Promise<number> {
		const res = await db.execute(sql`
			SELECT COUNT(*) as count
			FROM notifications
			WHERE user_id = ${userId} AND is_read = false
		`);
		return Number((res as any[])[0]?.count ?? 0);
	},
};

export interface NotificationItem {
	id: number;
	type: string;
	message: string;
	from_user_id: number | null;
	from_user_name: string | null;
	reference_id: string | null;
	is_read: boolean;
	created_at: string;
}

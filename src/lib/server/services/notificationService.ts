import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { emitNotification } from '$lib/server/liveEvents';
import type { NotificationPayload, NotificationChannel } from './notificationChannel';
import { PushNotificationChannel } from './pushNotificationChannel';

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

const channels: NotificationChannel[] = [new SSENotificationChannel(), new PushNotificationChannel()];

// mention은 기존 호환: 행 없으면 ON. 나머지 새 알림은 행 없으면 OFF.
const DEFAULT_ON_TYPES = ['mention', 'wtp_message', 'party_message'];

export const NotificationService = {
	async notify(userId: number, payload: NotificationPayload, fromUserId?: number, referenceId?: string) {
		// 0. Check notification preference
		const prefResult = await db.execute(sql`
			SELECT enabled FROM notification_preferences
			WHERE attendee_id = ${userId} AND notification_type = ${payload.type}
		`);
		if (prefResult.length > 0) {
			if ((prefResult[0] as any).enabled === false) return;
		} else {
			// 행 없음: mention은 ON, 나머지는 OFF
			if (!DEFAULT_ON_TYPES.includes(payload.type)) return;
		}

		// 1. Save to DB
		await db.execute(sql`
			INSERT INTO notifications (user_id, type, message, from_user_id, reference_id)
			VALUES (${userId}, ${payload.type}, ${payload.body}, ${fromUserId ?? null}, ${referenceId ?? null})
		`);

		// 2. Send via all channels
		await Promise.allSettled(channels.map(ch => ch.send(userId, payload)));
	},

	/**
	 * Upsert: 같은 reference_id + user_id의 안 읽은 알림이 있으면 갱신, 없으면 생성
	 */
	async upsertNotify(userId: number, payload: NotificationPayload, fromUserId?: number, referenceId?: string) {
		// 0. Check notification preference
		const prefResult = await db.execute(sql`
			SELECT enabled FROM notification_preferences
			WHERE attendee_id = ${userId} AND notification_type = ${payload.type}
		`);
		if (prefResult.length > 0) {
			if ((prefResult[0] as any).enabled === false) return;
		} else {
			if (!DEFAULT_ON_TYPES.includes(payload.type)) return;
		}

		// 1. 기존 안 읽은 알림 갱신 시도
		if (referenceId) {
			const updated = await db.execute(sql`
				UPDATE notifications
				SET message = ${payload.body}, from_user_id = ${fromUserId ?? null}, created_at = NOW()
				WHERE user_id = ${userId} AND reference_id = ${referenceId} AND is_read = false
				RETURNING id
			`);
			if (updated.length > 0) {
				// 갱신됨 — SSE만 재전송
				await Promise.allSettled(channels.map(ch => ch.send(userId, payload)));
				return;
			}
		}

		// 2. 새로 생성
		await db.execute(sql`
			INSERT INTO notifications (user_id, type, message, from_user_id, reference_id)
			VALUES (${userId}, ${payload.type}, ${payload.body}, ${fromUserId ?? null}, ${referenceId ?? null})
		`);
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

	async getPreferences(userId: number): Promise<Record<string, boolean>> {
		const res = await db.execute(sql`
			SELECT notification_type, enabled FROM notification_preferences
			WHERE attendee_id = ${userId}
		`);
		// mention 기본 ON, 나머지 기본 OFF
		const prefs: Record<string, boolean> = {
			mention: true,
			visit_plan: false,
			game_join: false,
			rank_change: false,
			wtp_join: false,
			wtp_message: true,
			party_message: true,
		};
		for (const row of res as any[]) {
			prefs[row.notification_type] = row.enabled;
		}
		return prefs;
	},

	async deleteNotification(userId: number, notificationId: number) {
		await db.execute(sql`
			DELETE FROM notifications
			WHERE user_id = ${userId} AND id = ${notificationId}
		`);
	},

	async setPreference(userId: number, notificationType: string, enabled: boolean) {
		await db.execute(sql`
			INSERT INTO notification_preferences (attendee_id, notification_type, enabled)
			VALUES (${userId}, ${notificationType}, ${enabled})
			ON CONFLICT (attendee_id, notification_type) DO UPDATE SET enabled = ${enabled}
		`);
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

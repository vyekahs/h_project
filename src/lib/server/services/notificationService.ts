import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { emitNotification } from '$lib/server/liveEvents';
import type { NotificationPayload, NotificationChannel } from './notificationChannel';
import { PushNotificationChannel, sendPushToMany } from './pushNotificationChannel';

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
const DEFAULT_ON_TYPES = ['mention', 'wtp_message', 'party_message', 'party_invite'];

function normalizeIds(userIds: number[]): number[] {
	return [...new Set(userIds.map(Number))].filter((id) => Number.isInteger(id));
}

// (VALUES (1::int), (2::int), ...) — 파라미터만 넘기면 Postgres가 타입을 못 정하므로 캐스팅한다
function idValues(ids: number[]) {
	return sql.join(
		ids.map((id) => sql`(${id}::int)`),
		sql`, `
	);
}

function idList(ids: number[]) {
	return sql.join(
		ids.map((id) => sql`${id}`),
		sql`, `
	);
}

/** 알림 생성 후 실제 전달 (SSE는 인메모리, 푸시는 일괄 조회 후 전송) */
async function deliver(userIds: number[], payload: NotificationPayload) {
	if (userIds.length === 0) return;

	for (const id of userIds) {
		emitNotification(id, {
			type: payload.type,
			title: payload.title,
			body: payload.body,
			url: payload.url,
		});
	}

	try {
		await sendPushToMany(userIds, payload);
	} catch (e) {
		console.error('[Notify] 푸시 일괄 전송 실패:', e);
	}
}

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
	 * 여러 사용자에게 같은 내용의 알림을 보낸다 (일괄 처리).
	 *
	 * notify()를 인원수만큼 Promise.all로 돌리면 1인당 쿼리 3개(설정 조회 →
	 * INSERT → 푸시 구독 조회)가 동시에 터져서, 전 회원 브로드캐스트 한 번에
	 * 커넥션 풀(max 20)이 그대로 바닥났다. 여기서는 설정 필터와 알림 생성을
	 * INSERT ... SELECT 하나로 합쳐 인원수와 무관하게 쿼리 2~3개로 끝낸다.
	 */
	async notifyMany(
		userIds: number[],
		payload: NotificationPayload,
		fromUserId?: number,
		referenceId?: string
	) {
		const targets = normalizeIds(userIds);
		if (targets.length === 0) return;

		const defaultOn = DEFAULT_ON_TYPES.includes(payload.type);

		const inserted = await db.execute(sql`
			INSERT INTO notifications (user_id, type, message, from_user_id, reference_id)
			SELECT t.id, ${payload.type}, ${payload.body}, ${fromUserId ?? null}, ${referenceId ?? null}
			FROM (VALUES ${idValues(targets)}) AS t(id)
			LEFT JOIN notification_preferences np
				ON np.attendee_id = t.id AND np.notification_type = ${payload.type}
			WHERE COALESCE(np.enabled, ${defaultOn}::boolean) = true
			RETURNING user_id
		`);

		await deliver((inserted as any[]).map((r) => Number(r.user_id)), payload);
	},

	/**
	 * upsertNotify의 일괄 처리 버전.
	 * 같은 reference_id의 안 읽은 알림은 갱신하고, 없는 대상에게만 새로 생성한다.
	 */
	async upsertNotifyMany(
		userIds: number[],
		payload: NotificationPayload,
		fromUserId?: number,
		referenceId?: string
	) {
		const targets = normalizeIds(userIds);
		if (targets.length === 0) return;

		const defaultOn = DEFAULT_ON_TYPES.includes(payload.type);

		// 1. 알림 설정상 수신 가능한 대상만 추린다
		const allowedRes = await db.execute(sql`
			SELECT t.id
			FROM (VALUES ${idValues(targets)}) AS t(id)
			LEFT JOIN notification_preferences np
				ON np.attendee_id = t.id AND np.notification_type = ${payload.type}
			WHERE COALESCE(np.enabled, ${defaultOn}::boolean) = true
		`);
		const allowed = (allowedRes as any[]).map((r) => Number(r.id));
		if (allowed.length === 0) return;

		// 2. 기존 안 읽은 알림 일괄 갱신
		let remaining = allowed;
		if (referenceId) {
			const updated = await db.execute(sql`
				UPDATE notifications
				SET message = ${payload.body}, from_user_id = ${fromUserId ?? null}, created_at = NOW()
				WHERE reference_id = ${referenceId}
				  AND is_read = false
				  AND user_id IN (${idList(allowed)})
				RETURNING user_id
			`);
			const updatedIds = new Set((updated as any[]).map((r) => Number(r.user_id)));
			remaining = allowed.filter((id) => !updatedIds.has(id));
		}

		// 3. 갱신되지 않은 대상에게만 새로 생성
		if (remaining.length > 0) {
			await db.execute(sql`
				INSERT INTO notifications (user_id, type, message, from_user_id, reference_id)
				SELECT t.id, ${payload.type}, ${payload.body}, ${fromUserId ?? null}, ${referenceId ?? null}
				FROM (VALUES ${idValues(remaining)}) AS t(id)
			`);
		}

		// 갱신/신규 모두 실시간 알림은 받아야 하므로 allowed 전체에 전달
		await deliver(allowed, payload);
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

	async markAsReadByReference(userId: number, referenceId: string): Promise<number> {
		const res = await db.execute(sql`
			UPDATE notifications
			SET is_read = true
			WHERE user_id = ${userId} AND reference_id = ${referenceId} AND is_read = false
			RETURNING id
		`);
		return (res as any[]).length;
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
			party_invite: true,
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

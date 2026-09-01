import webpush from 'web-push';
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { mapWithConcurrency } from '$lib/server/concurrency';
import type { NotificationChannel, NotificationPayload } from './notificationChannel';

let configured = false;

function ensureConfigured() {
	if (configured) return;
	const publicKey = publicEnv.PUBLIC_VAPID_KEY;
	const privateKey = env.VAPID_PRIVATE_KEY;
	const subject = env.VAPID_SUBJECT || 'mailto:admin@example.com';
	if (!publicKey || !privateKey) {
		console.warn('[Push] VAPID 키 미설정 - PUBLIC_VAPID_KEY:', !!publicKey, 'VAPID_PRIVATE_KEY:', !!privateKey);
		return;
	}
	webpush.setVapidDetails(subject, publicKey, privateKey);
	configured = true;
}

/**
 * 여러 사용자에게 한 번에 푸시를 보낸다.
 *
 * 사용자마다 send()를 호출하면 구독 조회 쿼리가 인원수만큼 동시에 나가고,
 * 만료 구독 정리 DELETE도 구독 수만큼 개별로 나간다. 여기서는 구독 조회 1회 +
 * 만료 정리 1회로 묶고, 실제 전송(외부 네트워크 I/O)만 제한된 동시성으로 돌린다.
 */
export async function sendPushToMany(
	userIds: number[],
	notification: NotificationPayload
): Promise<void> {
	ensureConfigured();
	if (!configured) return;
	if (userIds.length === 0) return;

	const idList = sql.join(
		userIds.map((id) => sql`${id}`),
		sql`, `
	);
	const subs = await db.execute(sql`
		SELECT id, endpoint, p256dh, auth FROM push_subscriptions
		WHERE user_id IN (${idList})
	`);
	if (!subs.length) return;

	const pushPayload = JSON.stringify({
		title: notification.title,
		body: notification.body,
		url: notification.url,
		type: notification.type,
	});

	const staleIds: number[] = [];
	await mapWithConcurrency(subs as any[], 8, async (sub) => {
		try {
			await webpush.sendNotification(
				{ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
				pushPayload
			);
		} catch (err: any) {
			console.error(`[Push] sendNotification 실패 (sub ${sub.id}):`, err.statusCode || err.message || err);
			if (err.statusCode === 410 || err.statusCode === 404) {
				staleIds.push(sub.id);
			}
		}
	});

	if (staleIds.length > 0) {
		await db.execute(sql`
			DELETE FROM push_subscriptions
			WHERE id IN (${sql.join(staleIds.map((id) => sql`${id}`), sql`, `)})
		`);
	}
}

export class PushNotificationChannel implements NotificationChannel {
	async send(userId: number, notification: NotificationPayload): Promise<void> {
		ensureConfigured();
		if (!configured) return;

		const subs = await db.execute(sql`
			SELECT id, endpoint, p256dh, auth FROM push_subscriptions
			WHERE user_id = ${userId}
		`);

		if (!subs.length) return;

		const pushPayload = JSON.stringify({
			title: notification.title,
			body: notification.body,
			url: notification.url,
			type: notification.type,
		});

		await Promise.allSettled(
			(subs as any[]).map((sub) =>
				webpush
					.sendNotification(
						{
							endpoint: sub.endpoint,
							keys: { p256dh: sub.p256dh, auth: sub.auth },
						},
						pushPayload
					)
					.catch(async (err: any) => {
						console.error(`[Push] sendNotification 실패 (sub ${sub.id}):`, err.statusCode || err.message || err);
						if (err.statusCode === 410 || err.statusCode === 404) {
							await db.execute(sql`
								DELETE FROM push_subscriptions WHERE id = ${sub.id}
							`);
						}
					})
			)
		);
	}
}

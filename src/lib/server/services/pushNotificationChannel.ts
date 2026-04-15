import webpush from 'web-push';
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
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

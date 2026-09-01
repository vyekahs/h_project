import { getLiveEmitter } from '$lib/server/liveEvents';
import { addOnlineConnection, removeOnlineConnection } from '$lib/server/onlinePresence';
import { verifyAttendeeSession } from '$lib/server/auth';

export function GET({ request, cookies }: { request: Request; cookies: any }) {
	const sessionToken = cookies.get('user_session');

	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();
			let closed = false;
			let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

			// Verify user session
			let userId: number | null = null;
			if (sessionToken) {
				const user = await verifyAttendeeSession(sessionToken);
				if (user) userId = user.id;
			}

			if (!userId) {
				try {
					controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: 'unauthorized' })}\n\n`));
					controller.close();
				} catch {}
				return;
			}

			const emitter = getLiveEmitter();

			function send(event: string, data: any) {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
				} catch {
					cleanup();
				}
			}

			function onNotification(payload: any) {
				if (closed) return;
				if (payload.userId === userId) {
					send('notification', {
						type: payload.type,
						title: payload.title,
						body: payload.body,
						url: payload.url,
					});
				}
			}

			function onPartyChat(payload: any) {
				if (closed) return;
				if (payload.userId === userId) {
					send('party_chat', {
						partyId: payload.partyId,
						comment: payload.comment,
					});
				}
			}

			function onWtpChat(payload: any) {
				if (closed) return;
				if (payload.userId === userId) {
					send('wtp_chat', {
						wtpId: payload.wtpId,
						comment: payload.comment,
					});
				}
			}

			emitter.on('notification', onNotification);
			emitter.on('party_chat', onPartyChat);
			emitter.on('wtp_chat', onWtpChat);

			// 이 연결이 살아있는 동안 해당 유저를 "접속 중"으로 집계한다.
			addOnlineConnection(userId);

			// 연결 직후 바로 한 바이트 보내서 즉시 flush시킨다.
			// (첫 데이터가 올 때까지 브라우저의 EventSource가 open 상태로 전환되지 않고
			//  30초 하트비트 전까지 통신이 없어 보여 연결이 불안정하게 끊기는 문제 방지)
			try {
				controller.enqueue(encoder.encode(`: connected\n\n`));
			} catch {}

			heartbeatTimer = setInterval(() => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(`: ping\n\n`));
				} catch {
					cleanup();
				}
			}, 30000);

			function cleanup() {
				if (closed) return;
				closed = true;
				if (userId !== null) removeOnlineConnection(userId);
				emitter.off('notification', onNotification);
				emitter.off('party_chat', onPartyChat);
				emitter.off('wtp_chat', onWtpChat);
				if (heartbeatTimer) clearInterval(heartbeatTimer);
				try { controller.close(); } catch {}
			}

			request.signal.addEventListener('abort', cleanup);
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive'
		}
	});
}

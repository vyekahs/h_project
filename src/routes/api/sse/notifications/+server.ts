import { getLiveEmitter, addSseUser, removeSseUser } from '$lib/server/liveEvents';
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
			// 아래 콜백들이 캡처하는 값이라 좁혀진 타입을 유지하려면 상수로 받아야 한다.
			const uid: number = userId;

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

			// 이 사용자가 앱을 보고 있다고 표시한다. 알림 전송 쪽에서 이 값을 보고
			// 웹푸시를 건너뛴다 — 앱을 보고 있는데 잠금화면 알림까지 울릴 이유가 없다.
			addSseUser(uid);

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
				emitter.off('notification', onNotification);
				emitter.off('party_chat', onPartyChat);
				emitter.off('wtp_chat', onWtpChat);
				removeSseUser(uid);
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

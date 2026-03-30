import { getLiveEmitter } from '$lib/server/liveEvents';
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

			emitter.on('notification', onNotification);
			emitter.on('party_chat', onPartyChat);

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

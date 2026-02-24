import { getLiveEmitter, incrementSSECount, decrementSSECount } from '$lib/server/liveEvents';
import { getSharedData } from '$lib/server/dataCache';

async function fetchSSEData() {
	const shared = await getSharedData();
	return {
		visitors: { count: shared.attendees.length, list: shared.attendees },
		games: { count: shared.games.length, list: shared.games }
	};
}

export function GET({ request }: { request: Request }) {
	const emitter = getLiveEmitter();

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			let closed = false;
			let debounceTimer: ReturnType<typeof setTimeout> | null = null;
			let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

			incrementSSECount();

			function send(event: string, data: any) {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
				} catch {
					cleanup();
				}
			}

			async function sendAll() {
				if (closed) return;
				try {
					const data = await fetchSSEData();
					send('visitors', data.visitors);
					send('games', data.games);
				} catch (e) {
					console.error('[SSE] Failed to fetch data:', e);
				}
			}

			function onChange(type: string) {
				if (closed) return;
				if (debounceTimer) clearTimeout(debounceTimer);
				debounceTimer = setTimeout(async () => {
					if (closed) return;
					try {
						const data = await fetchSSEData();
						if (type === 'visitors') {
							send('visitors', data.visitors);
						} else if (type === 'games') {
							send('games', data.games);
						}
					} catch (e) {
						console.error('[SSE] Failed to fetch data on change:', e);
					}
				}, 500);
			}

			sendAll();

			emitter.on('change', onChange);

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
				decrementSSECount();
				emitter.off('change', onChange);
				if (debounceTimer) clearTimeout(debounceTimer);
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

import { query } from '$lib/server/db';
import { getLiveEmitter } from '$lib/server/liveEvents';

async function getVisitorData() {
	const result = await query(`
		SELECT a.id, a.name,
		       EXISTS(SELECT 1 FROM session_participants sp JOIN game_sessions gs ON sp.session_id = gs.id WHERE sp.attendee_id = a.id AND gs.status = 'playing') as is_playing
		FROM visits v
		JOIN attendees a ON v.attendee_id = a.id
		WHERE v.departure_time IS NULL
		ORDER BY v.arrival_time DESC
	`);
	return { count: result.rows.length, list: result.rows };
}

async function getGameData() {
	const result = await query(`
		SELECT gs.id, gs.game_name, gs.end_time, gs.party_id,
		       (SELECT COUNT(*) FROM session_participants sp WHERE sp.session_id = gs.id) as player_count
		FROM game_sessions gs
		WHERE gs.status = 'playing'
		ORDER BY gs.end_time ASC
	`);
	return { count: result.rows.length, list: result.rows };
}

export function GET({ request }: { request: Request }) {
	const emitter = getLiveEmitter();

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			let closed = false;
			let debounceTimer: ReturnType<typeof setTimeout> | null = null;
			let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

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
					const [visitors, games] = await Promise.all([getVisitorData(), getGameData()]);
					send('visitors', visitors);
					send('games', games);
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
						if (type === 'visitors') {
							send('visitors', await getVisitorData());
						} else if (type === 'games') {
							send('games', await getGameData());
						}
					} catch (e) {
						console.error('[SSE] Failed to fetch data on change:', e);
					}
				}, 500);
			}

			// Send initial data immediately
			sendAll();

			// Listen for changes
			emitter.on('change', onChange);

			// Heartbeat every 30 seconds (also refreshes data as fallback)
			heartbeatTimer = setInterval(() => {
				if (closed) return;
				sendAll();
			}, 30000);

			function cleanup() {
				if (closed) return;
				closed = true;
				emitter.off('change', onChange);
				if (debounceTimer) clearTimeout(debounceTimer);
				if (heartbeatTimer) clearInterval(heartbeatTimer);
				try { controller.close(); } catch {}
			}

			// Client disconnect detection
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

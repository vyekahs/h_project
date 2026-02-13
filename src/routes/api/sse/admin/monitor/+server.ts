import os from 'os';
import { pool, query } from '$lib/server/db';
import { getSSEConnectionCount, incrementSSECount, decrementSSECount } from '$lib/server/liveEvents';
import { verifyAdminSession } from '$lib/server/auth';

// CPU snapshot for delta-based usage calculation
let prevCpuIdle = 0;
let prevCpuTotal = 0;
let lastCpuUsage = 0;

function getCpuSnapshot() {
	let idle = 0;
	let total = 0;
	for (const cpu of os.cpus()) {
		const { user, nice, sys, idle: i, irq } = cpu.times;
		idle += i;
		total += user + nice + sys + i + irq;
	}
	return { idle, total };
}

function updateCpuUsage(): number {
	const snap = getCpuSnapshot();
	const idleDelta = snap.idle - prevCpuIdle;
	const totalDelta = snap.total - prevCpuTotal;
	prevCpuIdle = snap.idle;
	prevCpuTotal = snap.total;

	if (totalDelta > 0) {
		lastCpuUsage = Math.round((1 - idleDelta / totalDelta) * 100);
	}
	return lastCpuUsage;
}

// Initialize first snapshot
(() => {
	const snap = getCpuSnapshot();
	prevCpuIdle = snap.idle;
	prevCpuTotal = snap.total;
})();

function queryWithTimeout(sql: string, timeoutMs = 3000): Promise<any> {
	return Promise.race([
		query(sql),
		new Promise((_, reject) => setTimeout(() => reject(new Error('DB timeout')), timeoutMs))
	]);
}

async function collectMetrics() {
	let dbLatency = -1;
	let dbTotal = 0, dbIdle = 0, dbWaiting = 0;
	try {
		const dbStart = performance.now();
		await queryWithTimeout('SELECT 1');
		dbLatency = Math.round(performance.now() - dbStart);
		dbTotal = pool.totalCount;
		dbIdle = pool.idleCount;
		dbWaiting = pool.waitingCount;
	} catch {
		dbLatency = -1;
	}

	const mem = process.memoryUsage();
	const totalMem = os.totalmem();
	const freeMem = os.freemem();

	const io = (globalThis as any).__socketIO;
	const socketCount = io ? io.sockets.sockets.size : 0;

	return {
		cpu: {
			usage: updateCpuUsage(),
			cores: os.cpus().length
		},
		memory: {
			heapUsed: mem.heapUsed,
			heapTotal: mem.heapTotal,
			rss: mem.rss,
			external: mem.external,
			systemTotal: totalMem,
			systemFree: freeMem
		},
		db: {
			totalCount: dbTotal,
			idleCount: dbIdle,
			waitingCount: dbWaiting,
			latencyMs: dbLatency
		},
		connections: {
			socketIO: socketCount,
			sse: getSSEConnectionCount()
		},
		uptime: Math.floor(process.uptime()),
		timestamp: Date.now()
	};
}

export async function GET({ request, cookies }: { request: Request; cookies: any }) {
	const adminToken = cookies.get('admin_session');
	if (!adminToken || !(await verifyAdminSession(adminToken))) {
		return new Response('Unauthorized', { status: 401 });
	}

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			let closed = false;
			let intervalTimer: ReturnType<typeof setInterval> | null = null;

			incrementSSECount();

			function send(data: any) {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
				} catch {
					cleanup();
				}
			}

			async function pushMetrics() {
				if (closed) return;
				try {
					const metrics = await collectMetrics();
					send(metrics);
				} catch (e) {
					console.error('[Monitor SSE] Failed to collect metrics:', e);
				}
			}

			// Send initial data immediately
			pushMetrics();

			// Push metrics every 5 seconds
			intervalTimer = setInterval(pushMetrics, 5000);

			function cleanup() {
				if (closed) return;
				closed = true;
				decrementSSECount();
				if (intervalTimer) clearInterval(intervalTimer);
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

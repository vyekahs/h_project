import os from 'os';
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { getSSEConnectionCount, incrementSSECount, decrementSSECount } from '$lib/server/liveEvents';
import { verifyAdminSession } from '$lib/server/auth';
import { getAutoCheckinLogs } from '$lib/server/ble';
import { getDbConnectionStats, getStuckRequests, getAbandonedRequests } from '$lib/server/performance';

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

function queryWithTimeout(timeoutMs = 3000): Promise<any> {
	return Promise.race([
		db.execute(sql`SELECT 1`),
		new Promise((_, reject) => setTimeout(() => reject(new Error('DB timeout')), timeoutMs))
	]);
}

// Metrics history ring buffer (최근 60개 = 5분 @ 5초 간격)
interface MetricsSnapshot {
	cpu: number;
	memPercent: number;
	sse: number;
	db: number;
	timestamp: number;
}
const metricsHistory: MetricsSnapshot[] = [];
const MAX_HISTORY = 60;

async function collectMetrics() {
	let dbLatency = -1;
	let dbTotal = 0, dbIdle = 0, dbWaiting = 0;
	try {
		const dbStart = performance.now();
		await queryWithTimeout();
		dbLatency = Math.round(performance.now() - dbStart);
		const stats = await getDbConnectionStats();
		dbTotal = stats.total;
		dbIdle = stats.idle;
		dbWaiting = stats.waiting;
	} catch {
		dbLatency = -1;
	}

	const mem = process.memoryUsage();
	const totalMem = os.totalmem();
	const freeMem = os.freemem();

	const cpuUsage = updateCpuUsage();
	const sseCount = getSSEConnectionCount();
	const memPercent = Math.round(((totalMem - freeMem) / totalMem) * 100);
	const ts = Date.now();

	metricsHistory.push({ cpu: cpuUsage, memPercent, sse: sseCount, db: dbTotal, timestamp: ts });
	if (metricsHistory.length > MAX_HISTORY) metricsHistory.shift();

	return {
		cpu: {
			usage: cpuUsage,
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
			sse: sseCount
		},
		// 5초 이상 아직 안 끝난 요청 — 서버가 실제로 응답을 못 주고 있는 요청을
		// 실시간으로 잡아내기 위함 (완료된 요청만 로그하면 진짜 멈춘 요청은 안 보임)
		stuckRequests: getStuckRequests(5000),
		// 3초 이상 진행되다가 클라이언트가 끊어버린 요청 이력 — 클라이언트 쪽에서 화면이
		// 멈춰서 새로고침한 경우의 증거 (그 순간엔 위 stuckRequests에서는 빠짐)
		abandonedRequests: getAbandonedRequests(20),
		uptime: Math.floor(process.uptime()),
		timestamp: ts,
		history: metricsHistory,
		autoLogs: getAutoCheckinLogs()
	};
}

export async function GET({ request, cookies }: { request: Request; cookies: any }) {
	const adminToken = cookies.get('admin_session');
	if (!adminToken || !(await verifyAdminSession(adminToken))) {
		return new Response('Unauthorized', { status: 401 });
	}

	let cleanupFn: (() => void) | null = null;

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			let closed = false;
			let intervalTimer: ReturnType<typeof setInterval> | null = null;
			let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

			incrementSSECount();

			function send(data: string) {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(data));
				} catch {
					cleanup();
				}
			}

			function sendData(data: any) {
				send(`data: ${JSON.stringify(data)}\n\n`);
			}

			function sendHeartbeat() {
				send(': heartbeat\n\n');
			}

			async function pushMetrics() {
				if (closed) return;
				try {
					const metrics = await collectMetrics();
					sendData(metrics);
				} catch (e) {
					console.error('[Monitor SSE] Failed to collect metrics:', e);
					cleanup();
				}
			}

			pushMetrics();

			intervalTimer = setInterval(pushMetrics, 5000);

			heartbeatTimer = setInterval(sendHeartbeat, 1000);

			function cleanup() {
				if (closed) return;
				closed = true;
				decrementSSECount();
				if (intervalTimer) clearInterval(intervalTimer);
				if (heartbeatTimer) clearInterval(heartbeatTimer);
				try { controller.close(); } catch {}
			}

			cleanupFn = cleanup;
			request.signal.addEventListener('abort', cleanup);
		},
		cancel() {
			if (cleanupFn) cleanupFn();
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

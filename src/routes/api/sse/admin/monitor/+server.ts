import os from 'os';
import { getSSEConnectionCount, incrementSSECount, decrementSSECount } from '$lib/server/liveEvents';
import { verifyAdminSession } from '$lib/server/auth';
import { getAutoCheckinLogs } from '$lib/server/ble';
import { getDbHealthSnapshot, getStuckRequests, getAbandonedRequests } from '$lib/server/performance';
import { getScannerHealth } from '$lib/server/scannerHealth';

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
	// 지연 측정과 커넥션 통계를 쿼리 하나로 함께 가져온다 (getDbHealthSnapshot 주석 참고)
	// 스캐너 상태는 DB 상태와 독립이라 함께 던진다 — 순차로 하면 왕복이 두 번이다.
	const [
		{
			latency: dbLatency,
			total: dbTotal,
			idle: dbIdle,
			waiting: dbWaiting,
			dbTotal: dbAllInstances,
			maxConnections: dbMax
		},
		scanners
	] = await Promise.all([getDbHealthSnapshot(), getScannerHealth()]);

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
			latencyMs: dbLatency,
			// 이 인스턴스 풀의 상한, 그리고 블루/그린 등 다른 인스턴스까지 합친 DB 전체 커넥션
			maxCount: dbMax,
			allInstancesCount: dbAllInstances
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
		scanners,
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

			// 지표 수집이 한 번 실패했다고 스트림을 닫지 않는다.
			//
			// 예전에는 실패 즉시 cleanup()으로 스트림을 끊었다. 그러면 클라이언트가
			// 폴백 폴링(/api/admin/monitor)을 켜고 3초 뒤 재연결하는데, 이 과정에서
			// SSE와 REST가 한동안 같은 데이터를 중복으로 가져간다. DB가 잠깐
			// 느려졌을 뿐인데 모니터링 부하가 오히려 늘어나는 셈이다.
			//
			// 한 틱 건너뛰는 편이 낫다. 다음 5초에 다시 시도하면 되고, 그 사이
			// 클라이언트는 마지막 값을 그대로 보여준다. 계속 실패하면 그때는
			// 정말 무언가 잘못된 것이므로 스트림을 닫아 클라이언트가 재연결하게 한다.
			let consecutiveFailures = 0;
			const MAX_CONSECUTIVE_FAILURES = 5;

			async function pushMetrics() {
				if (closed) return;
				try {
					const metrics = await collectMetrics();
					consecutiveFailures = 0;
					sendData(metrics);
				} catch (e) {
					consecutiveFailures++;
					console.error(
						`[Monitor SSE] 지표 수집 실패 (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES} 연속):`,
						e
					);
					if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
						console.error('[Monitor SSE] 연속 실패가 이어져 스트림을 닫는다');
						cleanup();
					}
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

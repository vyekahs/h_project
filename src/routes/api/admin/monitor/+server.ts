import { json } from '@sveltejs/kit';
import os from 'os';
import { getSSEConnectionCount } from '$lib/server/liveEvents';
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

export async function GET({ cookies }: { cookies: any }) {
	const adminToken = cookies.get('admin_session');
	if (!adminToken || !(await verifyAdminSession(adminToken))) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const start = performance.now();

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

	const data = {
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
			latencyMs: dbLatency,
			// 이 인스턴스 풀의 상한, 그리고 블루/그린 등 다른 인스턴스까지 합친 DB 전체 커넥션
			maxCount: dbMax,
			allInstancesCount: dbAllInstances
		},
		connections: {
			sse: getSSEConnectionCount()
		},
		stuckRequests: getStuckRequests(5000),
		abandonedRequests: getAbandonedRequests(20),
		scanners,
		uptime: Math.floor(process.uptime()),
		responseTime: Math.round(performance.now() - start),
		timestamp: Date.now(),
		autoLogs: getAutoCheckinLogs()
	};

	return json(data);
}

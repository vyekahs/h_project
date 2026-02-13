import { json } from '@sveltejs/kit';
import os from 'os';
import { pool, query } from '$lib/server/db';
import { getSSEConnectionCount } from '$lib/server/liveEvents';
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

export async function GET({ cookies }: { cookies: any }) {
	const adminToken = cookies.get('admin_session');
	if (!adminToken || !(await verifyAdminSession(adminToken))) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const start = performance.now();

	// DB ping with timeout
	let dbLatency = -1;
	let dbTotal = 0, dbIdle = 0, dbWaiting = 0;
	try {
		const dbStart = performance.now();
		await Promise.race([
			query('SELECT 1'),
			new Promise((_, reject) => setTimeout(() => reject(new Error('DB timeout')), 3000))
		]);
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
			latencyMs: dbLatency
		},
		connections: {
			socketIO: socketCount,
			sse: getSSEConnectionCount()
		},
		uptime: Math.floor(process.uptime()),
		responseTime: Math.round(performance.now() - start),
		timestamp: Date.now()
	};

	return json(data);
}

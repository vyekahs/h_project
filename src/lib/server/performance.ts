/**
 * Server Performance Monitoring
 *
 * 서버 응답 시간, DB 쿼리, 느린 요청을 추적합니다.
 */

import { db, pgClient } from '$lib/server/db';
import { slowRequestLogs, dbPoolStats } from '$lib/server/db/schema/performance';
import type { SlowRequestLog, DbPoolStat } from '$lib/server/db/schema/performance';
import { desc, gte, sql } from 'drizzle-orm';

interface RequestMetrics {
	path: string;
	method: string;
	duration: number;
	timestamp: number;
	statusCode: number;
	userAgent?: string;
}

interface SlowQueryLog {
	query: string;
	duration: number;
	timestamp: number;
	stack?: string;
}

// 최근 요청 메트릭 (링 버퍼)
const recentRequests: RequestMetrics[] = [];
const MAX_RECENT_REQUESTS = 1000;

// 느린 요청 로그 (200ms 이상)
const slowRequests: RequestMetrics[] = [];
const MAX_SLOW_REQUESTS = 100;
const SLOW_REQUEST_THRESHOLD = 200; // ms

// 느린 DB 쿼리 로그 (50ms 이상)
const slowQueries: SlowQueryLog[] = [];
const MAX_SLOW_QUERIES = 100;
export const SLOW_QUERY_THRESHOLD = 50; // ms

// 엔드포인트별 통계
interface EndpointStats {
	path: string;
	count: number;
	totalDuration: number;
	avgDuration: number;
	maxDuration: number;
	minDuration: number;
	slowCount: number;
}

const endpointStats = new Map<string, EndpointStats>();

// 시스템 상태 요약
interface SystemHealth {
	uptime: number;
	requestCount: number;
	avgResponseTime: number;
	slowRequestRate: number;
	slowQueryCount: number;
	p95ResponseTime: number;
	p99ResponseTime: number;
}

const serverStartTime = Date.now();

/**
 * 요청 메트릭 기록
 */
export function recordRequest(metrics: RequestMetrics) {
	// 최근 요청에 추가
	recentRequests.push(metrics);
	if (recentRequests.length > MAX_RECENT_REQUESTS) {
		recentRequests.shift();
	}

	// 느린 요청 기록
	if (metrics.duration >= SLOW_REQUEST_THRESHOLD) {
		slowRequests.push(metrics);
		if (slowRequests.length > MAX_SLOW_REQUESTS) {
			slowRequests.shift();
		}
		console.warn(
			`[PERF] Slow request: ${metrics.method} ${metrics.path} took ${metrics.duration}ms`
		);

		// Async DB persistence (non-blocking)
		persistSlowRequestToDB(metrics).catch((err) => {
			console.error('[PERF] Failed to persist slow request to DB:', err);
		});
	}

	// 엔드포인트 통계 업데이트
	const key = `${metrics.method} ${metrics.path}`;
	let stats = endpointStats.get(key);

	if (!stats) {
		stats = {
			path: key,
			count: 0,
			totalDuration: 0,
			avgDuration: 0,
			maxDuration: 0,
			minDuration: Infinity,
			slowCount: 0
		};
		endpointStats.set(key, stats);
	}

	stats.count++;
	stats.totalDuration += metrics.duration;
	stats.avgDuration = stats.totalDuration / stats.count;
	stats.maxDuration = Math.max(stats.maxDuration, metrics.duration);
	stats.minDuration = Math.min(stats.minDuration, metrics.duration);
	if (metrics.duration >= SLOW_REQUEST_THRESHOLD) {
		stats.slowCount++;
	}
}

/**
 * 느린 DB 쿼리 기록
 */
export function recordSlowQuery(query: string, duration: number, stack?: string) {
	slowQueries.push({
		query: query.slice(0, 200), // 쿼리 길이 제한
		duration,
		timestamp: Date.now(),
		stack
	});

	if (slowQueries.length > MAX_SLOW_QUERIES) {
		slowQueries.shift();
	}

	console.warn(`[PERF] Slow query (${duration}ms): ${query.slice(0, 100)}...`);
}

/**
 * 시스템 상태 요약
 */
export function getSystemHealth(): SystemHealth {
	const now = Date.now();
	const uptime = now - serverStartTime;

	// 최근 1시간 데이터만 사용
	const oneHourAgo = now - 60 * 60 * 1000;
	const recentMetrics = recentRequests.filter((r) => r.timestamp > oneHourAgo);

	const totalRequests = recentMetrics.length;
	const avgResponseTime =
		totalRequests > 0
			? recentMetrics.reduce((sum, r) => sum + r.duration, 0) / totalRequests
			: 0;

	const slowCount = recentMetrics.filter((r) => r.duration >= SLOW_REQUEST_THRESHOLD).length;
	const slowRequestRate = totalRequests > 0 ? slowCount / totalRequests : 0;

	// P95, P99 계산
	const sortedDurations = recentMetrics.map((r) => r.duration).sort((a, b) => a - b);
	const p95Index = Math.floor(sortedDurations.length * 0.95);
	const p99Index = Math.floor(sortedDurations.length * 0.99);
	const p95ResponseTime = sortedDurations[p95Index] || 0;
	const p99ResponseTime = sortedDurations[p99Index] || 0;

	return {
		uptime,
		requestCount: totalRequests,
		avgResponseTime: Math.round(avgResponseTime),
		slowRequestRate: Math.round(slowRequestRate * 100),
		slowQueryCount: slowQueries.length,
		p95ResponseTime: Math.round(p95ResponseTime),
		p99ResponseTime: Math.round(p99ResponseTime)
	};
}

/**
 * 엔드포인트별 통계 (느린 순서)
 */
export function getEndpointStats(): EndpointStats[] {
	return Array.from(endpointStats.values())
		.sort((a, b) => b.avgDuration - a.avgDuration)
		.slice(0, 20); // 상위 20개
}

/**
 * 최근 느린 요청
 */
export function getSlowRequests(limit = 20): RequestMetrics[] {
	return slowRequests.slice(-limit).reverse();
}

/**
 * 최근 느린 쿼리
 */
export function getSlowQueries(limit = 20): SlowQueryLog[] {
	return slowQueries.slice(-limit).reverse();
}

/**
 * 실시간 메트릭 (최근 1분)
 */
export function getRealtimeMetrics() {
	const oneMinuteAgo = Date.now() - 60 * 1000;
	const recent = recentRequests.filter((r) => r.timestamp > oneMinuteAgo);

	return {
		requestsPerMinute: recent.length,
		avgResponseTime:
			recent.length > 0 ? Math.round(recent.reduce((sum, r) => sum + r.duration, 0) / recent.length) : 0,
		slowRequestsPerMinute: recent.filter((r) => r.duration >= SLOW_REQUEST_THRESHOLD).length
	};
}

/**
 * DB 연결 풀 상태
 */
export function getDbPoolStats() {
	try {
		// postgres.js의 연결 풀 상태
		const options = (pgClient as any).options;

		return {
			maxConnections: options?.max || 20,
			// postgres.js는 내부 통계를 직접 노출하지 않으므로 설정값만 반환
			// 실제 사용 중인 연결은 DB 쿼리로 확인해야 함
		};
	} catch (error) {
		console.error('[PERF] Failed to get DB pool stats:', error);
		return {
			maxConnections: 20,
		};
	}
}

/**
 * DB 연결 수 조회 (PostgreSQL)
 */
export async function getActiveDbConnections(): Promise<number> {
	try {
		const result = await db.execute(sql`
			SELECT count(*) as count
			FROM pg_stat_activity
			WHERE datname = current_database()
			AND state = 'active'
		`);
		return Number((result as any[])[0]?.count || 0);
	} catch (error) {
		console.error('[PERF] Failed to get active DB connections:', error);
		return 0;
	}
}

/**
 * DB 커넥션 풀 실사용 통계 (PostgreSQL pg_stat_activity 기반)
 *
 * postgres.js 클라이언트는 풀 내부 상태(open/idle/busy)를 공개 API로 노출하지 않는다
 * (이전 코드가 참조하던 pgClient.connections는 존재하지 않는 속성이라 항상 0이었음).
 * 대신 이 앱이 실제로 맺고 있는 커넥션을 DB 쪽 pg_stat_activity에서 직접 집계한다.
 * waiting은 postgres.js 풀의 대기열이 아니라, 실제로 잠금/IO 등으로 블로킹 중인
 * 백엔드 수(wait_event_type IS NOT NULL)로 정의한다 — 커넥션 풀 고갈보다
 * 락 경합을 더 정확히 드러낸다.
 */
export async function getDbConnectionStats(): Promise<{ total: number; idle: number; waiting: number }> {
	try {
		const result = await db.execute(sql`
			SELECT
				count(*)::int AS total,
				count(*) FILTER (WHERE state = 'idle')::int AS idle,
				count(*) FILTER (WHERE wait_event_type IS NOT NULL)::int AS waiting
			FROM pg_stat_activity
			WHERE datname = current_database()
		`);
		const row = (result as any[])[0] || {};
		return {
			total: Number(row.total || 0),
			idle: Number(row.idle || 0),
			waiting: Number(row.waiting || 0)
		};
	} catch (error) {
		console.error('[PERF] Failed to get DB connection stats:', error);
		return { total: 0, idle: 0, waiting: 0 };
	}
}

/**
 * 모니터링 데이터 초기화
 */
export function clearMonitoringData() {
	recentRequests.length = 0;
	slowRequests.length = 0;
	slowQueries.length = 0;
	endpointStats.clear();
}

/**
 * Persist slow request to database (async, non-blocking)
 */
async function persistSlowRequestToDB(metrics: RequestMetrics): Promise<void> {
	await db.insert(slowRequestLogs).values({
		path: metrics.path,
		method: metrics.method,
		duration: metrics.duration,
		timestamp: new Date(metrics.timestamp),
		statusCode: metrics.statusCode,
		userAgent: metrics.userAgent || null
	});
}

/**
 * Get slow requests from database (historical data)
 * @param limit Number of records to retrieve (default: 100)
 * @param sinceDate Optional timestamp to filter from (default: last 7 days)
 */
export async function getSlowRequestsFromDB(
	limit = 100,
	sinceDate?: Date
): Promise<SlowRequestLog[]> {
	const since = sinceDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

	return await db
		.select()
		.from(slowRequestLogs)
		.where(gte(slowRequestLogs.timestamp, since))
		.orderBy(desc(slowRequestLogs.timestamp))
		.limit(limit);
}

/**
 * Get aggregated statistics from slow request logs
 */
export async function getSlowRequestStats(sinceDate?: Date) {
	const since = sinceDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

	const [stats] = await db
		.select({
			total: sql<number>`count(*)`,
			avgDuration: sql<number>`avg(duration)`,
			maxDuration: sql<number>`max(duration)`,
			minDuration: sql<number>`min(duration)`
		})
		.from(slowRequestLogs)
		.where(gte(slowRequestLogs.timestamp, since));

	return {
		total: Number(stats?.total || 0),
		avgDuration: Math.round(Number(stats?.avgDuration || 0)),
		maxDuration: Number(stats?.maxDuration || 0),
		minDuration: Number(stats?.minDuration || 0)
	};
}

/**
 * Get slowest endpoints from database
 */
export async function getSlowestEndpointsFromDB(limit = 20) {
	const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

	const results = await db
		.select({
			path: slowRequestLogs.path,
			method: slowRequestLogs.method,
			count: sql<number>`count(*)`,
			avgDuration: sql<number>`avg(${slowRequestLogs.duration})`,
			maxDuration: sql<number>`max(${slowRequestLogs.duration})`
		})
		.from(slowRequestLogs)
		.where(gte(slowRequestLogs.timestamp, sevenDaysAgo))
		.groupBy(slowRequestLogs.path, slowRequestLogs.method)
		.orderBy(desc(sql<number>`avg(${slowRequestLogs.duration})`))
		.limit(limit);

	return results.map((r) => ({
		path: `${r.method} ${r.path}`,
		count: Number(r.count),
		avgDuration: Math.round(Number(r.avgDuration)),
		maxDuration: Number(r.maxDuration)
	}));
}

/**
 * Record DB pool stats to database (high utilization only)
 * Records when utilization >= 70% to track potential connection issues
 */
export async function recordDbPoolStats(
	activeConnections: number,
	maxConnections: number
): Promise<void> {
	const utilizationPercent = Math.round((activeConnections / maxConnections) * 100);

	// Only record when utilization is concerning (≥70%)
	if (utilizationPercent >= 70) {
		try {
			await db.insert(dbPoolStats).values({
				activeConnections,
				maxConnections,
				utilizationPercent,
				timestamp: new Date()
			});
			console.warn(
				`[PERF] High DB pool utilization: ${utilizationPercent}% (${activeConnections}/${maxConnections})`
			);
		} catch (error) {
			console.error('[PERF] Failed to record DB pool stats:', error);
		}
	}
}

/**
 * Get DB pool statistics from database (historical data)
 * @param limit Number of records to retrieve (default: 100)
 * @param sinceDate Optional timestamp to filter from (default: last 7 days)
 */
export async function getDbPoolStatsFromDB(
	limit = 100,
	sinceDate?: Date
): Promise<DbPoolStat[]> {
	const since = sinceDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

	return await db
		.select()
		.from(dbPoolStats)
		.where(gte(dbPoolStats.timestamp, since))
		.orderBy(desc(dbPoolStats.timestamp))
		.limit(limit);
}

/**
 * Get aggregated DB pool statistics
 */
export async function getDbPoolStatsAggregated(sinceDate?: Date) {
	const since = sinceDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

	const [stats] = await db
		.select({
			total: sql<number>`count(*)`,
			avgUtilization: sql<number>`avg(utilization_percent)`,
			maxUtilization: sql<number>`max(utilization_percent)`,
			peakConnections: sql<number>`max(active_connections)`
		})
		.from(dbPoolStats)
		.where(gte(dbPoolStats.timestamp, since));

	return {
		total: Number(stats?.total || 0),
		avgUtilization: Math.round(Number(stats?.avgUtilization || 0)),
		maxUtilization: Number(stats?.maxUtilization || 0),
		peakConnections: Number(stats?.peakConnections || 0)
	};
}

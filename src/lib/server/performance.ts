/**
 * Server Performance Monitoring
 *
 * 서버 응답 시간, DB 쿼리, 느린 요청을 추적합니다.
 */

import { db, pgClient, APP_INSTANCE_NAME, MAX_POOL_CONNECTIONS } from '$lib/server/db';
import { slowRequestLogs, dbPoolStats } from '$lib/server/db/schema/performance';
import type { SlowRequestLog, DbPoolStat } from '$lib/server/db/schema/performance';
import { desc, gte, lt, sql } from 'drizzle-orm';

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

// 진행 중인 요청 추적 — 요청 "완료" 시점에만 기록하면 아예 끝나지 않고
// 멈춰버린(진짜 행) 요청은 로그에 전혀 안 남는다. 시작 시점에 등록해뒀다가
// 끝나면 지우는 방식으로, 지금 이 순간 오래 걸리고 있는 요청을 실시간으로 볼 수 있게 한다.
//
// 주의: 유저가 새로고침/뒤로가기 등으로 응답을 기다리지 않고 나가버린 요청도
// 서버는 (abort 신호를 직접 넘겨서 취소시키지 않는 한) 하던 작업을 끝까지 계속한다.
// 이런 건 "진짜 멈춤"이 아니라 그냥 응답받을 사람이 없어진 낭비 작업이므로,
// clientAborted로 구분해서 경고 대상에서 제외한다.
interface InFlightRequest {
	path: string;
	method: string;
	startTime: number;
	clientAborted: boolean;
}
const inFlightRequests = new Map<string, InFlightRequest>();

export function recordRequestStart(id: string, path: string, method: string) {
	inFlightRequests.set(id, { path, method, startTime: Date.now(), clientAborted: false });
}

// 일정 시간(ABANDONED_MIN_AGE) 이상 진행되다가 클라이언트가 끊어버린 요청의 이력.
// 클라이언트 쪽에서 화면이 멈춰서 새로고침/재접속한 경우, 그 순간엔 이미 abort되어
// "지금 멈춘 요청" 목록에서는 빠지지만 — 그게 바로 그 프리징의 증거이므로 별도로 남겨둔다.
interface AbandonedRequest {
	path: string;
	method: string;
	ranForMs: number;
	timestamp: number;
}
const abandonedRequests: AbandonedRequest[] = [];
const MAX_ABANDONED = 50;
const ABANDONED_MIN_AGE = 3000;

export function markRequestAborted(id: string) {
	const r = inFlightRequests.get(id);
	if (!r || r.clientAborted) return;
	r.clientAborted = true;

	const ranForMs = Date.now() - r.startTime;
	if (ranForMs >= ABANDONED_MIN_AGE) {
		abandonedRequests.push({ path: r.path, method: r.method, ranForMs, timestamp: Date.now() });
		if (abandonedRequests.length > MAX_ABANDONED) abandonedRequests.shift();
	}
}

/**
 * 최근 "오래 진행되다가 클라이언트가 끊어버린" 요청 이력 (최신순)
 */
export function getAbandonedRequests(limit = 20) {
	return abandonedRequests.slice(-limit).reverse();
}

export function recordRequestEnd(id: string) {
	inFlightRequests.delete(id);
}

/**
 * minAgeMs 이상 진행 중인 요청 목록 (오래된 순).
 * clientAborted=true(유저가 이미 나간 요청)는 실제 프리징 신호가 아니므로 제외한다.
 */
export function getStuckRequests(minAgeMs = 5000) {
	const now = Date.now();
	return Array.from(inFlightRequests.entries())
		.map(([id, r]) => ({ id, path: r.path, method: r.method, ageMs: now - r.startTime, clientAborted: r.clientAborted }))
		.filter((r) => r.ageMs >= minAgeMs && !r.clientAborted)
		.sort((a, b) => b.ageMs - a.ageMs);
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
			maxConnections: options?.max || MAX_POOL_CONNECTIONS,
			// postgres.js는 내부 통계를 직접 노출하지 않으므로 설정값만 반환
			// 실제 사용 중인 연결은 DB 쿼리로 확인해야 함
		};
	} catch (error) {
		console.error('[PERF] Failed to get DB pool stats:', error);
		return {
			maxConnections: MAX_POOL_CONNECTIONS,
		};
	}
}

/**
 * DB 연결 수 조회 (PostgreSQL)
 */
export async function getActiveDbConnections(): Promise<number> {
	try {
		// application_name으로 이 인스턴스의 커넥션만 센다.
		// datname으로만 세면 블루/그린 두 인스턴스가 합산되어, 자기 풀 상한(20)과
		// 비교하는 utilization이 100%를 넘는 값(실측 최대 40/20 = 200%)이 나온다.
		const result = await db.execute(sql`
			SELECT count(*) as count
			FROM pg_stat_activity
			WHERE datname = current_database()
			AND application_name = ${APP_INSTANCE_NAME}
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
 *
 * waiting은 postgres.js 풀의 대기열이 아니라, 실제로 잠금/IO 등으로 블로킹 중인
 * 백엔드 수를 뜻한다. 주의: idle 커넥션도 클라이언트의 다음 쿼리를 기다리는 동안
 * wait_event_type = 'Client'로 표시되므로, 이를 waiting으로 잘못 세지 않도록
 * state = 'active'이면서 'Client'가 아닌 이벤트(Lock/IO/IPC 등)로 막힌 경우만 센다.
 */
export async function getDbConnectionStats(): Promise<{
	total: number;
	idle: number;
	waiting: number;
	dbTotal: number;
	maxConnections: number;
}> {
	try {
		// total/idle/waiting은 "이 인스턴스의 풀"만 집계한다 — 상한(max)과 비교되는 값이므로
		// 범위가 같아야 한다. dbTotal은 블루/그린 등 다른 인스턴스까지 포함한 DB 전체 수치.
		const result = await db.execute(sql`
			SELECT
				count(*) FILTER (WHERE application_name = ${APP_INSTANCE_NAME})::int AS total,
				count(*) FILTER (WHERE application_name = ${APP_INSTANCE_NAME} AND state = 'idle')::int AS idle,
				count(*) FILTER (
					WHERE application_name = ${APP_INSTANCE_NAME}
					  AND state = 'active'
					  AND wait_event_type IS NOT NULL
					  AND wait_event_type <> 'Client'
				)::int AS waiting,
				count(*)::int AS db_total
			FROM pg_stat_activity
			WHERE datname = current_database()
		`);
		const row = (result as any[])[0] || {};
		return {
			total: Number(row.total || 0),
			idle: Number(row.idle || 0),
			waiting: Number(row.waiting || 0),
			dbTotal: Number(row.db_total || 0),
			maxConnections: MAX_POOL_CONNECTIONS
		};
	} catch (error) {
		console.error('[PERF] Failed to get DB connection stats:', error);
		return { total: 0, idle: 0, waiting: 0, dbTotal: 0, maxConnections: MAX_POOL_CONNECTIONS };
	}
}

/**
 * 모니터링 테이블 보존 정리.
 *
 * db_pool_stats와 slow_request_logs는 계속 쌓기만 하고 지우는 코드가 없었다
 * (실측: db_pool_stats 17,712행 / 약 5개월치). 오래된 기록은 진단 가치가 없으므로
 * 보존 기간을 넘긴 행을 지운다.
 */
export async function pruneMonitoringData(retentionDays = 30): Promise<void> {
	try {
		const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
		// db.execute(sql`... < ${cutoff}`)로 Date를 raw SQL 파라미터에 직접 넣으면
		// postgres.js의 Bind 단계가 문자열/Buffer만 받아들여 TypeError가 난다.
		// 쿼리 빌더(.where(lt(...)))는 drizzle이 컬럼 타입에 맞춰 직렬화하므로 안전하다.
		const [pool, slow] = await Promise.all([
			db.delete(dbPoolStats).where(lt(dbPoolStats.timestamp, cutoff)),
			db.delete(slowRequestLogs).where(lt(slowRequestLogs.timestamp, cutoff))
		]);
		const poolCount = (pool as any)?.count ?? 0;
		const slowCount = (slow as any)?.count ?? 0;
		if (poolCount > 0 || slowCount > 0) {
			console.log(
				`[PERF] 모니터링 데이터 정리 (${retentionDays}일 초과): db_pool_stats ${poolCount}행, slow_request_logs ${slowCount}행 삭제`
			);
		}
	} catch (error) {
		console.error('[PERF] Failed to prune monitoring data:', error);
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

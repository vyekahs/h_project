import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';

/**
 * 데이터 보존 정리.
 *
 * 이 프로젝트에는 계속 쌓기만 하고 지우는 코드가 없는 테이블이 여럿 있었다.
 * 지금 규모에서는 용량이 문제가 아니지만, 방치하면 조회가 느려지고 백업이 커지며
 * 무엇보다 "언제부터 이상했나"를 볼 때 잡음이 늘어난다.
 *
 * 보존 기간은 "그 데이터를 실제로 읽는 쿼리가 얼마나 과거를 보는가"를 기준으로
 * 정했다. 아무도 안 보는 기간까지 들고 있을 이유가 없다.
 */

interface PruneResult {
	label: string;
	deleted: number;
}

function deletedCount(res: unknown): number {
	return Number((res as any)?.count ?? 0);
}

async function prune(label: string, run: () => Promise<unknown>): Promise<PruneResult> {
	try {
		return { label, deleted: deletedCount(await run()) };
	} catch (e) {
		console.error(`[RETENTION] ${label} 정리 실패:`, e);
		return { label, deleted: 0 };
	}
}

export async function runDataRetention(): Promise<void> {
	const now = Date.now();
	const daysAgo = (d: number) => new Date(now - d * 24 * 60 * 60 * 1000);

	// 각 항목을 개별 try/catch로 감싼다. 하나가 실패해도 나머지는 정리되도록.
	const results = await Promise.all([
		// --- 모니터링 (진단용, 최근 것만 의미 있음) ---
		prune('db_pool_stats', () =>
			db.execute(sql`DELETE FROM db_pool_stats WHERE timestamp < ${daysAgo(30)}`)
		),
		prune('slow_request_logs', () =>
			db.execute(sql`DELETE FROM slow_request_logs WHERE timestamp < ${daysAgo(30)}`)
		),

		// 자동 체크아웃 이력은 길게 남긴다. 하루 몇 건 수준이라 용량 부담이 없고,
		// "몇 주 전부터 이상했다" 같은 문의를 사후에 확인하려면 기간이 길어야 한다.
		prune('auto_checkout_logs', () =>
			db.execute(sql`DELETE FROM auto_checkout_logs WHERE checked_out_at < ${daysAgo(180)}`)
		),

		// --- 만료 세션 ---
		// 만료된 세션은 인증에 쓰이지 않으므로 남길 이유가 전혀 없다.
		// (실측: admin_sessions 350건 중 343건이 만료 상태로 방치돼 있었다)
		prune('admin_sessions(만료)', () =>
			db.execute(sql`DELETE FROM admin_sessions WHERE expires_at < NOW()`)
		),
		prune('attendee_sessions(만료)', () =>
			db.execute(sql`DELETE FROM attendee_sessions WHERE expires_at < NOW()`)
		),

		// --- 알림 ---
		// 읽은 알림만 지운다. 안 읽은 것은 오래됐어도 사용자가 아직 확인하지 않은
		// 내용이므로 임의로 없애지 않는다.
		// 목록은 최근 20건만 보여주므로(getNotifications) 90일이면 충분히 여유롭다.
		prune('notifications(읽음)', () =>
			db.execute(
				sql`DELETE FROM notifications WHERE is_read = true AND created_at < ${daysAgo(90)}`
			)
		),

		// --- 미니게임 플레이 로그 ---
		// 이 테이블을 읽는 쿼리는 최대 1개월까지만 본다:
		//   - 활동 피드: ORDER BY played_at DESC LIMIT n (최근 것만)
		//   - getPopularGames(): 최근 1개월
		// 실제 랭킹은 minigame_rankings / minigame_monthly_rankings에 따로 집계돼
		// 있으므로 이 로그를 지워도 순위가 바뀌지 않는다.
		// 조회 범위(1개월)의 6배를 남겨 여유를 둔다.
		prune('minigame_play_log', () =>
			db.execute(sql`DELETE FROM minigame_play_log WHERE played_at < ${daysAgo(180)}`)
		),

		// --- 죽은 스캐너 ---
		// 오래 전에 없어진 기기가 관리자 화면에 계속 남아 혼란을 준다
		// (실측: test_routing, esp32_s3_wifi 등이 3월 이후 무응답인 채 남아 있었다).
		// 기기가 다시 살아나면 첫 보고에서 행이 자동으로 다시 생기므로 안전하다
		// (scanners를 참조하는 외래키도 없다).
		prune('scanners(장기 무응답)', () =>
			db.execute(sql`DELETE FROM scanners WHERE last_seen_at < ${daysAgo(30)}`)
		)
	]);

	const changed = results.filter((r) => r.deleted > 0);
	if (changed.length > 0) {
		console.log(
			`[RETENTION] 정리 완료 — ${changed.map((r) => `${r.label} ${r.deleted}행`).join(', ')}`
		);
	}
}

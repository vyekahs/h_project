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

/**
 * 미니게임 플레이 로그를 월별로 압축한 뒤 오래된 원본을 지운다.
 *
 * 반드시 "집계 → 삭제" 순서로, 그리고 한 트랜잭션 안에서 수행한다.
 * 중간에 실패해서 삭제만 되고 집계가 없으면 기록이 영영 사라진다.
 *
 * 삭제는 '월 단위'로만 한다(날짜 기준이 아니라 월초 기준). 월 중간을 잘라내면
 * 그 달의 집계가 남은 일부만으로 다시 계산되면서 실제보다 작은 값으로 덮어써진다.
 * 월 전체를 지우면 그 달은 다음 집계의 SELECT 결과에 아예 나타나지 않으므로,
 * 이미 저장된 집계 행이 그대로 보존된다.
 */
async function compactMinigamePlayLog(retainMonths: number): Promise<PruneResult> {
	try {
		let deleted = 0;
		await db.transaction(async (tx) => {
			// 1) '완결된 달'만 집계한다. 이번 달은 제외 — 이 표는 지난 기록을 보기 위한
			//    것이고, 진행 중인 달이 완결된 달처럼 섞여 있으면 오해를 부른다
			//    (이번 달이 궁금하면 원본이 아직 남아 있으니 그쪽을 보면 된다).
			//    원본이 이미 지워진 달은 이 SELECT에 안 나오므로 기존 집계가 유지된다.
			//
			//    값이 실제로 달라졌을 때만 UPDATE한다(DO UPDATE ... WHERE). 완결된 달은
			//    두 번째 집계부터 값이 같으므로, 작업이 여러 번 돌아도 쓰기가 발생하지 않는다.
			await tx.execute(sql`
				INSERT INTO minigame_monthly_play_stats
					(month_key, game_id, difficulty, user_id,
					 start_count, clear_count, best_score, best_clear_time, last_played_at, aggregated_at)
				SELECT
					to_char(played_at, 'YYYY-MM'),
					game_id,
					COALESCE(difficulty, ''),
					user_id,
					count(*) FILTER (WHERE type = 'start'),
					count(*) FILTER (WHERE type = 'clear'),
					max(score) FILTER (WHERE type = 'clear'),
					min(clear_time) FILTER (WHERE type = 'clear' AND clear_time > 0),
					max(played_at),
					NOW()
				FROM minigame_play_log
				WHERE played_at < date_trunc('month', NOW())
				GROUP BY 1, 2, 3, 4
				ON CONFLICT (month_key, game_id, difficulty, user_id) DO UPDATE SET
					start_count     = EXCLUDED.start_count,
					clear_count     = EXCLUDED.clear_count,
					best_score      = EXCLUDED.best_score,
					best_clear_time = EXCLUDED.best_clear_time,
					last_played_at  = EXCLUDED.last_played_at,
					aggregated_at   = NOW()
				WHERE minigame_monthly_play_stats.start_count     IS DISTINCT FROM EXCLUDED.start_count
				   OR minigame_monthly_play_stats.clear_count     IS DISTINCT FROM EXCLUDED.clear_count
				   OR minigame_monthly_play_stats.best_score      IS DISTINCT FROM EXCLUDED.best_score
				   OR minigame_monthly_play_stats.best_clear_time IS DISTINCT FROM EXCLUDED.best_clear_time
				   OR minigame_monthly_play_stats.last_played_at  IS DISTINCT FROM EXCLUDED.last_played_at
			`);

			// 2) 보존 기간을 넘긴 '완결된 달'의 원본만 삭제
			const res = await tx.execute(sql`
				DELETE FROM minigame_play_log
				WHERE played_at < date_trunc('month', NOW()) - (${retainMonths} || ' months')::interval
			`);
			deleted = deletedCount(res);
		});
		return { label: 'minigame_play_log(집계 후 삭제)', deleted };
	} catch (e) {
		console.error('[RETENTION] minigame_play_log 압축 실패:', e);
		return { label: 'minigame_play_log(집계 후 삭제)', deleted: 0 };
	}
}

export async function runDataRetention(): Promise<void> {
	const now = Date.now();
	const daysAgo = (d: number) => new Date(now - d * 24 * 60 * 60 * 1000);

	// 플레이 로그는 집계가 선행되어야 하므로 아래 병렬 정리와 분리해 먼저 처리한다.
	// 이 테이블을 읽는 쿼리는 최대 1개월까지만 보지만(활동 피드, getPopularGames),
	// 여유를 두어 6개월치 원본을 남긴다.
	const playLogResult = await compactMinigamePlayLog(6);

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

		// --- 죽은 스캐너 ---
		// 오래 전에 없어진 기기가 관리자 화면에 계속 남아 혼란을 준다
		// (실측: test_routing, esp32_s3_wifi 등이 3월 이후 무응답인 채 남아 있었다).
		// 기기가 다시 살아나면 첫 보고에서 행이 자동으로 다시 생기므로 안전하다
		// (scanners를 참조하는 외래키도 없다).
		prune('scanners(장기 무응답)', () =>
			db.execute(sql`DELETE FROM scanners WHERE last_seen_at < ${daysAgo(30)}`)
		)
	]);

	const changed = [playLogResult, ...results].filter((r) => r.deleted > 0);
	if (changed.length > 0) {
		console.log(
			`[RETENTION] 정리 완료 — ${changed.map((r) => `${r.label} ${r.deleted}행`).join(', ')}`
		);
	}
}

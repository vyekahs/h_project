import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';

/**
 * 예약 생성 폼에서 넘어온 gameId를 검증해 실제로 저장할 game_id를 정한다.
 *
 * 게임 이름 입력은 자유 입력이면서 등록된 게임 드롭다운도 겸한다. 드롭다운에서
 * 고르면 클라이언트가 id를 채우고, 이름을 직접 고치면 id를 비운다.
 *
 * 다만 클라이언트가 보낸 id를 그대로 믿으면 game_id와 game_name이 서로 다른
 * 게임을 가리킬 수 있다(예: "글룸헤이븐"을 고른 뒤 "글룸헤이븐 확장판"으로 수정).
 * game_id에 FK가 걸려 있어 없는 id는 에러가 나지만, "존재하지만 이름이 다른 id"는
 * 조용히 저장돼 더 나쁘다. 그래서 이름이 실제로 일치할 때만 id를 살린다.
 *
 * 게임 생성은 드문 동작이라 검증 쿼리 1회 비용은 데이터 정합성 대비 충분히 싸다.
 */
export async function resolveGameId(
	rawGameId: string | null | undefined,
	gameName: string | null | undefined
): Promise<number | null> {
	if (!rawGameId || !gameName) return null;

	const id = Number.parseInt(rawGameId, 10);
	if (!Number.isInteger(id) || id <= 0) return null;

	const res = await db.execute(sql`SELECT name FROM games WHERE id = ${id}`);
	if (res.length === 0) return null;

	return (res[0] as any).name === gameName ? id : null;
}

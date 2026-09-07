
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { load } from './+page.server';
import { db } from '$lib/server/db/index';

// Mock DB
vi.mock('$lib/server/db/index', () => ({
    db: { execute: vi.fn() }
}));

/**
 * drizzle의 sql`` 은 문자열이 아니라 SQL 객체를 만든다.
 * 문자 조각만 이어 붙여 쿼리 본문을 확인한다.
 */
function sqlText(query: any): string {
    return (query?.queryChunks ?? [])
        .map((chunk: any) => (Array.isArray(chunk?.value) ? chunk.value.join('') : ''))
        .join(' ');
}

describe('Rankings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should load rankings with correct queries', async () => {
        (db.execute as any).mockResolvedValueOnce([]); // overallRankings
        (db.execute as any).mockResolvedValueOnce([]); // winRateRankings
        (db.execute as any).mockResolvedValueOnce([]); // gameTitles

        const result = await load({} as any);

        expect(result).toEqual({
            overallRankings: [],
            winRateRankings: [],
            gameTitles: []
        });

        expect(db.execute).toHaveBeenCalledTimes(3);

        const calls = (db.execute as any).mock.calls;

        // 세 랭킹 모두 플레이타임 0인 게임은 제외한다
        expect(sqlText(calls[0][0])).toContain('g.playtime_min > 0');
        expect(sqlText(calls[1][0])).toContain('g.playtime_min > 0');
        expect(sqlText(calls[2][0])).toContain('g.playtime_min > 0');
    });

    it('승률 분모에서 승자가 기록되지 않은 판을 제외한다', async () => {
        // 승자 기록은 선택이라 아무도 승자로 표시되지 않은 채 끝난 판이 많다.
        // 그 판을 분모에 넣으면 참가자 전원의 패배로 계산돼 승률이 실제보다 낮아진다.
        (db.execute as any).mockResolvedValue([]);

        await load({} as any);

        const winRateQuery = sqlText((db.execute as any).mock.calls[1][0]);
        expect(winRateQuery).toContain('w.is_winner = true');
        expect(winRateQuery).toMatch(/EXISTS\s*\(/);
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { load } from './+page.server';
import { db } from '$lib/server/db/index';

/* db.execute는 행 배열을 돌려준다. { rows: [] } 로 감싸던 목이 실제
   반환 형태와 달라 로더가 배열 메서드를 못 찾고 터졌다.
   질의는 3개 Promise.all: ① 요약 ② 시간대별 재실 + 요일별 ③ 사람·게임. */
vi.mock('$lib/server/db/index', () => ({
    db: { execute: vi.fn() }
}));

const SUMMARY = {
    from_d: '2026-08-13',
    today_d: '2026-09-09',
    open_days: 12,
    window_visits: 140,
    avg_stay: 205,
    stay_samples: 130,
    active_users: 7,
    total_members: 40,
    season_pass_users: 3,
    total_visits_all: 900,
    peak_day: '2026-09-08',
    peak_day_count: 9
};

describe('Admin Stats', () => {
    beforeEach(() => vi.clearAllMocks());

    it('운영 판단에 쓰는 모양으로 돌려준다', async () => {
        (db.execute as any)
            .mockResolvedValueOnce([SUMMARY])
            .mockResolvedValueOnce([
                { kind: 'hour', k: '15', n: 60, avg: '5.0' },
                { kind: 'hour', k: '22', n: 51, avg: '4.3' },
                { kind: 'dow', k: '2', n: 40, avg: '8.0' }
            ])
            .mockResolvedValueOnce([
                { kind: 'game', name: '글룸헤이븐', n: 5, meta: null },
                { kind: 'visitor', name: '아랭', n: 9, meta: null },
                { kind: 'lapsed', name: '지훈', n: 35, meta: '2026-08-05' },
                { kind: 'expiring', name: '소영', n: 3, meta: '2026-09-12' }
            ]);

        const result = (await load({} as any)) as any;

        expect(db.execute).toHaveBeenCalledTimes(3);
        expect(result.loadError).toBe(false);

        // 「지금 방에 N명」은 이 페이지의 것이 아니다 — 실시간은 어드민 메인의 일이고,
        // 두 화면이 같은 것을 각자 세면 언젠가 서로 다른 수를 말한다.
        expect(result.now).toBeUndefined();

        expect(result.window).toMatchObject({
            from: '2026-08-13', to: '2026-09-09', days: 28,
            openDays: 12, dayStartHour: 6, maxStayHours: 18
        });
        // 문 연 날이 8일 이상이어야 요일 패턴을 말한다 — 3일치로 「화요일이 붐빈다」는 거짓말이다
        expect(result.window.dowReady).toBe(true);

        // 값은 합계가 아니라 평균이고, 붐비는 순으로 온다 — 화면이 상위 몇 개만 문장으로 쓴다
        expect(result.hourly[0]).toEqual({ hour: 15, count: 60, avg: 5.0 });
        expect(result.hourly[1]).toEqual({ hour: 22, count: 51, avg: 4.3 });

        // 요일은 기록이 없는 요일까지 7칸을 채운다
        expect(result.byDow).toHaveLength(7);
        expect(result.byDow[2]).toEqual({ dow: 2, count: 40, avg: 8.0 });
        expect(result.byDow[0]).toEqual({ dow: 0, count: 0, avg: 0 });

        expect(result.popularGames).toEqual([{ name: '글룸헤이븐', n: 5, meta: null }]);
        expect(result.topVisitors).toEqual([{ name: '아랭', n: 9, meta: null }]);
        expect(result.lapsed).toEqual([{ name: '지훈', n: 35, meta: '2026-08-05' }]);
        expect(result.expiring).toEqual([{ name: '소영', n: 3, meta: '2026-09-12' }]);

        expect(result.summary).toMatchObject({
            windowVisits: 140, avgStay: 205, staySamples: 130,
            activeUsers: 7, totalMembers: 40, seasonPassUsers: 3,
            totalVisitsAllTime: 900, peakDay: '2026-09-08', peakDayCount: 9
        });
    });

    it('표본이 얇으면 요일 패턴을 말하지 않는다', async () => {
        (db.execute as any)
            .mockResolvedValueOnce([{ ...SUMMARY, open_days: 3 }])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        const result = (await load({} as any)) as any;

        expect(result.window.openDays).toBe(3);
        expect(result.window.dowReady).toBe(false);
        expect(result.byDow).toHaveLength(7);
        expect(result.hourly).toEqual([]);
        expect(result.lapsed).toEqual([]);
        expect(result.expiring).toEqual([]);
    });

    it('질의가 실패해도 500 대신 화면이 뜬다', async () => {
        (db.execute as any).mockRejectedValue(new Error('connection terminated'));
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = (await load({} as any)) as any;

        expect(result.loadError).toBe(true);
        expect(result.byDow).toHaveLength(7);
        expect(result.hourly).toEqual([]);
        expect(result.summary.totalMembers).toBe(0);
        expect(result.window.openDays).toBe(0);
        spy.mockRestore();
    });
});

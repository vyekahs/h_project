import { describe, it, expect, vi, beforeEach } from 'vitest';
import { load } from './+page.server';
import { db } from '$lib/server/db/index';

/* db.execute는 행 배열을 돌려준다. { rows: [] } 로 감싸던 목이 실제
   반환 형태와 달라 로더가 배열 메서드를 못 찾고 터졌다.
   질의 개수도 7개에서 11개로 늘어난 뒤 갱신되지 않았다. */
vi.mock('$lib/server/db/index', () => ({
    db: { execute: vi.fn() }
}));

describe('Admin Stats', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should load all stats correctly', async () => {
        (db.execute as any)
            .mockResolvedValueOnce([{ count: 100 }])                 // 1 totalVisits
            .mockResolvedValueOnce([{ count: 50 }])                  // 2 totalMembers
            .mockResolvedValueOnce([{ avg_minutes: 120 }])           // 3 avgDuration
            .mockResolvedValueOnce([])                               // 4 dailyTrend
            .mockResolvedValueOnce([])                               // 5 monthlyTrend
            .mockResolvedValueOnce([{ hour: 14, count: 5 }])         // 6 peakHours
            .mockResolvedValueOnce([])                               // 7 popularGames
            .mockResolvedValueOnce([{ avg_weekly: '2.5' }])          // 8 avgWeekly
            .mockResolvedValueOnce([{ avg_monthly: '9' }])           // 9 avgMonthly
            .mockResolvedValueOnce([])                               // 10 topVisitors
            .mockResolvedValueOnce([                                 // 11 activeUsers
                { active_users: '7', total_users: '40', season_pass_users: '3' }
            ]);

        const result = (await load({} as any)) as any;

        expect(result.kpis).toEqual({
            totalVisits: 100,
            totalMembers: 50,
            avgDuration: 120
        });

        // 시간대는 기록이 없는 시간까지 0으로 채워 24칸을 만든다
        expect(result.peakHours).toHaveLength(24);
        expect(result.peakHours[14]).toEqual({ hour: 14, count: 5 });
        expect(result.peakHours[0]).toEqual({ hour: 0, count: 0 });

        expect(result.userStats).toEqual({
            avgWeeklyVisits: 2.5,
            avgMonthlyVisits: 9,
            activeUsers: 7,
            totalUsers: 40,
            seasonPassUsers: 3,
            topVisitors: []
        });

        expect(db.execute).toHaveBeenCalledTimes(11);
    });
});


import { describe, it, expect, vi, beforeEach } from 'vitest';
import { load } from './+page.server';
import { db } from '$lib/server/db/index';

// Mock DB
vi.mock('$lib/server/db/index', () => ({
    db: { execute: vi.fn() }
}));

describe('Admin Stats', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should load all stats correctly', async () => {
        // Mock responses for all queries
        (db.execute as any).mockResolvedValueOnce({ rows: [{ count: 100 }] }); // totalVisits
        (db.execute as any).mockResolvedValueOnce({ rows: [{ count: 50 }] }); // totalMembers
        (db.execute as any).mockResolvedValueOnce({ rows: [{ avg_minutes: 120 }] }); // avgDuration
        (db.execute as any).mockResolvedValueOnce({ rows: [] }); // dailyTrend
        (db.execute as any).mockResolvedValueOnce({ rows: [] }); // monthlyTrend
        (db.execute as any).mockResolvedValueOnce({ rows: [{ hour: 14, count: 5 }] }); // peakHours
        (db.execute as any).mockResolvedValueOnce({ rows: [] }); // popularGames

        const result = await load({} as any) as any;

        expect(result.kpis).toEqual({
            totalVisits: 100,
            totalMembers: 50,
            avgDuration: 120
        });

        // Check peak hours processing (should fill 0-23)
        expect(result.peakHours).toHaveLength(24);
        expect(result.peakHours[14]).toEqual({ hour: 14, count: 5 });
        expect(result.peakHours[0]).toEqual({ hour: 0, count: 0 });

        expect(db.execute).toHaveBeenCalledTimes(7);
    });
});

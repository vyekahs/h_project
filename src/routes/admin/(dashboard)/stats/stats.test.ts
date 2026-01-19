
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { load } from './+page.server';
import { query } from '$lib/server/db';

// Mock DB
vi.mock('$lib/server/db', () => ({
    query: vi.fn()
}));

describe('Admin Stats', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should load all stats correctly', async () => {
        // Mock responses for all queries
        (query as any).mockResolvedValueOnce({ rows: [{ count: 100 }] }); // totalVisits
        (query as any).mockResolvedValueOnce({ rows: [{ count: 50 }] }); // totalMembers
        (query as any).mockResolvedValueOnce({ rows: [{ avg_minutes: 120 }] }); // avgDuration
        (query as any).mockResolvedValueOnce({ rows: [] }); // dailyTrend
        (query as any).mockResolvedValueOnce({ rows: [] }); // monthlyTrend
        (query as any).mockResolvedValueOnce({ rows: [{ hour: 14, count: 5 }] }); // peakHours
        (query as any).mockResolvedValueOnce({ rows: [] }); // popularGames

        const result = await load({} as any);

        expect(result.kpis).toEqual({
            totalVisits: 100,
            totalMembers: 50,
            avgDuration: 120
        });

        // Check peak hours processing (should fill 0-23)
        expect(result.peakHours).toHaveLength(24);
        expect(result.peakHours[14]).toEqual({ hour: 14, count: 5 });
        expect(result.peakHours[0]).toEqual({ hour: 0, count: 0 });

        expect(query).toHaveBeenCalledTimes(7);
    });
});

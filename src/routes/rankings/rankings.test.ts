
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { load } from './+page.server';
import { query } from '$lib/server/db';

// Mock DB
vi.mock('$lib/server/db', () => ({
    query: vi.fn()
}));

describe('Rankings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should load rankings with correct queries', async () => {
        // Mock DB responses
        (query as any).mockResolvedValueOnce({ rows: [] }); // overallRankings
        (query as any).mockResolvedValueOnce({ rows: [] }); // winRateRankings
        (query as any).mockResolvedValueOnce({ rows: [] }); // gameTitles

        const result = await load({} as any);

        expect(result).toEqual({
            overallRankings: [],
            winRateRankings: [],
            gameTitles: []
        });

        // Verify SQL queries contain the exclusion logic (playtime_min > 0)
        expect(query).toHaveBeenCalledTimes(3);
        
        const calls = (query as any).mock.calls;
        
        // Check Overall Rankings query
        expect(calls[0][0]).toContain('g.playtime_min > 0');
        
        // Check Win Rate Rankings query
        expect(calls[1][0]).toContain('g.playtime_min > 0');
        
        // Check Game Titles query
        expect(calls[2][0]).toContain('g.playtime_min > 0');
    });
});

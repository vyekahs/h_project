
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { load } from './+page.server';
import { db } from '$lib/server/db/index';

// Mock DB
vi.mock('$lib/server/db/index', () => ({
    db: { execute: vi.fn() }
}));

describe('Rankings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should load rankings with correct queries', async () => {
        // Mock DB responses
        (db.execute as any).mockResolvedValueOnce({ rows: [] }); // overallRankings
        (db.execute as any).mockResolvedValueOnce({ rows: [] }); // winRateRankings
        (db.execute as any).mockResolvedValueOnce({ rows: [] }); // gameTitles

        const result = await load({} as any);

        expect(result).toEqual({
            overallRankings: [],
            winRateRankings: [],
            gameTitles: []
        });

        // Verify SQL queries contain the exclusion logic (playtime_min > 0)
        expect(db.execute).toHaveBeenCalledTimes(3);
        
        const calls = (db.execute as any).mock.calls;
        
        // Check Overall Rankings query
        expect(calls[0][0]).toContain('g.playtime_min > 0');
        
        // Check Win Rate Rankings query
        expect(calls[1][0]).toContain('g.playtime_min > 0');
        
        // Check Game Titles query
        expect(calls[2][0]).toContain('g.playtime_min > 0');
    });
});

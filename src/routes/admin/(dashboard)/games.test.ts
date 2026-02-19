
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { actions } from './+page.server';
import { db } from '$lib/server/db/index';

// Mock DB
vi.mock('$lib/server/db/index', () => ({
    db: { execute: vi.fn(), transaction: vi.fn() }
}));

describe('Game Management', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('createGame', () => {
        it('should fail if required fields are missing', async () => {
             const request = {
                formData: async () => ({
                    get: (key: string) => null,
                    getAll: (key: string) => []
                })
            };
            const result = await actions.createGame({ request } as any);
            expect(result).toEqual({ status: 400, data: { missing: true } });
        });

        it('should fail if players are already playing', async () => {
             const request = {
                formData: async () => ({
                    get: (key: string) => {
                        if (key === 'gameName') return 'Test Game';
                        if (key === 'duration') return '60';
                        return null;
                    },
                    getAll: (key: string) => {
                        if (key === 'players') return ['1', '2'];
                        return [];
                    }
                })
            };

            (db.execute as any).mockResolvedValueOnce({ rows: [] }); // BEGIN
            (db.execute as any).mockResolvedValueOnce({ rows: [{ name: 'Player 1' }] }); // playingCheck
            (db.execute as any).mockResolvedValueOnce({ rows: [] }); // ROLLBACK

            const result = await actions.createGame({ request } as any);
            expect(result).toEqual({ status: 400, data: { error: '다음 인원은 이미 게임 중입니다: Player 1' } });
        });

        it('should succeed if all checks pass', async () => {
             const request = {
                formData: async () => ({
                    get: (key: string) => {
                        if (key === 'gameName') return 'Test Game';
                        if (key === 'duration') return '60';
                        return null;
                    },
                    getAll: (key: string) => {
                        if (key === 'players') return ['1', '2'];
                        return [];
                    }
                })
            };

            (db.execute as any).mockResolvedValueOnce({ rows: [] }); // BEGIN
            (db.execute as any).mockResolvedValueOnce({ rows: [] }); // playingCheck
            (db.execute as any).mockResolvedValueOnce({ rows: [{ id: 100 }] }); // INSERT game_sessions
            (db.execute as any).mockResolvedValueOnce({ rows: [] }); // INSERT session_participants 1
            (db.execute as any).mockResolvedValueOnce({ rows: [] }); // INSERT session_participants 2
            (db.execute as any).mockResolvedValueOnce({ rows: [] }); // COMMIT

            const result = await actions.createGame({ request } as any);
            expect(result).toBeUndefined();
            
            expect(db.execute).toHaveBeenCalledTimes(6);

        });
    });

    describe('endGame', () => {
        it('should fail if id is missing', async () => {
             const request = {
                formData: async () => ({
                    get: (key: string) => null,
                    getAll: (key: string) => [],
                    entries: function* () { }
                })
            };
            const result = await actions.endGame({ request } as any);
            expect(result).toEqual({ status: 400, data: { missing: true } });
        });

        it('should succeed and update scores', async () => {
             const request = {
                formData: async () => ({
                    get: (key: string) => {
                        if (key === 'id') return '100';
                        if (key === 'score_1') return '10';
                        if (key === 'score_2') return '5';
                        return null;
                    },
                    getAll: (key: string) => {
                        if (key === 'winnerIds') return ['1'];
                        return [];
                    },
                    entries: function* () {
                        yield ['id', '100'];
                        yield ['winnerIds', '1'];
                        yield ['score_1', '10'];
                        yield ['score_2', '5'];
                    }
                })
            };

            (db.execute as any).mockResolvedValueOnce({ rows: [] }); // BEGIN
            (db.execute as any).mockResolvedValueOnce({ rows: [] }); // UPDATE game_sessions
            (db.execute as any).mockResolvedValueOnce({ rows: [] }); // UPDATE session_participants (winners)
            (db.execute as any).mockResolvedValueOnce({ rows: [] }); // UPDATE session_participants (score 1)
            (db.execute as any).mockResolvedValueOnce({ rows: [] }); // UPDATE session_participants (score 2)
            (db.execute as any).mockResolvedValueOnce({ rows: [] }); // COMMIT

            const result = await actions.endGame({ request } as any);
            expect(result).toBeUndefined();

            // Verify calls
            // 1. BEGIN
            // 2. UPDATE game_sessions
            // 3. UPDATE session_participants (winners)
            // 4. UPDATE session_participants (score 1)
            // 5. UPDATE session_participants (score 2)
            // 6. COMMIT
            expect(db.execute).toHaveBeenCalledTimes(6);
        });
    });
});

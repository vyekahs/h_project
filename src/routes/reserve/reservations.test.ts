
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { actions } from '../+page.server';
import { db } from '$lib/server/db/index';
import { fail } from '@sveltejs/kit';

// Mock DB
vi.mock('$lib/server/db/index', () => ({
    db: { execute: vi.fn(), transaction: vi.fn() }
}));

// Mock SvelteKit functions
vi.mock('@sveltejs/kit', () => ({
    fail: vi.fn((status, data) => ({ status, data }))
}));

describe('Reservations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('reserveGame', () => {
        it('should fail if not logged in', async () => {
            const request = { formData: async () => ({ get: (key: string) => key === 'sessionId' ? '1' : null }) };
            const cookies = { get: vi.fn().mockReturnValue(undefined) }; // No auth

            const result = await actions.reserveGame({ request, cookies } as any);
            expect(result).toEqual({ status: 401, data: { error: '로그인이 필요합니다.' } });
        });

        it('should fail if sessionId missing', async () => {
            const request = { formData: async () => ({ get: (key: string) => null }) };
            const cookies = { 
                get: vi.fn((key) => key === 'user_session' ? 'valid_token' : undefined)
            };
            
            // 0. verifyAttendeeSession
            (db.execute as any).mockResolvedValueOnce({ rows: [{ id: 1, name: 'TestUser' }] });

            const result = await actions.reserveGame({ request, cookies } as any);
            expect(result).toEqual({ status: 400, data: { error: '게임 세션을 선택해주세요.' } });
        });

        it('should fail if blacklisted', async () => {
            const request = { formData: async () => ({ get: (key: string) => key === 'sessionId' ? '1' : null }) };
            const cookies = { 
                get: vi.fn((key) => key === 'user_session' ? 'valid_token' : undefined)
            };

            // 0. verifyAttendeeSession
            (db.execute as any).mockResolvedValueOnce({ rows: [{ id: 1, name: 'TestUser' }] });
            // 1. Blacklist check
            (db.execute as any).mockResolvedValueOnce({ rows: [{ is_blacklisted: true, penalty_points: 0 }] });

            const result = await actions.reserveGame({ request, cookies } as any);
            expect(result).toEqual({ status: 403, data: { error: '블랙리스트에 등록되어 예약이 불가능합니다.' } });
        });

        it('should succeed and auto-confirm', async () => {
            const request = { formData: async () => ({ get: (key: string) => key === 'sessionId' ? '1' : null }) };
            const cookies = { 
                get: vi.fn((key) => key === 'user_session' ? 'valid_token' : undefined)
            };

            // 0. verifyAttendeeSession
            (db.execute as any).mockResolvedValueOnce({ rows: [{ id: 1, name: 'TestUser' }] });
            // 1. Blacklist check
            (db.execute as any).mockResolvedValueOnce({ rows: [{ is_blacklisted: false, penalty_points: 0 }] });
            // 2. Busy check
            (db.execute as any).mockResolvedValueOnce({ rows: [] }); 
            // 3. Insert reservation
            (db.execute as any).mockResolvedValueOnce({ rows: [] });

            const result = await actions.reserveGame({ request, cookies } as any);
            expect(result).toEqual({ success: true });

            // Verify INSERT calls with 'confirmed'
            expect(db.execute).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO reservations'),
                expect.arrayContaining(['confirmed'])
            );
        });
    });


    describe('joinScheduledGame', () => {
        it('should allow joining if existing reservation is on a different day', async () => {
             const request = { formData: async () => ({ get: (key: string) => key === 'sessionId' ? '2' : '1' }) }; // attendeeId=1
             const cookies = { 
                 get: vi.fn((key) => {
                     if (key === 'user_session') return 'valid_token';
                     return undefined;
                 })
             };

             // 0. verifyAttendeeSession
             (db.execute as any).mockResolvedValueOnce({ rows: [{ id: 1, name: 'TestUser' }] });
             // 1. Get info (blacklisted check)
             (db.execute as any).mockResolvedValueOnce({ rows: [{ is_blacklisted: false, penalty_points: 0 }] });
             // 2. target session info (Target Day = Day 2)
             (db.execute as any).mockResolvedValueOnce({ rows: [{ scheduled_at: '2023-10-02 10:00:00' }] });
             // 3. already joined check
             (db.execute as any).mockResolvedValueOnce({ rows: [] });
             // 4. Busy check (Input Day = Day 1) -> SHOULD BE EMPTY
             (db.execute as any).mockResolvedValueOnce({ rows: [] }); 
             // 5. Session full check
             (db.execute as any).mockResolvedValueOnce({ rows: [{ max_players: 4, current_players: 1 }] });
             // 6. Join transaction
             (db.execute as any).mockResolvedValueOnce({ rows: [] }); // BEGIN
             (db.execute as any).mockResolvedValueOnce({ rows: [] }); // INSERT
             (db.execute as any).mockResolvedValueOnce({ rows: [] }); // UPDATE
             (db.execute as any).mockResolvedValueOnce({ rows: [] }); // COMMIT

             const result = await actions.joinScheduledGame({ request, cookies } as any);
             expect(result).toEqual({ success: true });
        });

        it('should fail if existing reservation is on the same day', async () => {
             const request = { formData: async () => ({ get: (key: string) => key === 'sessionId' ? '2' : '1' }) };
             const cookies = { 
                 get: vi.fn((key) => {
                     if (key === 'user_session') return 'valid_token';
                     return undefined;
                 })
             };

             // 0. verifyAttendeeSession
             (db.execute as any).mockResolvedValueOnce({ rows: [{ id: 1, name: 'TestUser' }] });
             // 1. Get info (blacklisted check)
             (db.execute as any).mockResolvedValueOnce({ rows: [{ is_blacklisted: false, penalty_points: 0 }] });
             // 2. target session info (Target Day = Day 1)
             (db.execute as any).mockResolvedValueOnce({ rows: [{ scheduled_at: '2023-10-01 14:00:00' }] });
             // 3. already joined check
             (db.execute as any).mockResolvedValueOnce({ rows: [] });
             // 4. Busy check (Existing res on Day 1) -> SHOULD RETURN ROW
             (db.execute as any).mockResolvedValueOnce({ rows: [{ 1: 1 }] });

             const result = await actions.joinScheduledGame({ request, cookies } as any);
             expect(result).toEqual({ status: 400, data: { error: '해당 날짜에 이미 다른 게임에 참여 중이거나 예약된 내역이 있습니다.' } });
        });
    });
});

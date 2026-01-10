
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { actions } from '../+page.server';
import { query } from '$lib/server/db';
import { fail } from '@sveltejs/kit';

// Mock DB
vi.mock('$lib/server/db', () => ({
    query: vi.fn()
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
            const request = {
                formData: async () => ({
                    get: (key: string) => {
                        if (key === 'sessionId') return '1';
                        return null;
                    }
                })
            };
            const cookies = { get: vi.fn().mockReturnValue(undefined) }; // No auth

            const result = await actions.reserveGame({ request, cookies } as any);
            expect(result).toEqual({ status: 401, data: { error: '로그인이 필요합니다.' } });
        });

        it('should fail if sessionId missing', async () => {
            const request = {
                formData: async () => ({
                    get: (key: string) => null
                })
            };
            const cookies = { get: vi.fn().mockReturnValue(JSON.stringify({ id: 1 })) };

            const result = await actions.reserveGame({ request, cookies } as any);
            expect(result).toEqual({ status: 400, data: { error: '게임 세션을 선택해주세요.' } });
        });

        it('should fail if blacklisted', async () => {
            const request = {
                formData: async () => ({
                    get: (key: string) => key === 'sessionId' ? '1' : null
                })
            };
            const cookies = { get: vi.fn().mockReturnValue(JSON.stringify({ id: 1 })) };

            (query as any).mockResolvedValueOnce({ rows: [{ is_blacklisted: true, penalty_points: 0 }] });

            const result = await actions.reserveGame({ request, cookies } as any);
            expect(result).toEqual({ status: 403, data: { error: '블랙리스트에 등록되어 예약이 불가능합니다.' } });
        });

        it('should succeed and auto-confirm', async () => {
            const request = {
                formData: async () => ({
                    get: (key: string) => key === 'sessionId' ? '1' : null
                })
            };
            const cookies = { get: vi.fn().mockReturnValue(JSON.stringify({ id: 1 })) };

            (query as any).mockResolvedValueOnce({ rows: [{ is_blacklisted: false, penalty_points: 0 }] }); // Check blacklist
            (query as any).mockResolvedValueOnce({ rows: [] }); // Check busy
            (query as any).mockResolvedValueOnce({ rows: [] }); // INSERT reservation

            const result = await actions.reserveGame({ request, cookies } as any);
            expect(result).toEqual({ success: true });

            // Verify INSERT calls with 'confirmed'
            expect(query).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO reservations'),
                expect.arrayContaining(['confirmed'])
            );
        });
    });
});

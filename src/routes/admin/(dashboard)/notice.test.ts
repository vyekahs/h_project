
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { actions } from './+page.server';
import { query } from '$lib/server/db';

// Mock DB
vi.mock('$lib/server/db', () => ({
    query: vi.fn()
}));

describe('Admin Notices', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('updateNotice', () => {
        it('should fail if content is missing', async () => {
            const request = {
                formData: async () => ({
                    get: (key: string) => null
                })
            };
            const result = await actions.updateNotice({ request } as any);
            expect(result).toEqual({ status: 400, data: { missing: true } });
        });

        it('should succeed and update notice', async () => {
            const request = {
                formData: async () => ({
                    get: (key: string) => 'New Notice'
                })
            };

            (query as any).mockResolvedValueOnce({ rows: [] }); // BEGIN
            (query as any).mockResolvedValueOnce({ rows: [] }); // UPDATE notices (deactivate old)
            (query as any).mockResolvedValueOnce({ rows: [] }); // INSERT new notice
            (query as any).mockResolvedValueOnce({ rows: [] }); // COMMIT

            const result = await actions.updateNotice({ request } as any);
            expect(result).toBeUndefined();
            expect(query).toHaveBeenCalledTimes(4);
        });
    });

    describe('clearNotice', () => {
        it('should succeed', async () => {
            (query as any).mockResolvedValueOnce({ rows: [] }); // UPDATE notices
            
            const result = await actions.clearNotice({} as any);
            expect(result).toBeUndefined();
            expect(query).toHaveBeenCalledTimes(1);
        });
    });
});

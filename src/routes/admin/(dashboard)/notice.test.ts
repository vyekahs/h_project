
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { actions } from './+page.server';
import { db } from '$lib/server/db/index';

// Mock DB
vi.mock('$lib/server/db/index', () => ({
    db: { execute: vi.fn(), transaction: vi.fn() }
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

            (db.execute as any).mockResolvedValueOnce({ rows: [] }); // BEGIN
            (db.execute as any).mockResolvedValueOnce({ rows: [] }); // UPDATE notices (deactivate old)
            (db.execute as any).mockResolvedValueOnce({ rows: [] }); // INSERT new notice
            (db.execute as any).mockResolvedValueOnce({ rows: [] }); // COMMIT

            const result = await actions.updateNotice({ request } as any);
            expect(result).toBeUndefined();
            expect(db.execute).toHaveBeenCalledTimes(4);
        });
    });

    describe('clearNotice', () => {
        it('should succeed', async () => {
            (db.execute as any).mockResolvedValueOnce({ rows: [] }); // UPDATE notices
            
            const result = await actions.clearNotice({} as any);
            expect(result).toBeUndefined();
            expect(db.execute).toHaveBeenCalledTimes(1);
        });
    });
});

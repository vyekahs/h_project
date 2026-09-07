import { describe, it, expect, vi, beforeEach } from 'vitest';
import { actions } from './+page.server';
import { db } from '$lib/server/db/index';

vi.mock('$lib/server/db/index', () => ({
    db: { execute: vi.fn(), transaction: vi.fn() }
}));

vi.mock('$lib/server/auth', () => ({
    verifyAdminSession: vi.fn(async () => true)
}));

vi.mock('$lib/server/ble', () => ({
    updateSettingsCache: vi.fn()
}));

vi.mock('$lib/server/liveEvents', () => ({
    emitLiveEvent: vi.fn()
}));

/** 관리자 쿠키를 실은 요청 — 공지 액션은 세션 검증을 통과해야 한다 */
function adminRequest(fields: Record<string, string | null>) {
    return {
        headers: { get: (k: string) => (k === 'cookie' ? 'admin_session=test-token' : null) },
        formData: async () => ({ get: (key: string) => fields[key] ?? null })
    } as any;
}

describe('Admin Notices', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('updateNotice', () => {
        it('내용이 비면 실패한다', async () => {
            const result: any = await actions.updateNotice({ request: adminRequest({ content: null }) } as any);
            expect(result.status).toBe(400);
            expect(result.data.error).toBeTruthy();
        });

        it('공백만 있어도 실패한다', async () => {
            const result: any = await actions.updateNotice({ request: adminRequest({ content: '   ' }) } as any);
            expect(result.status).toBe(400);
        });

        it('기존 공지를 내리고 새 공지를 넣는다', async () => {
            const tx = { execute: vi.fn().mockResolvedValue([]) };
            (db.transaction as any).mockImplementation(async (fn: any) => fn(tx));

            const result: any = await actions.updateNotice({ request: adminRequest({ content: '새 공지' }) } as any);

            expect(result).toEqual({ success: true });
            expect(tx.execute).toHaveBeenCalledTimes(2);
        });

        it('관리자 세션이 없으면 403', async () => {
            const request = {
                headers: { get: () => null },
                formData: async () => ({ get: () => '새 공지' })
            } as any;
            const result: any = await actions.updateNotice({ request } as any);
            expect(result.status).toBe(403);
        });
    });

    describe('clearNotice', () => {
        it('활성 공지를 내린다', async () => {
            (db.execute as any).mockResolvedValueOnce([]);
            const result: any = await actions.clearNotice({ request: adminRequest({}) } as any);
            expect(result).toEqual({ success: true });
            expect(db.execute).toHaveBeenCalledTimes(1);
        });
    });
});

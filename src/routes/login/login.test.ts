import { describe, it, expect, vi, beforeEach } from 'vitest';
import { actions } from './+page.server';
import { db } from '$lib/server/db/index';
import bcrypt from 'bcryptjs';

vi.mock('$lib/server/db/index', () => ({
    db: { execute: vi.fn(), transaction: vi.fn() }
}));

vi.mock('bcryptjs', () => ({
    default: { compare: vi.fn() }
}));

// 로그인은 user_auth 쿠키를 직접 굽던 방식에서 세션 토큰 방식으로 바뀌었다.
vi.mock('$lib/server/auth', () => ({
    createAttendeeSession: vi.fn(async () => 'session-token'),
    verifyAttendeeSession: vi.fn(async () => null)
}));
vi.mock('$lib/server/services/titleService', () => ({
    TitleService: { checkAndAssignTitles: vi.fn(async () => undefined) }
}));

vi.mock('@sveltejs/kit', () => ({
    fail: vi.fn((status, data) => ({ status, data })),
    redirect: vi.fn((status, location) => {
        throw { status, location, isRedirect: true };
    })
}));

function makeCookies() {
    return { set: vi.fn(), delete: vi.fn(), get: vi.fn() };
}

function makeRequest(body: Record<string, string>) {
    return new Request('http://localhost', {
        method: 'POST',
        body: new URLSearchParams(body)
    });
}

describe('Authentication', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('login', () => {
        it('should fail if name is missing', async () => {
            const result = await actions.default({
                request: makeRequest({}),
                cookies: makeCookies(),
                url: new URL('http://localhost')
            } as any);
            expect(result).toEqual({
                status: 400,
                data: { error: '이름과 비밀번호를 입력해주세요.' }
            });
        });

        it('should fail if user not found', async () => {
            (db.execute as any).mockResolvedValueOnce([]);

            const result = await actions.default({
                request: makeRequest({ name: 'unknown', password: 'password' }),
                cookies: makeCookies(),
                url: new URL('http://localhost')
            } as any);
            expect(result).toEqual({ status: 400, data: { error: '존재하지 않는 사용자입니다.' } });
        });

        it('비밀번호가 설정되지 않은 계정은 그 사실을 알린다', async () => {
            (db.execute as any).mockResolvedValueOnce([{ id: 1, name: 'user', password: null }]);

            const result = await actions.default({
                request: makeRequest({ name: 'user', password: 'anything' }),
                cookies: makeCookies(),
                url: new URL('http://localhost')
            } as any);
            expect(result).toEqual({
                status: 400,
                data: { error: '비밀번호가 설정되지 않은 계정입니다. 관리자에게 문의하세요.' }
            });
        });

        it('should fail if password incorrect', async () => {
            (db.execute as any).mockResolvedValueOnce([{ id: 1, name: 'user', password: 'hashed' }]);
            (bcrypt.compare as any).mockResolvedValueOnce(false);

            const result = await actions.default({
                request: makeRequest({ name: 'user', password: 'wrong' }),
                cookies: makeCookies(),
                url: new URL('http://localhost')
            } as any);
            expect(result).toEqual({ status: 400, data: { error: '비밀번호가 일치하지 않습니다.' } });
        });

        it('should succeed if credentials correct', async () => {
            (db.execute as any).mockResolvedValueOnce([{ id: 1, name: 'user', password: 'hashed' }]);
            (bcrypt.compare as any).mockResolvedValueOnce(true);
            const cookies = makeCookies();

            await expect(
                actions.default({
                    request: makeRequest({ name: 'user', password: 'correct' }),
                    cookies,
                    url: new URL('http://localhost')
                } as any)
            ).rejects.toMatchObject({ isRedirect: true, location: '/' });

            expect(cookies.set).toHaveBeenCalledWith(
                'user_session',
                'session-token',
                expect.objectContaining({ httpOnly: true, path: '/' })
            );
            // 예전의 평문 쿠키는 로그인 시 정리한다
            expect(cookies.delete).toHaveBeenCalledWith('user_auth', { path: '/' });
        });

        it('redirectTo가 있으면 그리로 보낸다', async () => {
            (db.execute as any).mockResolvedValueOnce([{ id: 1, name: 'user', password: 'hashed' }]);
            (bcrypt.compare as any).mockResolvedValueOnce(true);

            await expect(
                actions.default({
                    request: makeRequest({ name: 'user', password: 'correct' }),
                    cookies: makeCookies(),
                    url: new URL('http://localhost/login?redirectTo=/mypage')
                } as any)
            ).rejects.toMatchObject({ isRedirect: true, location: '/mypage' });
        });
    });
});

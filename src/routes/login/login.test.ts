
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { actions } from './+page.server';
import { db } from '$lib/server/db/index';
import bcrypt from 'bcryptjs';
import { fail, redirect } from '@sveltejs/kit';

// Mock DB and bcrypt
vi.mock('$lib/server/db/index', () => ({
    db: { execute: vi.fn(), transaction: vi.fn() }
}));

vi.mock('bcryptjs', () => ({
    default: {
        compare: vi.fn()
    }
}));

// Mock SvelteKit functions
vi.mock('@sveltejs/kit', () => ({
    fail: vi.fn((status, data) => ({ status, data })),
    redirect: vi.fn((status, location) => { throw { status, location, isRedirect: true }; })
}));

describe('Authentication', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('login', () => {
        it('should fail if name is missing', async () => {
            const request = new Request('http://localhost', {
                method: 'POST',
                body: new URLSearchParams()
            });
            const result = await actions.default({ request, cookies: { set: vi.fn() }, url: new URL('http://localhost') } as any);
            expect(result).toEqual({ status: 400, data: { error: '이름과 비밀번호를 입력해주세요.' } });
        });

        it('should fail if user not found', async () => {
            const request = new Request('http://localhost', {
                method: 'POST',
                body: new URLSearchParams({ name: 'unknown', password: 'password' })
            });
            
            (db.execute as any).mockResolvedValueOnce({ rows: [] });

            const result = await actions.default({ request, cookies: { set: vi.fn() }, url: new URL('http://localhost') } as any);
            expect(result).toEqual({ status: 400, data: { error: '존재하지 않는 사용자입니다.' } });
        });

        it('should fail if password incorrect', async () => {
            const request = new Request('http://localhost', {
                method: 'POST',
                body: new URLSearchParams({ name: 'user', password: 'wrong' })
            });
            
            (db.execute as any).mockResolvedValueOnce({ rows: [{ id: 1, name: 'user', password: 'hashed' }] });
            (bcrypt.compare as any).mockResolvedValueOnce(false);

            const result = await actions.default({ request, cookies: { set: vi.fn() }, url: new URL('http://localhost') } as any);
            expect(result).toEqual({ status: 400, data: { error: '비밀번호가 일치하지 않습니다.' } });
        });

        it('should succeed if credentials correct', async () => {
            const request = new Request('http://localhost', {
                method: 'POST',
                body: new URLSearchParams({ name: 'user', password: 'correct' })
            });
            
            const mockUser = { id: 1, name: 'user', password: 'hashed' };
            (db.execute as any).mockResolvedValueOnce({ rows: [mockUser] });
            (bcrypt.compare as any).mockResolvedValueOnce(true);
            
            const cookies = { set: vi.fn() };
            
            try {
                await actions.default({ request, cookies, url: new URL('http://localhost') } as any);
            } catch (e: any) {
                expect(e.isRedirect).toBe(true);
                expect(e.location).toBe('/');
            }
            
            expect(cookies.set).toHaveBeenCalledWith('user_auth', JSON.stringify({ id: 1, name: 'user' }), expect.any(Object));
        });
    });
});

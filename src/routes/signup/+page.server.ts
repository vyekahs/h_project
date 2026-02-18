import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { createAttendeeSession } from '$lib/server/auth';

export const actions: Actions = {
    default: async ({ request, cookies, url }) => {
        const data = await request.formData();
        const name = data.get('name') as string;
        const password = data.get('password') as string;
        const confirmPassword = data.get('confirmPassword') as string;

        if (!name || !password || !confirmPassword) {
            return fail(400, { error: '모든 필드를 입력해주세요.' });
        }

        if (password !== confirmPassword) {
            return fail(400, { error: '비밀번호가 일치하지 않습니다.' });
        }

        // Check if name already exists
        const existing = await db.execute(sql`SELECT id FROM attendees WHERE name = ${name}`);
        if (existing.length > 0) {
            return fail(400, { error: '이미 존재하는 이름입니다.' });
        }

        try {
            const hashedPassword = await bcrypt.hash(password, 10);

            // Insert new user with status 'left' (not currently present)
            const result = await db.execute(sql`
                INSERT INTO attendees (name, password, status) VALUES (${name}, ${hashedPassword}, ${'left'}) RETURNING id, name
            `);

            const newUser = result[0] as any;

            // Auto-login: Set user session cookie
            const token = await createAttendeeSession(newUser.id);

            cookies.set('user_session', token, {
                path: '/',
                httpOnly: true,
                sameSite: 'lax',
                secure: false,
                maxAge: 60 * 60 * 24 * 365 // 1 year
            });

            // Clean up old insecure cookie
            cookies.delete('user_auth', { path: '/' });

        } catch (err) {
            console.error(err);
            return fail(500, { error: '회원가입 중 오류가 발생했습니다.' });
        }

        const redirectTo = url.searchParams.get('redirectTo');
        throw redirect(303, redirectTo || '/');
    }
};

import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { query } from '$lib/server/db';
import bcrypt from 'bcryptjs';

export const load: PageServerLoad = async ({ cookies }) => {
    const userAuth = cookies.get('user_auth');
    
    // If already logged in as user, redirect to home
    if (userAuth) {
        throw redirect(303, '/');
    }
};

export const actions: Actions = {
    default: async ({ request, cookies }) => {
        const data = await request.formData();
        const name = data.get('name') as string;
        const password = data.get('password') as string;

        if (!name || !password) {
            return fail(400, { error: '이름과 비밀번호를 입력해주세요.' });
        }

        try {
            const result = await query('SELECT id, name, password FROM attendees WHERE name = $1', [name]);
            
            if (result.rows.length === 0) {
                return fail(400, { error: '존재하지 않는 사용자입니다.' });
            }

            const user = result.rows[0];

            if (!user.password) {
                return fail(400, { error: '비밀번호가 설정되지 않은 계정입니다. 관리자에게 문의하세요.' });
            }

            const match = await bcrypt.compare(password, user.password);
            if (!match) {
                return fail(400, { error: '비밀번호가 일치하지 않습니다.' });
            }

            // Set user auth cookie
            const userSession = JSON.stringify({ id: user.id, name: user.name });
            
            cookies.set('user_auth', userSession, {
                path: '/',
                httpOnly: true,
                sameSite: 'lax',
                secure: false,
                maxAge: 60 * 60 * 24 * 365 // 1 year
            });

        } catch (err) {
            console.error(err);
            return fail(500, { error: '로그인 중 오류가 발생했습니다.' });
        }

        throw redirect(303, '/');
    }
};

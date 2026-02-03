import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { query } from '$lib/server/db';
import bcrypt from 'bcryptjs';
import { createAttendeeSession, verifyAttendeeSession } from '$lib/server/auth';

export const load: PageServerLoad = async ({ cookies }) => {
    const sessionToken = cookies.get('user_session');
    
    // If already logged in as user, redirect to home
    if (sessionToken && await verifyAttendeeSession(sessionToken)) {
        throw redirect(303, '/');
    }
};

export const actions: Actions = {
    default: async ({ request, cookies, url }) => {
        const data = await request.formData();
        const name = data.get('name') as string;
        const password = data.get('password') as string;

        if (!name || !password) {
            return fail(400, { error: '이름과 비밀번호를 입력해주세요.' });
        }

        try {
            const result = await query('SELECT id, name, password, can_manage_games FROM attendees WHERE name = $1', [name]);
            
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

            // Set user session cookie logic
            const token = await createAttendeeSession(user.id);
            
            cookies.set('user_session', token, {
                path: '/',
                httpOnly: true,
                sameSite: 'lax',
                secure: false, // Set to true in prod with HTTPS
                maxAge: 60 * 60 * 24 * 365 // 1 year
            });
            
            // Clean up old insecure cookie
            cookies.delete('user_auth', { path: '/' });

            cookies.delete('admin_session', { path: '/' });
            cookies.delete('admin_auth', { path: '/' });

            // Trigger Title Check (e.g. for login-related titles or sync)
            try {
                // Dynamic import to avoid circular dependency if any
                await import('$lib/server/services/titleService').then(({ TitleService }) => TitleService.checkAndAssignTitles(user.id));
            } catch (e) {
                console.error('[Login] Title check failed:', e);
            }

        } catch (err) {
            console.error(err);
            return fail(500, { error: '로그인 중 오류가 발생했습니다.' });
        }



        const redirectTo = url.searchParams.get('redirectTo');
        throw redirect(303, redirectTo || '/');
    }
};

import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { createAdminSession, getOrCreateAdminUser, verifyAdminSession } from '$lib/server/auth';

export const load: PageServerLoad = async ({ cookies }) => {
    const sessionToken = cookies.get('admin_session');
    if (sessionToken && await verifyAdminSession(sessionToken)) {
        throw redirect(303, '/admin');
    }
};

export const actions: Actions = {
    default: async ({ request, cookies }) => {
        const data = await request.formData();
        const password = data.get('password');
        const adminPassword = env.ADMIN_PASSWORD;

        // 공개 저장소에 알려진 기본값으로 몰래 폴백하지 않고, 설정 안 됐으면 아예 막는다
        // (예전에 ADMIN_PASSWORD 미설정 시 'admin1234'로 폴백하던 게 실제로 노출된 적 있음)
        if (!adminPassword) {
            console.error('[Admin Login] ADMIN_PASSWORD 환경변수가 설정되지 않았습니다. .env를 확인하세요.');
            return fail(500, { error: '서버 설정 오류입니다. 관리자에게 문의하세요.' });
        }

        if (password !== adminPassword) {
            return fail(400, { error: '비밀번호가 올바르지 않습니다.' });
        }

        try {
            const userId = await getOrCreateAdminUser();
            const token = await createAdminSession(userId);

            cookies.set('admin_session', token, {
                path: '/',
                httpOnly: true,
                sameSite: 'lax', // Strict might be too aggressive for redirects
                secure: false, // Set to true in prod with HTTPS
                maxAge: 60 * 60 * 24 * 7 // 7 days matching token
            });
            
            // Clear old insecure cookie if exists
            cookies.delete('admin_auth', { path: '/' });
            
            // Feature 6: Clear User Session to enforce mutual exclusion
            cookies.delete('user_session', { path: '/' });
            cookies.delete('user_auth', { path: '/' });

        } catch (e) {
            console.error('Login Error:', e);
            return fail(500, { error: '로그인 처리 중 오류가 발생했습니다.' });
        }

        throw redirect(303, '/admin');
    }
};

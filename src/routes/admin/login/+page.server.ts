import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';

export const load: PageServerLoad = async ({ cookies }) => {
    const auth = cookies.get('admin_auth');
    if (auth === 'true') {
        throw redirect(303, '/admin');
    }
};

export const actions: Actions = {
    default: async ({ request, cookies }) => {
        const data = await request.formData();
        const password = data.get('password');
        const adminPassword = env.ADMIN_PASSWORD || 'admin1234';

        if (password !== adminPassword) {
            return fail(400, { error: '비밀번호가 올바르지 않습니다.' });
        }

        cookies.set('admin_auth', 'true', {
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            secure: false,
            maxAge: 60 * 60 * 24 * 365 // 1 year
        });

        throw redirect(303, '/admin');
    }
};

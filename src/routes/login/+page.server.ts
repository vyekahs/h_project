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
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin1234'; // Default fallback

        if (password !== adminPassword) {
            return fail(400, { error: '비밀번호가 올바르지 않습니다.' });
        }

        cookies.set('admin_auth', 'true', {
            path: '/',
            httpOnly: true,
            sameSite: 'strict',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 60 * 60 * 24 * 7 // 1 week
        });

        throw redirect(303, '/admin');
    }
};

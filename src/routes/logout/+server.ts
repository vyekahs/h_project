import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
    cookies.delete('admin_auth', { path: '/' });
    cookies.delete('user_auth', { path: '/' });
    throw redirect(303, '/login');
};

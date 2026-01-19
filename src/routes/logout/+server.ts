import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteAdminSession, deleteAttendeeSession } from '$lib/server/auth';

export const POST: RequestHandler = async ({ cookies }) => {
    const sessionToken = cookies.get('admin_session');
    if (sessionToken) {
        await deleteAdminSession(sessionToken);
    }
    
    cookies.delete('admin_session', { path: '/' });
    cookies.delete('admin_auth', { path: '/' }); // Cleanup old cookie

    const userToken = cookies.get('user_session');
    if (userToken) {
        await deleteAttendeeSession(userToken);
    }
    cookies.delete('user_session', { path: '/' });
    cookies.delete('user_auth', { path: '/' });

    throw redirect(303, '/login');
};

import type { LayoutServerLoad } from './$types';
import { verifyAdminSession, verifyAttendeeSession } from '$lib/server/auth';

export const load: LayoutServerLoad = async ({ cookies, locals }: { cookies: any, locals: any }) => {
    const userSessionToken = cookies.get('user_session');
    let user = null;

    if (userSessionToken) {
        try {
            user = await verifyAttendeeSession(userSessionToken);
            // We can add more user details here if needed globaly
        } catch (e) {
            console.error('Layout auth error', e);
        }
    }

    const adminSessionToken = cookies.get('admin_session');
    const isAdmin = adminSessionToken ? await verifyAdminSession(adminSessionToken) : false;

    return {
        user,
        isAdmin
    };
};

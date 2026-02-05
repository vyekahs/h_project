import type { LayoutServerLoad } from './$types';
import { verifyAdminSession, verifyAttendeeSession } from '$lib/server/auth';
import { TitleService } from '$lib/server/services/titleService';

export const load: LayoutServerLoad = async ({ cookies, locals }: { cookies: any, locals: any }) => {
    const userSessionToken = cookies.get('user_session');
    let user = null;

    if (userSessionToken) {
        try {
            user = await verifyAttendeeSession(userSessionToken);
            // Default: use user from hooks (locals.user) if verify failed but token exists (rare),
            // or if we rely on verifyAttendeeSession here explicitly.
            // Actually, locals.user should be preferred if it was set by hooks.
        } catch (e) {
            console.error('Layout auth error', e);
        }
    }
    
    // Prefer hooks user if available, fallback to manual verification result
    user = locals.user || user;

    if (user) {
        try {
            const title = await TitleService.getUserTitle(user.id);
            if (title) {
                 user = { ...user, title };
            }
        } catch (e) {
            console.error('Layout title fetch error', e); 
        }
    }

    const adminSessionToken = cookies.get('admin_session');
    const isAdmin = adminSessionToken ? await verifyAdminSession(adminSessionToken) : false;

    return {
        user,
        isAdmin
    };
};

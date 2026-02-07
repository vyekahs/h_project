import { startAutoCloseScheduler } from '$lib/server/autoClose';
import { verifyAdminSession, verifyAttendeeSession } from '$lib/server/auth';

// Start the scheduler when the server starts
startAutoCloseScheduler();

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
    // 0. Global User Auth (Attendee) - Run for ALL routes
    const userSessionToken = event.cookies.get('user_session'); 
    if (userSessionToken) {
        const user = await verifyAttendeeSession(userSessionToken);
        if (user) {
            event.locals.user = user;
        }
    }

    // 로그인 필요 경로 체크 (미니게임 라운지 + 개별 게임)
    const needsLogin = event.url.pathname.startsWith('/minigames') ||
        (event.url.pathname.startsWith('/games/') && event.url.pathname !== '/games');
    if (needsLogin && !event.locals.user) {
        return new Response('Redirect', {
            status: 303,
            headers: { Location: '/login?redirectTo=' + encodeURIComponent(event.url.pathname) }
        });
    }

    if (event.url.pathname.startsWith('/admin') && !event.url.pathname.startsWith('/admin/login')) {
        const sessionToken = event.cookies.get('admin_session');

        // Allow if:
        // 1. Is Admin (valid session)
        if (sessionToken && (await verifyAdminSession(sessionToken))) {
             const response = await resolve(event);
             return response;
        }

        // 2. Is Manager (User with can_manage_games)
        // The previous userSessionToken check and related manager logic was moved out of this block
        // because /admin is strictly for admins.
        // The comments below explain the reasoning for removing the manager check from here.
        
        // Check if user is manager (for admin access? wait, previous logic was strictly Admin OR Manager for specific actions, but for /admin page access?)
        // The original code for /admin access was:
        /*
        const adminAuth = event.cookies.get('admin_auth');
        const userAuth = event.cookies.get('user_auth');
        let isManager = false;
        if (userAuth) { ... user.can_manage_games ... }
        const isAdmin = adminAuth === 'true';
        if (!isAdmin) { redirect }
        */
        // Wait, the original code ONLY checked `isAdmin` for `/admin` access.
        // Let's re-read the original hooks I replaced earlier.
        
        // Re-reading Step 1016 (hooks update):
        /*
        // Allow if:
        // 1. Is Admin (valid session)
        const isAdmin = sessionToken && (await verifyAdminSession(sessionToken));

        if (!isAdmin) {
             return new Response('Redirect', ...);
        }
        */
        // So Managers were NOT allowed in /admin? 
        // Let's check the very first version of hooks from Step 999/1014.
        /*
        if (event.url.pathname.startsWith('/admin') && !event.url.pathname.startsWith('/admin/login')) {
             const adminAuth = ...
             if (adminAuth !== 'true') redirect...
        }
        */
       // So /admin is ONLY for pure admins. Managers use the main page or games page with extra buttons.
       // However, I see `isManager` logic in my previous hooks update but it wasn't used for the final check? 
       // In Step 1016 diff:
       /*
         let isManager = false;
         if (userAuth) { ... }
         
         // Allow if:
         // 1. Is Admin (valid session)
         const isAdmin = sessionToken && (await verifyAdminSession(sessionToken));
         
         if (!isAdmin) { redirect }
       */
       // You are right. `isManager` was calculated but NOT used to allow access. 
       // So I don't need to check user session for /admin access. 
       // BUT, I should probably remove the old `user_auth` parsing code from hooks if it's there, just to be clean.
       
       // Actually, looking at the previous hooks code (Step 1016), it still parses `user_auth` to calculate `isManager`, but then effectively ignores it for the redirect decision.
       // I will remove that dead code.
           
        
        // Strict Admin Check for /admin routes
        const isAdmin = sessionToken && (await verifyAdminSession(sessionToken));
        if (!isAdmin) {
             return new Response('Redirect', {
                 status: 303,
                 headers: { Location: '/admin/login' }
             });
        }
    }

	const response = await resolve(event);
	return response;
}

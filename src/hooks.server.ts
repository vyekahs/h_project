import { startAutoCloseScheduler } from '$lib/server/autoClose';
import { verifyAdminSession, verifyAttendeeSession } from '$lib/server/auth';
import { TichuRoomManager } from '$lib/server/tichu/TichuRoomManager';
import { setupSocketHandlers } from '$lib/server/tichu/socketHandlers';
import type { Server as SocketIOServer, Socket } from 'socket.io';

// Start the scheduler when the server starts
startAutoCloseScheduler();

// Initialize Tichu multiplayer system
const tichuManager = new TichuRoomManager();

(globalThis as any).__saveAllGames = async () => {
	await tichuManager.saveAllSnapshots();
};

// Restore active games from DB, then register socket handler
tichuManager.init().then(() => {
	// Register socket handler only after snapshots are fully restored
	(globalThis as any).__tichuHandler = (io: SocketIOServer, socket: Socket, userId: number, userName: string) => {
		socket.data.userId = userId;
		socket.data.userName = userName;
		setupSocketHandlers(io, socket, tichuManager);
	};
}).catch(e => console.error('[Tichu] Init error:', e));

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
    // 1. Global User Auth (Attendee) - Run for ALL routes
    const userSessionToken = event.cookies.get('user_session');
    if (userSessionToken) {
        const user = await verifyAttendeeSession(userSessionToken);
        if (user) {
            event.locals.user = user;
        }
    }

    // 2. Global Admin Auth - Run for ALL routes (결과를 locals에 캐시)
    const adminSessionToken = event.cookies.get('admin_session');
    if (adminSessionToken) {
        event.locals.isAdmin = await verifyAdminSession(adminSessionToken);
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

    // /admin 경로 보호 (admin 전용)
    if (event.url.pathname.startsWith('/admin') && !event.url.pathname.startsWith('/admin/login')) {
        if (!event.locals.isAdmin) {
            return new Response('Redirect', {
                status: 303,
                headers: { Location: '/admin/login' }
            });
        }
    }

	const response = await resolve(event);
	return response;
}

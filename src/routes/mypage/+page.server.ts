import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { verifyAttendeeSession } from '$lib/server/auth';
import { removeFromIrkCache } from '$lib/server/ble';
import { PartyService } from '$lib/server/services/partyService';
import { NotificationService } from '$lib/server/services/notificationService';
import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ parent }) => {
    const { user } = await parent();

    if (!user) {
        throw redirect(302, '/login');
    }

    // Fetch Registered Devices & Parties & All Attendees & All Games
    const [devicesResult, parties, allAttendeesResult, allGamesResult, pendingInvitations] = await Promise.all([
        db.execute(sql`SELECT id, name, created_at, last_seen_at FROM user_devices WHERE attendee_id = ${user.id} ORDER BY created_at DESC`),
        PartyService.getUserParties(user.id).catch(() => []),
        db.execute(sql`
            SELECT DISTINCT a.id, a.name
            FROM attendees a
            WHERE a.id = ${user.id}
               OR a.id IN (
                   SELECT sp2.attendee_id
                   FROM session_participants sp1
                   JOIN game_sessions gs ON sp1.session_id = gs.id
                   JOIN session_participants sp2 ON sp2.session_id = gs.id
                   WHERE sp1.attendee_id = ${user.id}
                     AND sp2.attendee_id != ${user.id}
                     AND gs.status = 'finished'
               )
            ORDER BY a.name ASC
        `),
        db.execute(sql`SELECT id, name, playtime_min, image_url FROM games ORDER BY name ASC`),
        PartyService.getPendingInvitations(user.id).catch(() => [])
    ]);
    // Trigger Title Check (Background)
    try {
        import('$lib/server/services/titleService').then(({ TitleService }) => TitleService.checkAndAssignTitles(user.id)).catch(e => console.error('[MyPage] Title check failed', e));
    } catch(e) {
        console.error(e);
    }

    return {
        user,
        devices: devicesResult as any[],
        parties: parties as any[],
        allAttendees: allAttendeesResult as any[],
        allGames: allGamesResult as any[],
        pendingInvitations: pendingInvitations as any[]
    };
};

export const actions: Actions = {
    createParty: async ({ request, cookies }) => {
        const userSessionToken = cookies.get('user_session');
        if (!userSessionToken) return fail(401, { error: '로그인이 필요합니다.' });
        const user = await verifyAttendeeSession(userSessionToken);
        if (!user) return fail(401, { error: '로그인이 필요합니다.' });

        const data = await request.formData();
        const partyName = data.get('partyName')?.toString();
        const gameId = data.get('gameId') ? parseInt(data.get('gameId') as string) : null;
        const gameName = data.get('gameName')?.toString() || null;
        const duration = data.get('duration') ? parseInt(data.get('duration') as string) : null;
        const guestCount = parseInt(data.get('guestCount')?.toString() || '0');
        const memberIds = data.getAll('memberIds').map(id => parseInt(id.toString()));

        if (!partyName) return fail(400, { error: '팟 이름을 입력해주세요.' });

        try {
            const { partyId, inviteeIds } = await PartyService.createParty(user.id, { name: partyName, gameId, gameName, duration, guestCount, memberIds });
            // 초대 알림 발송 (non-blocking)
            for (const inviteeId of inviteeIds) {
                NotificationService.notify(inviteeId, {
                    type: 'party_invite',
                    title: '고정팟 초대',
                    body: `${user.name}님이 '${partyName}' 고정팟에 초대했습니다`,
                    url: '/mypage?tab=parties'
                }, user.id, `party_invite:${partyId}`).catch(console.error);
            }
            return { success: true };
        } catch (e: any) {
            return fail(500, { error: e.message || '고정팟 생성에 실패했습니다.' });
        }
    },

    updateParty: async ({ request, cookies }) => {
        const userSessionToken = cookies.get('user_session');
        if (!userSessionToken) return fail(401, { error: '로그인이 필요합니다.' });
        const user = await verifyAttendeeSession(userSessionToken);
        if (!user) return fail(401, { error: '로그인이 필요합니다.' });

        const data = await request.formData();
        const partyId = parseInt(data.get('partyId')?.toString() || '0');
        const partyName = data.get('partyName')?.toString();
        const gameId = data.get('gameId') ? parseInt(data.get('gameId') as string) : null;
        const gameName = data.get('gameName')?.toString() || null;
        const duration = data.get('duration') ? parseInt(data.get('duration') as string) : null;
        const guestCount = parseInt(data.get('guestCount')?.toString() || '0');
        const memberIds = data.getAll('memberIds').map(id => parseInt(id.toString()));

        if (!partyId || !partyName) return fail(400, { error: '필수 정보가 누락되었습니다.' });

        try {
            const { newInviteeIds } = await PartyService.updateParty(user.id, partyId, { name: partyName, gameId, gameName, duration, guestCount, memberIds });
            // 새로 초대된 멤버에게 알림 발송 (non-blocking)
            for (const inviteeId of newInviteeIds) {
                NotificationService.notify(inviteeId, {
                    type: 'party_invite',
                    title: '고정팟 초대',
                    body: `${user.name}님이 '${partyName}' 고정팟에 초대했습니다`,
                    url: '/mypage?tab=parties'
                }, user.id, `party_invite:${partyId}`).catch(console.error);
            }
            return { success: true };
        } catch (e: any) {
            if (e.message === 'Not authorized') return fail(403, { error: '권한이 없습니다.' });
            return fail(500, { error: e.message || '고정팟 수정에 실패했습니다.' });
        }
    },

    deleteParty: async ({ request, cookies }) => {
        const userSessionToken = cookies.get('user_session');
        if (!userSessionToken) return fail(401, { error: '로그인이 필요합니다.' });
        const user = await verifyAttendeeSession(userSessionToken);
        if (!user) return fail(401, { error: '로그인이 필요합니다.' });

        const data = await request.formData();
        const partyId = parseInt(data.get('partyId')?.toString() || '0');
        if (!partyId) return fail(400, { error: '잘못된 요청입니다.' });

        try {
            const deleted = await PartyService.deleteParty(user.id, partyId);
            if (!deleted) return fail(404, { error: '고정팟을 찾을 수 없습니다.' });
            return { success: true };
        } catch (e: any) {
            return fail(500, { error: e.message || '고정팟 삭제에 실패했습니다.' });
        }
    },

    acceptInvite: async ({ request, cookies }) => {
        const userSessionToken = cookies.get('user_session');
        if (!userSessionToken) return fail(401, { error: '로그인이 필요합니다.' });
        const user = await verifyAttendeeSession(userSessionToken);
        if (!user) return fail(401, { error: '로그인이 필요합니다.' });

        const data = await request.formData();
        const partyId = parseInt(data.get('partyId')?.toString() || '0');
        if (!partyId) return fail(400, { error: '잘못된 요청입니다.' });

        try {
            const accepted = await PartyService.acceptInvite(partyId, user.id);
            if (!accepted) return fail(404, { error: '초대를 찾을 수 없습니다.' });
            return { success: true };
        } catch (e: any) {
            return fail(500, { error: e.message || '초대 수락에 실패했습니다.' });
        }
    },

    declineInvite: async ({ request, cookies }) => {
        const userSessionToken = cookies.get('user_session');
        if (!userSessionToken) return fail(401, { error: '로그인이 필요합니다.' });
        const user = await verifyAttendeeSession(userSessionToken);
        if (!user) return fail(401, { error: '로그인이 필요합니다.' });

        const data = await request.formData();
        const partyId = parseInt(data.get('partyId')?.toString() || '0');
        if (!partyId) return fail(400, { error: '잘못된 요청입니다.' });

        try {
            const declined = await PartyService.declineInvite(partyId, user.id);
            if (!declined) return fail(404, { error: '초대를 찾을 수 없습니다.' });
            return { success: true };
        } catch (e: any) {
            return fail(500, { error: e.message || '초대 거절에 실패했습니다.' });
        }
    },

    leaveParty: async ({ request, cookies }) => {
        const userSessionToken = cookies.get('user_session');
        if (!userSessionToken) return fail(401, { error: '로그인이 필요합니다.' });
        const user = await verifyAttendeeSession(userSessionToken);
        if (!user) return fail(401, { error: '로그인이 필요합니다.' });

        const data = await request.formData();
        const partyId = parseInt(data.get('partyId')?.toString() || '0');
        if (!partyId) return fail(400, { error: '잘못된 요청입니다.' });

        try {
            const left = await PartyService.leaveParty(partyId, user.id);
            if (!left) return fail(404, { error: '고정팟을 찾을 수 없습니다.' });
            return { success: true };
        } catch (e: any) {
            return fail(400, { error: e.message || '고정팟 나가기에 실패했습니다.' });
        }
    },

    deleteDevice: async ({ request, cookies }) => {
        const userSessionToken = cookies.get('user_session');
        if (!userSessionToken) return redirect(302, '/login');
        const user = await verifyAttendeeSession(userSessionToken);
        if (!user) return redirect(302, '/login');

        const data = await request.formData();
        const deviceId = data.get('deviceId');

        if (!deviceId) return { error: 'Invalid ID' };

        try {
            const devRes = await db.execute(sql`SELECT irk FROM user_devices WHERE id = ${deviceId} AND attendee_id = ${user.id}`);
            await db.execute(sql`DELETE FROM user_devices WHERE id = ${deviceId} AND attendee_id = ${user.id}`);
            if (devRes.length > 0) {
                const irk = (devRes[0] as any).irk;
                removeFromIrkCache(user.id, irk);
                // BLE 서버에 IRK 삭제 알림 (fire-and-forget)
                const BLE_SERVER_URL = process.env.BLE_SERVER_URL || 'http://ble-server:3001';
                const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'ble_internal_secret_2026';
                fetch(`${BLE_SERVER_URL}/irk/remove`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-internal-key': INTERNAL_API_KEY },
                    body: JSON.stringify({ attendee_id: user.id, irk_hex: irk })
                }).catch(e => console.error('[IRK] Failed to notify BLE server (remove):', e));
            }
            return { success: true };
        } catch (e) {
            return { error: '기기 삭제에 실패했습니다.' };
        }
    }
};

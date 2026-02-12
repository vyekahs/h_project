import { query } from '$lib/server/db';
import { verifyAttendeeSession } from '$lib/server/auth';
import { removeFromIrkCache } from '$lib/server/ble';
import { PartyService } from '$lib/server/services/partyService';
import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ parent }) => {
    const { user } = await parent();

    if (!user) {
        throw redirect(302, '/login');
    }

    // Fetch Game History
    const historyResult = await query(`
        SELECT 
            gs.id, 
            gs.game_name, 
            gs.end_time,
            sp.score as my_score, 
            sp.is_winner as is_winner,
            (
                SELECT json_agg(json_build_object(
                    'name', a2.name, 
                    'score', sp2.score, 
                    'is_winner', sp2.is_winner
                ))
                FROM session_participants sp2
                JOIN attendees a2 ON sp2.attendee_id = a2.id
                WHERE sp2.session_id = gs.id AND sp2.attendee_id != $1
            ) as opponents
        FROM session_participants sp
        JOIN game_sessions gs ON sp.session_id = gs.id
        WHERE sp.attendee_id = $1 AND gs.status = 'finished'
        ORDER BY gs.end_time DESC
    `, [user.id]);

    // Fetch Stats
    const statsResult = await query(`
        SELECT 
            COUNT(*) as total_games,
            COUNT(*) FILTER (WHERE is_winner = true) as total_wins
        FROM session_participants sp
        JOIN game_sessions gs ON sp.session_id = gs.id
        WHERE sp.attendee_id = $1 AND gs.status = 'finished'
    `, [user.id]);

    const stats = statsResult.rows[0];

    // Fetch Registered Devices & Parties & All Attendees & All Games
    const [devicesResult, parties, allAttendeesResult, allGamesResult] = await Promise.all([
        query('SELECT id, name, created_at, last_seen_at FROM user_devices WHERE attendee_id = $1 ORDER BY created_at DESC', [user.id]),
        PartyService.getUserParties(user.id),
        query('SELECT id, name FROM attendees ORDER BY name ASC'),
        query('SELECT id, name, playtime_min, image_url FROM games ORDER BY name ASC')
    ]);
    // Trigger Title Check (Background)
    try {
        import('$lib/server/services/titleService').then(({ TitleService }) => TitleService.checkAndAssignTitles(user.id)).catch(e => console.error('[MyPage] Title check failed', e));
    } catch(e) {
        console.error(e);
    }

    return {
        user,
        history: historyResult.rows,
        stats,
        devices: devicesResult.rows,
        parties,
        allAttendees: allAttendeesResult.rows,
        allGames: allGamesResult.rows
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
            await PartyService.createParty(user.id, { name: partyName, gameId, gameName, duration, guestCount, memberIds });
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
            await PartyService.updateParty(user.id, partyId, { name: partyName, gameId, gameName, duration, guestCount, memberIds });
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

    deleteDevice: async ({ request, cookies }) => {
        const userSessionToken = cookies.get('user_session');
        if (!userSessionToken) return redirect(302, '/login');
        const user = await verifyAttendeeSession(userSessionToken);
        if (!user) return redirect(302, '/login');

        const data = await request.formData();
        const deviceId = data.get('deviceId');

        if (!deviceId) return { error: 'Invalid ID' };

        try {
            const devRes = await query('SELECT irk FROM user_devices WHERE id = $1 AND attendee_id = $2', [deviceId, user.id]);
            await query('DELETE FROM user_devices WHERE id = $1 AND attendee_id = $2', [deviceId, user.id]);
            if (devRes.rows.length > 0) {
                removeFromIrkCache(user.id, devRes.rows[0].irk);
            }
            return { success: true };
        } catch (e) {
            return { error: '기기 삭제에 실패했습니다.' };
        }
    }
};

import { query } from '$lib/server/db';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { verifyAttendeeSession } from '$lib/server/auth';
import { emitLiveEvent } from '$lib/server/liveEvents';

export const load: PageServerLoad = async ({ params, cookies, url }) => {
    const token = params.token;
    const sessionToken = cookies.get('user_session');

    // 1. Check if logged in
    if (!sessionToken) {
         // Redirect to login with return URL
         throw redirect(303, `/login?redirectTo=${url.pathname}`);
    }

    const user = await verifyAttendeeSession(sessionToken);
    if (!user) {
        // Session invalid
        throw redirect(303, `/login?redirectTo=${url.pathname}`);
    }

    // 2. Validate Token
    const tokenResult = await query('SELECT * FROM qr_tokens WHERE token = $1', [token]);
    
    if (tokenResult.rows.length === 0) {
        return {
            success: false,
            error: '유효하지 않은 QR 코드입니다.'
        };
    }

    const tokenData = tokenResult.rows[0];
    if (new Date() > new Date(tokenData.expires_at)) {
        return {
            success: false,
            error: '만료된 QR 코드입니다. 다시 스캔해주세요.'
        };
    }

    // 3. Process Check-in
    try {
        await query('BEGIN');

        // Idempotency: Is this exact user already present?
        const currentUserCheck = await query('SELECT status FROM attendees WHERE id = $1', [user.id]);
        if (currentUserCheck.rows.length > 0 && currentUserCheck.rows[0].status === 'present') {
             // Already checked in. Do nothing, just return success.
             await query('COMMIT');
             return {
                 success: true,
                 user,
                 message: '이미 입장 처리되었습니다. 즐거운 시간 되세요!'
             };
        }

        // Duplicate Check: Is any OTHER user with the same name present?
        // This handles conflicts where an admin manually added "Guest" and now "Guest" (different ID) tries to QR check-in.
        const duplicateCheck = await query('SELECT id FROM attendees WHERE name = $1 AND status = $2 AND id != $3', [user.name, 'present', user.id]);
        if (duplicateCheck.rows.length > 0) {
             await query('ROLLBACK');
             return {
                 success: false,
                 error: '이미 입장 처리된 사용자입니다. (이름 중복) 관리자에게 문의하세요.'
             };
        }

        // Update status to 'present' AND update arrival_time/updated_at
        // This ensures they appear at the top of the list if sorted by arrival_time
        await query('UPDATE attendees SET status = $1, arrival_time = NOW(), updated_at = NOW() WHERE id = $2', ['present', user.id]);
        
        // Record visit
        await query('INSERT INTO visits (attendee_id, arrival_time) VALUES ($1, NOW())', [user.id]);
        await query('COMMIT');

        emitLiveEvent('visitors');
        return {
            success: true,
            user
        };
    } catch (err) {
        await query('ROLLBACK');
        console.error(err);
        return {
            success: false,
            error: '체크인 처리 중 오류가 발생했습니다.'
        };
    }
};

import { query } from '$lib/server/db';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, cookies, url }) => {
    const token = params.token;
    const userAuth = cookies.get('user_auth');

    // 1. Check if logged in
    if (!userAuth) {
        // Redirect to login with return URL
        throw redirect(303, `/login?redirectTo=${url.pathname}`);
    }

    const user = JSON.parse(userAuth);

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
        // Update status to 'present'
        await query('UPDATE attendees SET status = $1 WHERE id = $2', ['present', user.id]);
        
        // Record visit
        await query('INSERT INTO visits (attendee_id) VALUES ($1)', [user.id]);

        // Optional: Delete used token to prevent reuse (though it expires quickly anyway)
        // await query('DELETE FROM qr_tokens WHERE token = $1', [token]);

        return {
            success: true,
            user
        };
    } catch (err) {
        console.error(err);
        return {
            success: false,
            error: '체크인 처리 중 오류가 발생했습니다.'
        };
    }
};

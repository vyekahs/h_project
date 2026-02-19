import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
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
    const tokenResult = await db.execute(sql`SELECT * FROM qr_tokens WHERE token = ${token}`);

    if (tokenResult.length === 0) {
        return {
            success: false,
            error: '유효하지 않은 QR 코드입니다.'
        };
    }

    const tokenData = tokenResult[0] as any;
    if (new Date() > new Date(tokenData.expires_at)) {
        return {
            success: false,
            error: '만료된 QR 코드입니다. 다시 스캔해주세요.'
        };
    }

    // 3. Check if gym is open
    const settingsResult = await db.execute(sql`SELECT value FROM system_settings WHERE key = 'is_open'`);
    const isOpen = settingsResult.length > 0 && (settingsResult[0] as any).value === 'true';
    if (!isOpen) {
        return {
            success: false,
            error: '현재 마감 상태입니다. 운영 시간에 다시 시도해주세요.'
        };
    }

    // 4. Process Check-in
    try {
        const result = await db.transaction(async (tx) => {
            // Idempotency: Is this exact user already present?
            const currentUserCheck = await tx.execute(sql`SELECT status FROM attendees WHERE id = ${user.id}`);
            if (currentUserCheck.length > 0 && (currentUserCheck[0] as any).status === 'present') {
                 return { alreadyPresent: true };
            }

            // Duplicate Check: Is any OTHER user with the same name present?
            const duplicateCheck = await tx.execute(sql`SELECT id FROM attendees WHERE name = ${user.name} AND status = ${'present'} AND id != ${user.id}`);
            if (duplicateCheck.length > 0) {
                 return { duplicate: true };
            }

            // Update status to 'present' AND update arrival_time/updated_at
            await tx.execute(sql`UPDATE attendees SET status = ${'present'}, arrival_time = NOW(), updated_at = NOW() WHERE id = ${user.id}`);

            // Record visit
            await tx.execute(sql`INSERT INTO visits (attendee_id, arrival_time) VALUES (${user.id}, NOW())`);

            // 오늘 갈 예정에서 제거
            await tx.execute(sql`DELETE FROM daily_visit_plans WHERE attendee_id = ${user.id} AND plan_date = CURRENT_DATE`);
            return { success: true };
        });

        if ('alreadyPresent' in result) {
            return { success: true, user, message: '이미 입장 처리되었습니다. 즐거운 시간 되세요!' };
        }
        if ('duplicate' in result) {
            return { success: false, error: '이미 입장 처리된 사용자입니다. (이름 중복) 관리자에게 문의하세요.' };
        }

        emitLiveEvent('visitors');
        return { success: true, user };
    } catch (err) {
        console.error(err);
        return {
            success: false,
            error: '체크인 처리 중 오류가 발생했습니다.'
        };
    }
};

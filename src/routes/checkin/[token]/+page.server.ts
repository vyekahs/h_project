import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { verifyAttendeeSession } from '$lib/server/auth';
import { emitLiveEvent } from '$lib/server/liveEvents';

export const load: PageServerLoad = async ({ params, cookies, url }) => {
    const token = params.token;
    const sessionToken = cookies.get('user_session');

    // 1. Check if logged in
    if (!sessionToken) {
        throw redirect(303, `/login?redirectTo=${url.pathname}`);
    }

    const user = await verifyAttendeeSession(sessionToken);
    if (!user) {
        throw redirect(303, `/login?redirectTo=${url.pathname}`);
    }

    // 2. Validate Token
    const tokenResult = await db.execute(sql`SELECT * FROM qr_tokens WHERE token = ${token}`);
    if (tokenResult.length === 0) {
        return { phase: 'error' as const, error: '유효하지 않은 QR 코드입니다.' };
    }

    const tokenData = tokenResult[0] as any;
    if (new Date() > new Date(tokenData.expires_at)) {
        return { phase: 'error' as const, error: '만료된 QR 코드입니다. 다시 스캔해주세요.' };
    }

    // 3. Check if gym is open
    const settingsResult = await db.execute(sql`SELECT value FROM system_settings WHERE key = 'is_open'`);
    const isOpen = settingsResult.length > 0 && (settingsResult[0] as any).value === 'true';
    if (!isOpen) {
        return { phase: 'error' as const, error: '현재 마감 상태입니다. 운영 시간에 다시 시도해주세요.' };
    }

    // 4. All checks passed — show confirmation
    return { phase: 'confirm' as const, userName: user.name };
};

export const actions: Actions = {
    checkin: async ({ params, cookies }) => {
        const token = params.token;
        const sessionToken = cookies.get('user_session');

        if (!sessionToken) {
            return fail(401, { success: false as const, error: '로그인이 필요합니다.' });
        }

        const user = await verifyAttendeeSession(sessionToken);
        if (!user) {
            return fail(401, { success: false as const, error: '세션이 만료되었습니다. 다시 로그인해주세요.' });
        }

        // Validate token
        const tokenResult = await db.execute(sql`SELECT * FROM qr_tokens WHERE token = ${token}`);
        if (tokenResult.length === 0) {
            return fail(400, { success: false as const, error: '유효하지 않은 QR 코드입니다.' });
        }

        const tokenData = tokenResult[0] as any;
        if (new Date() > new Date(tokenData.expires_at)) {
            return fail(400, { success: false as const, error: '만료된 QR 코드입니다. 다시 스캔해주세요.' });
        }

        // Check if gym is open
        const settingsResult = await db.execute(sql`SELECT value FROM system_settings WHERE key = 'is_open'`);
        const isOpen = settingsResult.length > 0 && (settingsResult[0] as any).value === 'true';
        if (!isOpen) {
            return fail(400, { success: false as const, error: '현재 마감 상태입니다. 운영 시간에 다시 시도해주세요.' });
        }

        // Process Check-in
        try {
            const result = await db.transaction(async (tx) => {
                const currentUserCheck = await tx.execute(sql`SELECT status FROM attendees WHERE id = ${user.id}`);
                if (currentUserCheck.length > 0 && (currentUserCheck[0] as any).status === 'present') {
                    return { alreadyPresent: true };
                }

                const duplicateCheck = await tx.execute(sql`SELECT id FROM attendees WHERE name = ${user.name} AND status = ${'present'} AND id != ${user.id}`);
                if (duplicateCheck.length > 0) {
                    return { duplicate: true };
                }

                await tx.execute(sql`UPDATE attendees SET status = ${'present'}, arrival_time = NOW(), updated_at = NOW() WHERE id = ${user.id}`);
                await tx.execute(sql`INSERT INTO visits (attendee_id, arrival_time) VALUES (${user.id}, NOW())`);
                await tx.execute(sql`DELETE FROM daily_visit_plans WHERE attendee_id = ${user.id} AND plan_date = CURRENT_DATE`);
                return { success: true };
            });

            if ('alreadyPresent' in result) {
                return { success: true as const, userName: user.name };
            }
            if ('duplicate' in result) {
                return fail(400, { success: false as const, error: '이미 입장 처리된 사용자입니다. (이름 중복) 관리자에게 문의하세요.' });
            }

            emitLiveEvent('visitors');
            return { success: true as const, userName: user.name };
        } catch (err) {
            console.error(err);
            return fail(500, { success: false as const, error: '체크인 처리 중 오류가 발생했습니다.' });
        }
    }
};

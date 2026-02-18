import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
    const attendeeId = params.id;

    if (!attendeeId) {
        throw error(400, 'Invalid attendee ID');
    }

    // 1. Fetch Attendee Info
    const attendeeResult = await db.execute(sql`SELECT id, name, status, arrival_time, season_pass_expires_at FROM attendees WHERE id = ${attendeeId}`);

    if (attendeeResult.length === 0) {
        throw error(404, 'Attendee not found');
    }
    const attendee = attendeeResult[0] as any;

    // 2. Fetch Game History
    const historyResult = await db.execute(sql`
        SELECT
            gs.id,
            gs.game_name,
            gs.start_time,
            gs.end_time,
            gs.status,
            ROUND(EXTRACT(EPOCH FROM (COALESCE(gs.end_time, NOW()) - gs.start_time))/60) as duration_minutes
        FROM game_sessions gs
        JOIN session_participants sp ON gs.id = sp.session_id
        WHERE sp.attendee_id = ${attendeeId}
        ORDER BY gs.start_time DESC
    `);

    // 3. Fetch Partners
    const partnersResult = await db.execute(sql`
        SELECT
            a.id,
            a.name,
            COUNT(*) as game_count
        FROM session_participants sp1
        JOIN session_participants sp2 ON sp1.session_id = sp2.session_id
        JOIN attendees a ON sp2.attendee_id = a.id
        WHERE sp1.attendee_id = ${attendeeId} AND sp2.attendee_id != ${attendeeId}
        GROUP BY a.id, a.name
        ORDER BY game_count DESC
        LIMIT 10
    `);

    // 4. Fetch Visit History
    const visitsResult = await db.execute(sql`
        SELECT
            arrival_time,
            departure_time,
            ROUND(EXTRACT(EPOCH FROM (COALESCE(departure_time, NOW()) - arrival_time))/60) as duration_minutes
        FROM visits
        WHERE attendee_id = ${attendeeId}
        ORDER BY arrival_time DESC
    `);

    return {
        attendee,
        history: historyResult as any[],
        partners: partnersResult as any[],
        visits: visitsResult as any[]
    };
};

import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import bcrypt from 'bcryptjs';

export const actions: Actions = {
    resetPassword: async ({ request, params }) => {
        const data = await request.formData();
        const newPassword = data.get('newPassword') as string;
        const attendeeId = params.id;

        if (!newPassword || newPassword.length < 4) {
            return fail(400, { error: '비밀번호는 4자 이상이어야 합니다.' });
        }

        try {
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            await db.execute(sql`UPDATE attendees SET password = ${hashedPassword} WHERE id = ${attendeeId}`);
            return { success: true };
        } catch (err) {
            console.error(err);
            return fail(500, { error: '비밀번호 변경 중 오류가 발생했습니다.' });
        }
    },

    updateSeasonPass: async ({ request, params }) => {
        const data = await request.formData();
        const startDateStr = data.get('startDate') as string;
        const attendeeId = params.id;

        if (!startDateStr) {
            return fail(400, { error: '시작일을 입력해주세요.' });
        }

        try {
            const startDate = new Date(startDateStr);
            const endDate = new Date(startDate);
            endDate.setDate(endDate.getDate() + 29);

            // 마감일이 월요일(1) 또는 화요일(2)이면 수요일(3)로 연장
            const dow = endDate.getDay();
            if (dow === 1) endDate.setDate(endDate.getDate() + 2);
            else if (dow === 2) endDate.setDate(endDate.getDate() + 1);

            await db.execute(sql`UPDATE attendees SET season_pass_expires_at = ${endDate} WHERE id = ${attendeeId}`);
            return { success: true, message: '정기권이 발급되었습니다.' };
        } catch (err) {
            console.error(err);
            return fail(500, { error: '정기권 발급 중 오류가 발생했습니다.' });
        }
    },

    adjustSeasonPass: async ({ request, params }) => {
        const data = await request.formData();
        const days = parseInt(data.get('days') as string);
        const attendeeId = params.id;

        if (isNaN(days)) {
            return fail(400, { error: '잘못된 요청입니다.' });
        }

        try {
            const result = await db.execute(sql`SELECT season_pass_expires_at FROM attendees WHERE id = ${attendeeId}`);
            if (!(result[0] as any)?.season_pass_expires_at) {
                return fail(400, { error: '유효한 정기권이 없습니다.' });
            }

            await db.execute(sql`
                UPDATE attendees SET season_pass_expires_at = season_pass_expires_at + interval '1 day' * ${days} WHERE id = ${attendeeId}
            `);
            return { success: true, message: `정기권이 ${days > 0 ? days + '일 연장' : Math.abs(days) + '일 단축'}되었습니다.` };
        } catch (err) {
            console.error(err);
            return fail(500, { error: '정기권 조정 중 오류가 발생했습니다.' });
        }
    },

    cancelSeasonPass: async ({ params }) => {
        const attendeeId = params.id;
        try {
            await db.execute(sql`UPDATE attendees SET season_pass_expires_at = NULL WHERE id = ${attendeeId}`);
            return { success: true, message: '정기권이 취소되었습니다.' };
        } catch (err) {
            console.error(err);
            return fail(500, { error: '정기권 취소 중 오류가 발생했습니다.' });
        }
    }
};

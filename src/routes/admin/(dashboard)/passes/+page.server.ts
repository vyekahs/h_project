import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async () => {
    const result = await db.execute(sql`
        SELECT id, name, season_pass_expires_at
        FROM attendees
        WHERE season_pass_expires_at IS NOT NULL
        ORDER BY season_pass_expires_at ASC
    `);

    const allUsersResult = await db.execute(sql`
        SELECT id, name
        FROM attendees
        ORDER BY name ASC
    `);

    return {
        passHolders: result,
        allUsers: allUsersResult
    };
};

export const actions: Actions = {
    grantPass: async ({ request }) => {
        const data = await request.formData();
        const attendeeId = data.get('attendeeId') as string;
        const startDateStr = data.get('startDate') as string;

        if (!attendeeId) {
            return fail(400, { error: '사용자를 선택해주세요.' });
        }

        if (!startDateStr) {
            return fail(400, { error: '시작일을 선택해주세요.' });
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
            return { success: true };
        } catch (err) {
            console.error(err);
            return fail(500, { error: '정기권 발급 중 오류가 발생했습니다.' });
        }
    },

    adjustPass: async ({ request }) => {
        const data = await request.formData();
        const attendeeId = data.get('attendeeId') as string;
        const days = parseInt(data.get('days') as string);

        if (!attendeeId || isNaN(days)) {
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
            return { success: true };
        } catch (err) {
            console.error(err);
            return fail(500, { error: '정기권 조정 중 오류가 발생했습니다.' });
        }
    },

    cancelPass: async ({ request }) => {
        const data = await request.formData();
        const attendeeId = data.get('attendeeId') as string;

        if (!attendeeId) {
            return fail(400, { error: '사용자 ID가 없습니다.' });
        }

        try {
            await db.execute(sql`UPDATE attendees SET season_pass_expires_at = NULL WHERE id = ${attendeeId}`);
            return { success: true };
        } catch (err) {
            console.error(err);
            return fail(500, { error: '정기권 취소 중 오류가 발생했습니다.' });
        }
    }
};

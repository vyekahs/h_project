import { query } from '$lib/server/db';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async () => {
    const result = await query(`
        SELECT id, name, season_pass_expires_at
        FROM attendees
        WHERE season_pass_expires_at IS NOT NULL
        ORDER BY season_pass_expires_at ASC
    `);

    const allUsersResult = await query(`
        SELECT id, name
        FROM attendees
        ORDER BY name ASC
    `);

    return {
        passHolders: result.rows,
        allUsers: allUsersResult.rows
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

            await query('UPDATE attendees SET season_pass_expires_at = $1 WHERE id = $2', [endDate, attendeeId]);
            return { success: true };
        } catch (err) {
            console.error(err);
            return fail(500, { error: '정기권 발급 중 오류가 발생했습니다.' });
        }
    },

    cancelPass: async ({ request }) => {
        const data = await request.formData();
        const attendeeId = data.get('attendeeId') as string;

        if (!attendeeId) {
            return fail(400, { error: '사용자 ID가 없습니다.' });
        }

        try {
            await query('UPDATE attendees SET season_pass_expires_at = NULL WHERE id = $1', [attendeeId]);
            return { success: true };
        } catch (err) {
            console.error(err);
            return fail(500, { error: '정기권 취소 중 오류가 발생했습니다.' });
        }
    }
};

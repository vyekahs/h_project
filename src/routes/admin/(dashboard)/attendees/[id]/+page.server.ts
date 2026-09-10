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
    const attendeeResult = await db.execute(sql`SELECT id, name, status, arrival_time, season_pass_expires_at, penalty_points, is_blacklisted FROM attendees WHERE id = ${attendeeId}`);

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

    // 페널티 집행 이력 — "왜 이 사람이 3점인지"에 답할 수 있어야 한다
    const penaltyLogResult = await db.execute(sql`
        SELECT points, reason, total_after, created_at
        FROM penalty_logs
        WHERE attendee_id = ${params.id}
        ORDER BY created_at DESC
        LIMIT 50
    `);

    // 진행 중이거나 예정된 예약
    const reservationResult = await db.execute(sql`
        SELECT r.id, r.status, r.created_at, gs.game_name, gs.status AS session_status,
               gs.scheduled_at, gs.start_time
        FROM reservations r
        JOIN game_sessions gs ON gs.id = r.session_id
        WHERE r.attendee_id = ${params.id}
          AND gs.status IN ('scheduled', 'playing')
        ORDER BY r.created_at DESC
    `);

    return {
        attendee,
        history: historyResult as any[],
        partners: partnersResult as any[],
        visits: visitsResult as any[],
        penaltyLogs: penaltyLogResult as any[],
        reservations: reservationResult as any[]
    };
};

import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import bcrypt from 'bcryptjs';
/* 정기권 쓰기는 이 모듈 하나로 — 정기권 페이지도 같은 함수를 부른다 */
import { issuePass, adjustPassDays, cancelPass } from '$lib/server/seasonPass';
import { recordUndo } from '$lib/server/adminUndo';

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

    /*
        발급·조정은 정기권 페이지와 같은 모듈을 쓴다.

        예전에는 여기가 attendees 값만 덮고 이력도 되돌리기도 남기지 않았다.
        게다가 월·화 보정을 한 번만 밀어서(월→수) 정기권 페이지와 같은 시작일에도
        만료일이 달라질 수 있었다 — computePassPeriod 는 막힌 날을 하루씩 넘긴다.
    */
    updateSeasonPass: async ({ request, params }) => {
        const data = await request.formData();
        const res = await issuePass({
            attendeeId: Number(params.id),
            startDate: String(data.get('startDate') ?? ''),
            note: '회원 상세에서 발급'
        });
        if (!res.ok) return fail(res.status, { error: res.error });

        await recordUndo('pass_grant', res.payload, `정기권 발급 (${res.label})`);
        return { success: true, message: '정기권이 발급되었습니다.' };
    },

    adjustSeasonPass: async ({ request, params }) => {
        const data = await request.formData();
        const days = parseInt(data.get('days') as string);
        if (isNaN(days)) return fail(400, { error: '잘못된 요청입니다.' });

        /* 이 화면에는 사유 목록이 없다. 어디서 눌렀는지만이라도 남긴다. */
        const res = await adjustPassDays({
            attendeeId: Number(params.id),
            days,
            reasonLabel: '회원 상세에서 조정'
        });
        if (!res.ok) return fail(res.status, { error: res.error });

        await recordUndo('pass_adjust', res.payload, `정기권 ${days > 0 ? '+' : ''}${days}일`);
        return {
            success: true,
            message: `정기권이 ${days > 0 ? days + '일 연장' : Math.abs(days) + '일 단축'}되었습니다.`
        };
    },

    /*
        해지. 이 콘솔에서 정기권을 흔적 없이 지울 수 있던 마지막 경로였다 —
        만료일을 NULL 로 밀면 목록 조회(WHERE season_pass_expires_at IS NOT NULL)에서
        빠지므로, 왜 사라졌는지 나중에 아무도 알 수 없었다. 2026-09-10 에 「만료된
        정기권이 다 사라졌다」를 추적할 때 근거가 없던 이유가 이것이다.

        이제 남은 일수를 음수로 적은 이력 한 줄을 남기고, 되돌릴 수 있다.
    */
    cancelSeasonPass: async ({ params }) => {
        const res = await cancelPass({
            attendeeId: Number(params.id),
            note: '회원 상세에서 해지'
        });
        if (!res.ok) return fail(res.status, { error: res.error });

        await recordUndo('pass_grant', res.payload, '정기권 해지');
        return { success: true, message: '정기권이 취소되었습니다.' };
    }
};

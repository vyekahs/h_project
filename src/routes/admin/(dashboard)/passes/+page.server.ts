import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { verifyAdminSession } from '$lib/server/auth';
import { recordUndo, takeUndo, applyUndo } from '$lib/server/adminUndo';
import { PASS_DAYS } from '$lib/passPeriod';
/* 쓰기는 이 모듈 하나로 — 회원 상세 페이지도 같은 함수를 부른다 */
import { issuePass, adjustPassDays, MAX_ADJUST_DAYS } from '$lib/server/seasonPass';

async function requireAdmin(request: Request) {
    const token = request.headers.get('cookie')?.match(/admin_session=([^;]+)/)?.[1];
    return !!token && (await verifyAdminSession(token));
}

/** 조정 사유는 마스터에서 읽는다 — 상수가 아니라 테이블이라 운영 중에 늘어난다. */
async function loadReason(tx: any, reasonId: number) {
    const rows = await tx.execute(sql`
        SELECT id, label FROM season_pass_reasons WHERE id = ${reasonId}
    `);
    const r = (rows as any[])[0];
    if (!r) return null;
    return { id: Number(r.id), label: String(r.label) };
}

export const load: PageServerLoad = async () => {
    const [holders, allUsers, reasons, logs] = await Promise.all([
        db.execute(sql`
            SELECT id, name, season_pass_expires_at
            FROM attendees
            WHERE season_pass_expires_at IS NOT NULL
            ORDER BY season_pass_expires_at ASC
        `),
        /*
            발급 대상. 예전에는 필터가 하나도 없어 운영진·블랙리스트까지 목록에
            들어갔다. 이미 정기권이 있는 사람은 빼지 않고 남은 일수를 함께 보낸다 —
            발급이 기존 정기권을 덮어쓰므로, 고르는 순간 경고할 수 있어야 한다.
        */
        db.execute(sql`
            SELECT id, name, season_pass_expires_at
            FROM attendees
            WHERE is_admin = false AND is_blacklisted = false
            ORDER BY name ASC
        `),
        db.execute(sql`
            SELECT id, label
            FROM season_pass_reasons
            ORDER BY sort_order, id
        `),
        /*
            카드마다 접어 두는 이력 — 그 카드가 보여주는 정기권의 것만.

            회원 단위로 묶으면 재발급한 카드에 지난 정기권의 조정이 따라붙는다.
            지금 정기권은 마지막 발급 행이 열었으므로, 그 id 를 pass_id 로 갖는
            행만 모은다. 발급 기록이 없는 옛 정기권은 pass_id 가 NULL 이고,
            그때는 NULL 끼리 묶인다(IS NOT DISTINCT FROM).
        */
        db.execute(sql`
            WITH cur AS (
                SELECT attendee_id, MAX(id) FILTER (WHERE action = 'grant') AS pass_id
                FROM season_pass_logs GROUP BY attendee_id
            )
            SELECT l.id, l.attendee_id, l.action, l.reason_label, l.note, l.days,
                   l.expires_before, l.expires_after, l.actor, l.created_at
            FROM season_pass_logs l
            JOIN cur c ON c.attendee_id = l.attendee_id
            WHERE l.pass_id IS NOT DISTINCT FROM c.pass_id
            ORDER BY l.attendee_id, l.created_at DESC, l.id DESC
        `)
    ]);

    return {
        passHolders: holders,
        allUsers,
        reasons,
        logs,
        passDays: PASS_DAYS
    };
};

export const actions: Actions = {
    /*
        발급.

        이전 만료일을 먼저 읽어 이력에 남긴다. 발급은 더하는 게 아니라 덮어쓰므로
        (남은 20일이 조용히 사라진다) 그 손실이 기록에 드러나야 한다.
        UPDATE 와 이력은 한 트랜잭션에 있다 — 예전에는 따로 나가서 만료일만 바뀌고
        기록은 없는 상태가 가능했다.
    */
    grantPass: async ({ request }) => {
        if (!(await requireAdmin(request))) return fail(403, { error: '권한이 없습니다.' });

        const data = await request.formData();
        const res = await issuePass({
            attendeeId: Number(data.get('attendeeId')),
            startDate: String(data.get('startDate') ?? ''),
            note: String(data.get('note') ?? '')
        });
        if (!res.ok) return fail(res.status, { error: res.error });

        const undo = await recordUndo('pass_grant', res.payload, `정기권 발급 (${res.label})`);
        return { success: true, undo, expiresDate: res.expiresDate, totalDays: res.totalDays };
    },

    /* 조정. 사유가 필수로 바뀌었다 — 왜 하루를 더 줬는지가 남지 않으면 이력이 아니다. */
    adjustPass: async ({ request }) => {
        if (!(await requireAdmin(request))) return fail(403, { error: '권한이 없습니다.' });

        const data = await request.formData();
        const days = Number(data.get('days'));
        const reasonId = Number(data.get('reasonId'));
        if (!reasonId) return fail(400, { error: '사유를 선택해주세요.' });

        const reason = await loadReason(db, reasonId);
        if (!reason) return fail(400, { error: '사유를 선택해주세요.' });

        const res = await adjustPassDays({
            attendeeId: Number(data.get('attendeeId')),
            days,
            reasonId: reason.id,
            reasonLabel: reason.label
        });
        if (!res.ok) return fail(res.status, { error: res.error });

        const sign = days > 0 ? `+${days}` : String(days);
        const undo = await recordUndo('pass_adjust', res.payload, `정기권 ${sign}일 (${res.label})`);
        return { success: true, undo };
    },

    /* 조정 사유 마스터. 한 번 등록하면 여러 사람에게 같은 문구로 쓰인다. */
    addReason: async ({ request }) => {
        if (!(await requireAdmin(request))) return fail(403, { error: '권한이 없습니다.' });

        const data = await request.formData();
        const label = String(data.get('label') ?? '').trim();

        if (!label) return fail(400, { error: '사유를 입력해주세요.' });
        if (label.length > 60) return fail(400, { error: '사유는 60자까지 쓸 수 있습니다.' });

        try {
            await db.execute(sql`
                INSERT INTO season_pass_reasons (label, sort_order)
                VALUES (${label},
                        COALESCE((SELECT MAX(sort_order) + 1 FROM season_pass_reasons), 1))
            `);
            return { success: true };
        } catch (err) {
            console.error('addReason failed:', err);
            return fail(500, { error: '사유를 추가하지 못했습니다.' });
        }
    },

    /*
        사유를 지운다.

        이력이 깨지지 않는 이유는 두 가지다 — FK 가 ON DELETE SET NULL 이고,
        이력이 등록 당시 라벨을 reason_label 로 따로 들고 있다. 그래서 사유가
        사라져도 「서비스 제공 +1일」이라고 적힌 지난 기록은 그대로 읽힌다.
    */
    deleteReason: async ({ request }) => {
        if (!(await requireAdmin(request))) return fail(403, { error: '권한이 없습니다.' });

        const data = await request.formData();
        const id = Number(data.get('reasonId'));
        if (!id) return fail(400, { error: '잘못된 요청입니다.' });

        try {
            await db.execute(sql`DELETE FROM season_pass_reasons WHERE id = ${id}`);
            return { success: true };
        } catch (err) {
            console.error('deleteReason failed:', err);
            return fail(500, { error: '사유를 지우지 못했습니다.' });
        }
    },

    /*
        되돌리기. 「최근 조치」 패널은 페이지를 옮겨도 남고 버튼은 누르는 시점의
        URL 로 POST 하므로, 이 라우트도 같은 액션 이름을 갖고 있어야 한다.
        무엇을 어떻게 되돌릴지는 서버에 남긴 기록만 보고 정한다.
    */
    undoAdminAction: async ({ request }) => {
        if (!(await requireAdmin(request))) return fail(403, { error: '권한이 없습니다.' });

        const data = await request.formData();
        const undoId = Number(data.get('undoId'));
        if (!undoId) return fail(400, { error: '잘못된 요청입니다.' });

        const taken = await takeUndo(undoId);
        if (!taken.ok) {
            const message =
                taken.reason === 'already_undone'
                    ? '이미 되돌린 조치입니다.'
                    : taken.reason === 'expired'
                      ? '되돌릴 수 있는 시간이 지났습니다.'
                      : '되돌릴 기록을 찾지 못했습니다.';
            return fail(410, { error: message });
        }

        const applied = await applyUndo(taken);
        if (!applied.ok) return fail(applied.status, { error: applied.error });

        return { success: true, undoneLabel: taken.label };
    }
};

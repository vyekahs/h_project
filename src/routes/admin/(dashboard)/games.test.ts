
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { actions } from './+page.server';
import { db } from '$lib/server/db/index';
import { takeUndo } from '$lib/server/adminUndo';

/**
 * db.transaction(cb) 는 tx를 받아 콜백을 실행한다.
 * 예전 테스트는 db.execute만 목으로 두고 transaction은 비워둬서,
 * createGame이 undefined를 받아 항상 500으로 떨어지고 있었다.
 */
vi.mock('$lib/server/db/index', () => {
    const execute = vi.fn();
    return {
        db: {
            execute,
            transaction: vi.fn(async (cb: any) => cb({ execute }))
        }
    };
});
vi.mock('$lib/server/auth', () => ({
    verifyAdminSession: vi.fn(async () => true),
    verifyAttendeeSession: vi.fn(async () => null)
}));
vi.mock('$lib/server/liveEvents', () => ({ emitLiveEvent: vi.fn() }));
// 종료·노쇼는 되돌릴 수 있어야 하므로 원상태를 서버에 남긴다.
// 그 기록 자체는 여기서 검증 대상이 아니라 손잡이만 확인한다.
vi.mock('$lib/server/adminUndo', () => ({
    recordUndo: vi.fn(async (_kind: string, _payload: unknown, label: string) => ({ id: 1, label })),
    takeUndo: vi.fn()
}));
vi.mock('$lib/server/reservations', () => ({
    applyPenalty: vi.fn(async () => 0),
    promoteWaitlist: vi.fn(async () => null)
}));
vi.mock('$lib/server/ble', () => ({ updateSettingsCache: vi.fn(), markAllLeft: vi.fn() }));

/** 관리자 쿠키를 가진 요청. canModifyGame이 headers.get('cookie')를 읽는다. */
function makeRequest(fields: Record<string, string | string[]>) {
    const single = Object.entries(fields).filter(([, v]) => !Array.isArray(v)) as [string, string][];
    return {
        headers: { get: (h: string) => (h === 'cookie' ? 'admin_session=tok' : null) },
        formData: async () => ({
            get: (key: string) => (Array.isArray(fields[key]) ? null : (fields[key] ?? null)),
            getAll: (key: string) => (Array.isArray(fields[key]) ? (fields[key] as string[]) : []),
            entries: function* () {
                for (const pair of single) yield pair;
            }
        })
    } as any;
}

describe('Game Management', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('createGame', () => {
        // 어느 칸이 비었는지까지 돌려줘야 화면이 그 칸 옆에서 말할 수 있다.
        // 「필수 입력 항목을 모두 채워주세요」만 아는 모달은 운영자를 폼으로
        // 돌려보내 처음부터 훑게 했다.
        it('빈 칸의 이름을 돌려준다', async () => {
            const result = await actions.createGame({ request: makeRequest({}) } as any);
            expect(result).toEqual({ status: 400, data: { missing: ['gameName', 'duration', 'players'] } });
        });

        it('채워진 칸은 빠지고 빈 칸만 남는다', async () => {
            const result = await actions.createGame({
                request: makeRequest({ gameName: 'Test Game', duration: '60' })
            } as any);
            expect(result).toEqual({ status: 400, data: { missing: ['players'] } });
        });

        it('should fail if players are already playing', async () => {
            (db.execute as any).mockResolvedValueOnce([{ name: 'Player 1' }]); // playingCheck

            const result = await actions.createGame({
                request: makeRequest({ gameName: 'Test Game', duration: '60', players: ['1', '2'] })
            } as any);

            expect(result).toEqual({
                status: 400,
                data: { error: '다음 인원은 이미 게임 중입니다: Player 1' }
            });
        });

        it('should succeed if all checks pass', async () => {
            (db.execute as any)
                .mockResolvedValueOnce([])              // playingCheck — 비어 있음
                .mockResolvedValueOnce([{ id: 100 }])   // INSERT game_sessions RETURNING id
                .mockResolvedValueOnce([])              // INSERT participant 1
                .mockResolvedValueOnce([]);             // INSERT participant 2

            const result = await actions.createGame({
                request: makeRequest({ gameName: 'Test Game', duration: '60', players: ['1', '2'] })
            } as any);

            expect(result).toBeUndefined();
            expect(db.execute).toHaveBeenCalledTimes(4);
        });
    });

    describe('endGame', () => {
        it('should fail if id is missing', async () => {
            const result = await actions.endGame({ request: makeRequest({}) } as any);
            expect(result).toEqual({ status: 400, data: { missing: true } });
        });

        it('이미 종료된 게임이면 404로 알린다', async () => {
            // status='playing'인 행이 없으면 닫을 것이 없다.
            (db.execute as any).mockResolvedValueOnce([]);

            const result = await actions.endGame({ request: makeRequest({ id: '100' }) } as any);

            expect(result).toEqual({
                status: 404,
                data: { error: '이미 종료되었거나 없는 게임입니다.' }
            });
        });

        it('승자를 고르면 hadWinners가 true다', async () => {
            (db.execute as any)
                .mockResolvedValueOnce([{ game_name: '스플렌더' }]) // 이름 조회
                .mockResolvedValue([]);                             // UPDATE들

            const result = await actions.endGame({
                request: makeRequest({ id: '100', winnerIds: ['1'], score_1: '10' })
            } as any);

            expect(result).toEqual({
                success: true,
                endedName: '스플렌더',
                hadWinners: true,
                undo: { id: 1, label: '스플렌더 종료' }
            });
        });

        it('승자를 고르지 않아도 게임은 닫히고 hadWinners는 false다', async () => {
            // 승자 기록은 선택이다. 화면이 "승자가 기록되었습니다"라고
            // 거짓으로 알리지 않도록 서버가 실제 기록 여부를 돌려준다.
            (db.execute as any)
                .mockResolvedValueOnce([{ game_name: '아그리콜라' }])
                .mockResolvedValue([]);

            const result = await actions.endGame({ request: makeRequest({ id: '100' }) } as any);

            expect(result).toEqual({
                success: true,
                endedName: '아그리콜라',
                hadWinners: false,
                undo: { id: 1, label: '아그리콜라 종료' }
            });
        });
    });

    describe('undoAdminAction', () => {
        it('되돌릴 수 없는 기록이면 왜인지 구분해 알린다', async () => {
            (takeUndo as any).mockResolvedValueOnce({ ok: false, reason: 'already_undone' });
            const already = await actions.undoAdminAction({ request: makeRequest({ undoId: '7' }) } as any);
            expect(already).toEqual({ status: 410, data: { error: '이미 되돌린 조치입니다.' } });

            (takeUndo as any).mockResolvedValueOnce({ ok: false, reason: 'expired' });
            const expired = await actions.undoAdminAction({ request: makeRequest({ undoId: '7' }) } as any);
            expect(expired).toEqual({ status: 410, data: { error: '되돌릴 수 있는 시간이 지났습니다.' } });
        });

        it('무엇을 되돌릴지는 클라이언트가 아니라 서버 기록에서 읽는다', async () => {
            // 클라이언트는 불투명한 id만 보낸다. payload를 실어 보내도 무시돼야
            // 되돌리기가 임의 변경 수단이 되지 않는다.
            (takeUndo as any).mockResolvedValueOnce({
                ok: true,
                kind: 'end_game',
                label: '스플렌더 종료',
                payload: { sessionId: 42, prevEndTime: '2026-09-03T00:00:00Z' }
            });
            (db.execute as any).mockResolvedValue([]);

            const result = await actions.undoAdminAction({
                request: makeRequest({ undoId: '7', sessionId: '999', payload: '{"sessionId":999}' })
            } as any);

            expect(result).toEqual({ success: true, undoneLabel: '스플렌더 종료' });
            expect(takeUndo).toHaveBeenCalledWith(7);
            // 서버 기록의 42가 쓰이고 클라이언트가 보낸 999는 어디에도 닿지 않는다
            const touched = (db.execute as any).mock.calls
                .map(([q]: any[]) => JSON.stringify(q?.queryChunks ?? []))
                .join(' ');
            expect(touched).not.toContain('999');
        });
    });
});

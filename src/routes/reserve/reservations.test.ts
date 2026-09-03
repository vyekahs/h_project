
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { actions } from '../+page.server';
import { db } from '$lib/server/db/index';

// $env/* 는 SvelteKit 서버 런타임이 채우는 가상 모듈이라 vitest 안에서는 비어 있다.
// 스텁이 없으면 import 체인이 이 모듈을 지나는 순간 파일 전체가 로드에 실패한다.
// vite의 resolve.alias는 SvelteKit 플러그인이 먼저 virtual: id로 바꿔버려 걸리지 않고,
// setupFiles의 vi.mock은 다른 파일의 모듈 그래프에 닿지 않는다. 파일마다 선언해야 한다.
vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$env/dynamic/private', () => ({ env: {} }));

vi.mock('$lib/server/db/index', () => {
    const execute = vi.fn();
    return {
        db: { execute, transaction: vi.fn(async (cb: any) => cb({ execute })) }
    };
});

// 세션 검증은 자체 질의를 하므로 db.execute 목으로 흉내 낼 수 없다. 모듈째로 대체한다.
vi.mock('$lib/server/auth', () => ({
    verifyAdminSession: vi.fn(async () => false),
    verifyAttendeeSession: vi.fn(async () => ({ id: 1, name: 'TestUser' }))
}));
vi.mock('$lib/server/services/partyService', () => ({
    PartyService: { isPartyMember: vi.fn(async () => true) }
}));
vi.mock('$lib/server/services/notificationService', () => ({
    NotificationService: { notify: vi.fn(async () => undefined) }
}));
vi.mock('$lib/server/services/wantToPlayService', () => ({
    WantToPlayService: {}
}));
vi.mock('$lib/server/liveEvents', () => ({ emitLiveEvent: vi.fn() }));
vi.mock('$lib/server/dataCache', () => ({ getSharedData: vi.fn(async () => ({})) }));

vi.mock('@sveltejs/kit', () => ({
    fail: vi.fn((status, data) => ({ status, data }))
}));

/** 로그인한 회원의 쿠키 */
const loggedIn = { get: (key: string) => (key === 'user_session' ? 'valid_token' : undefined) };
/** 로그인하지 않은 쿠키 */
const anonymous = { get: () => undefined };

function req(fields: Record<string, string>) {
    return { formData: async () => ({ get: (key: string) => fields[key] ?? null }) } as any;
}

describe('Reservations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('reserveGame', () => {
        it('should fail if not logged in', async () => {
            const result = await actions.reserveGame({
                request: req({ sessionId: '1' }),
                cookies: anonymous
            } as any);
            expect(result).toEqual({ status: 401, data: { error: '로그인이 필요합니다.' } });
        });

        it('should fail if sessionId missing', async () => {
            const result = await actions.reserveGame({ request: req({}), cookies: loggedIn } as any);
            expect(result).toEqual({ status: 400, data: { error: '게임 세션을 선택해주세요.' } });
        });

        it('should fail if blacklisted', async () => {
            (db.execute as any)
                .mockResolvedValueOnce([{ is_blacklisted: true, penalty_points: 0 }]) // attendeeInfo
                .mockResolvedValueOnce([{ status: 'scheduled', party_id: null }])      // gameInfo
                .mockResolvedValueOnce([]);                                            // sameGameCheck

            const result = await actions.reserveGame({
                request: req({ sessionId: '1' }),
                cookies: loggedIn
            } as any);
            expect(result).toEqual({
                status: 403,
                data: { error: '블랙리스트에 등록되어 예약이 불가능합니다.' }
            });
        });

        it('페널티가 임계에 닿으면 예약을 막는다', async () => {
            (db.execute as any)
                .mockResolvedValueOnce([{ is_blacklisted: false, penalty_points: 3 }])
                .mockResolvedValueOnce([{ status: 'scheduled', party_id: null }])
                .mockResolvedValueOnce([]);

            const result = await actions.reserveGame({
                request: req({ sessionId: '1' }),
                cookies: loggedIn
            } as any);
            expect(result).toEqual({
                status: 403,
                data: { error: '페널티 누적으로 인해 예약이 불가능합니다.' }
            });
        });

        it('이미 참여 중이거나 요청을 보냈으면 막는다', async () => {
            (db.execute as any)
                .mockResolvedValueOnce([{ is_blacklisted: false, penalty_points: 0 }])
                .mockResolvedValueOnce([{ status: 'scheduled', party_id: null }])
                .mockResolvedValueOnce([{ '?column?': 1 }]); // sameGameCheck 에 행이 있음

            const result = await actions.reserveGame({
                request: req({ sessionId: '1' }),
                cookies: loggedIn
            } as any);
            expect(result).toEqual({
                status: 400,
                data: { error: '이미 참여 중이거나 요청을 보냈습니다.' }
            });
        });

        it('should succeed and auto-confirm', async () => {
            (db.execute as any)
                .mockResolvedValueOnce([{ is_blacklisted: false, penalty_points: 0 }])
                .mockResolvedValueOnce([{ status: 'scheduled', party_id: null }])
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([]); // INSERT INTO reservations

            const result = await actions.reserveGame({
                request: req({ sessionId: '1' }),
                cookies: loggedIn
            } as any);
            expect(result).toEqual({ success: true });
            expect(db.execute).toHaveBeenCalledTimes(4);
        });
    });

    describe('joinScheduledGame', () => {
        it('빈 자리가 있으면 참여시킨다', async () => {
            // 「같은 날 다른 게임」 제약은 9b99842 에서 의도적으로 제거됐다.
            // 남아 있는 중복 규칙은 "이 세션에 이미 참여 중인가" 하나뿐이다.
            (db.execute as any)
                .mockResolvedValueOnce([{ is_blacklisted: false, penalty_points: 0 }])        // attendeeInfo
                .mockResolvedValueOnce([{ scheduled_at: '2023-10-02 10:00:00', party_id: null, game_name: '스플렌더' }])
                .mockResolvedValueOnce([])                                                     // 이 세션 참여 여부
                .mockResolvedValueOnce([{ max_players: 4, current_players: 1 }])               // 정원
                .mockResolvedValue([]);                                                        // 트랜잭션 · 후속 조회

            const result = await actions.joinScheduledGame({
                request: req({ sessionId: '2' }),
                cookies: loggedIn
            } as any);
            expect(result).toEqual({ success: true });
        });

        it('이미 그 세션에 참여 중이면 막는다', async () => {
            (db.execute as any)
                .mockResolvedValueOnce([{ is_blacklisted: false, penalty_points: 0 }])
                .mockResolvedValueOnce([{ scheduled_at: '2023-10-02 10:00:00', party_id: null, game_name: '스플렌더' }])
                .mockResolvedValueOnce([{ '?column?': 1 }]); // 이미 참여 중

            const result = await actions.joinScheduledGame({
                request: req({ sessionId: '2' }),
                cookies: loggedIn
            } as any);
            expect(result).toEqual({ status: 400, data: { error: '이미 참여 중인 게임입니다.' } });
        });

        it('정원이 찼으면 대기자로 넣는다', async () => {
            (db.execute as any)
                .mockResolvedValueOnce([{ is_blacklisted: false, penalty_points: 0 }])
                .mockResolvedValueOnce([{ scheduled_at: '2023-10-02 10:00:00', party_id: null, game_name: '스플렌더' }])
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{ max_players: 4, current_players: 4 }]) // 꽉 참
                .mockResolvedValue([]);

            const result = await actions.joinScheduledGame({
                request: req({ sessionId: '2' }),
                cookies: loggedIn
            } as any);
            expect(result).toEqual({ success: true, waitlisted: true });
        });
    });
});

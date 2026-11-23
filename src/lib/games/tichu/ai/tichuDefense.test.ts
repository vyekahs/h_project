/**
 * 티츄 저지 — 상대가 티츄를 부른 판에서는 부른 사람의 카드를 받는 쪽으로 기운다.
 *
 * 기록에서 사람 팀과 상대 AI 팀의 점수 차이(라운드당 +63)의 절반이 사람의 티츄 보너스였다.
 * 시뮬레이션에서 이 보정을 켜면 부른 자리의 성공률이 39.7% → 33.7%로 내려간다.
 */
import { describe, it, expect } from 'vitest';
import { defenseBias, liveOpposingCaller, __defense } from './tichuDefense';
import { createAllCards } from '../constants';
import { detectCombination } from '../combinations';
import type { Card, Combination, SeatIndex, TichuPlayer } from '../types';
import type { AiDecisionContext } from './types';

const DECK = createAllCards();
const card = (id: string): Card => DECK.find(x => x.id === id)!;
const combo = (ids: string) => detectCombination(ids.split(' ').map(card))!;

/** 1번 자리가 판단하는 장면. caller: 티츄를 부른 자리, top: 바닥에 카드를 낸 자리 */
function scene(opts: { caller?: number; top?: number; finished?: number; myTeamCalled?: boolean }): AiDecisionContext {
	const players: TichuPlayer[] = [0, 1, 2, 3].map(seat => ({
		userId: seat, name: `p${seat}`, seat: seat as SeatIndex, team: seat % 2 === 0 ? 'A' : 'B',
		hand: DECK.slice(seat * 9, seat * 9 + 9), wonCards: [],
		grandTichu: null, smallTichu: seat === opts.caller || (!!opts.myTeamCalled && seat === 3),
		hasPlayedFirstCard: true, finishOrder: seat === opts.finished ? 1 : null, connected: true
	}));
	return {
		hand: players[1].hand,
		trick: opts.top === undefined ? null
			: { plays: [{ seat: opts.top as SeatIndex, combination: combo('jade_9') }], passCount: 0, leadSeat: opts.top as SeatIndex, currentSeat: 1 as SeatIndex },
		wish: { active: false, requestedRank: null, requestedBy: null },
		currentSeat: 1 as SeatIndex, players, finishOrder: [], finishedCount: 0,
		cumulativeScoreA: 0, cumulativeScoreB: 0, completedRounds: [], roundNumber: 1
	};
}
const CANDS: (Combination | null)[] = [combo('jade_11'), combo('jade_14'), combo('jade_5 sword_5 pagoda_5 star_5'), null];

describe('티츄 저지', () => {
	it('티츄를 부른 상대의 카드를 받는 수에 점수를 더한다 (패스·폭탄은 그대로)', () => {
		const bias = defenseBias(scene({ caller: 0, top: 0 }), CANDS)!;
		expect(bias[0]).toBe(__defense.beatCaller);
		expect(bias[1]).toBe(__defense.beatCaller);
		expect(bias[2]).toBe(0);
		expect(bias[3]).toBe(0);
	});

	it('바닥의 카드가 부른 사람의 것이 아니면 더하지 않는다', () => {
		// 0번이 불렀지만 바닥은 그 파트너(2번)의 카드
		expect(defenseBias(scene({ caller: 0, top: 2 }), CANDS)!.every(b => b === 0)).toBe(true);
	});

	it('아무도 안 불렀으면 손대지 않는다', () => {
		expect(defenseBias(scene({ top: 0 }), CANDS)).toBeNull();
	});

	it('누가 이미 나갔으면 티츄는 판가름 났으니 손대지 않는다', () => {
		expect(liveOpposingCaller(scene({ caller: 0, top: 0, finished: 2 }))).toBeNull();
	});

	it('우리 팀도 불렀으면 우리 계획이 먼저다', () => {
		expect(liveOpposingCaller(scene({ caller: 0, top: 0, myTeamCalled: true }))).toBeNull();
	});

	it('우리 팀이 부른 티츄는 막을 대상이 아니다', () => {
		expect(liveOpposingCaller(scene({ caller: 3, top: 0 }))).toBeNull();
	});
});

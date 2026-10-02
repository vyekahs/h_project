/**
 * AI가 안 보이는 카드를 훔쳐보지 않는지 검증한다.
 *
 * AiDecisionContext에는 모든 플레이어의 손패가 들어 있다(엔진이 하나의 상태
 * 객체를 그대로 넘기기 때문). AI 판단 함수가 실수로 그걸 읽으면 사람은 절대
 * 이길 수 없는 상대가 된다.
 *
 * 검증 방법: 상대·파트너의 손패만 뒤바꾼 두 상황을 만들어 결정이 같은지 본다.
 * 다르면 어딘가에서 남의 패를 보고 있다는 뜻이다.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { decideGrandTichu, decideSmallTichu, decidePlay, __deterministic } from './strategy';
import { estimateGrandTichuQuality } from './monteCarlo';
import { getWeightsForStrategy } from './presets';
import { createShuffledDeck } from '../deck';
import type { Card, SeatIndex, TichuPlayer } from '../types';
import type { AiDecisionContext } from './types';

const W = getWeightsForStrategy('balanced');

function player(seat: SeatIndex, hand: Card[]): TichuPlayer {
	return {
		userId: seat, name: `p${seat}`, seat,
		team: seat % 2 === 0 ? 'A' : 'B',
		hand, wonCards: [], grandTichu: null, smallTichu: false,
		hasPlayedFirstCard: false, finishOrder: null, connected: true
	};
}

function ctx(hands: Card[][]): AiDecisionContext {
	return {
		hand: hands[0],
		trick: null,
		wish: { active: false, requestedRank: null, requestedBy: null },
		currentSeat: 0 as SeatIndex,
		players: hands.map((h, i) => player(i as SeatIndex, h)),
		finishOrder: [], finishedCount: 0,
		cumulativeScoreA: 0, cumulativeScoreB: 0,
		completedRounds: [], roundNumber: 1
	};
}

/** 내 손패는 그대로 두고 남의 손패만 다르게 나눈 두 상황 */
function twoWorlds(myCount: number, othersCount: number) {
	const deck = createShuffledDeck();
	const mine = deck.slice(0, myCount);
	const rest = deck.slice(myCount);
	const a = ctx([mine, rest.slice(0, othersCount), rest.slice(othersCount, othersCount * 2), rest.slice(othersCount * 2, othersCount * 3)]);
	const shuffled = [...rest].reverse();
	const b = ctx([mine, shuffled.slice(0, othersCount), shuffled.slice(othersCount, othersCount * 2), shuffled.slice(othersCount * 2, othersCount * 3)]);
	return { a, b, mine };
}

describe('남의 패를 보지 않는다', () => {
	// 사람처럼 보이려고 넣은 흔들림(pickAmongNearBest)은 같은 입력에도 다른 수를
	// 내므로, 정보 누출 검사에서는 꺼야 한다.
	beforeAll(() => { __deterministic.on = true; });
	afterAll(() => { __deterministic.on = false; });

	it('그랜드 티츄 판단은 내 8장에만 의존한다', () => {
		for (let i = 0; i < 40; i++) {
			const { a, b, mine } = twoWorlds(8, 8);
			expect(mine.length, '그랜드 시점 손패는 8장이어야 한다').toBe(8);
			const ra = decideGrandTichu(mine, W, {}, a);
			const rb = decideGrandTichu(mine, W, {}, b);
			expect(rb, '상대 손패를 바꾸니 그랜드 판단이 달라짐 — 남의 패를 봄').toBe(ra);
		}
	});

	it('그랜드 품질 추정은 내 8장에만 의존한다', () => {
		for (let i = 0; i < 15; i++) {
			const { a, b, mine } = twoWorlds(8, 8);
			// 표본 추출에 Math.random을 쓰므로 값이 정확히 같지는 않다.
			// 상대 패를 본다면 계통적으로 어긋나므로, 여러 번의 평균을 비교한다.
			let sa = 0, sb = 0;
			for (let k = 0; k < 8; k++) {
				sa += estimateGrandTichuQuality(a, 12);
				sb += estimateGrandTichuQuality(b, 12);
			}
			expect(Math.abs(sa - sb) / 8, `추정값이 상대 손패에 따라 달라짐 (${(sa / 8).toFixed(3)} vs ${(sb / 8).toFixed(3)})`)
				.toBeLessThan(0.06);
			void mine;
		}
	});

	it('스몰 티츄 판단은 내 14장에만 의존한다', () => {
		for (let i = 0; i < 30; i++) {
			const { a, b, mine } = twoWorlds(14, 14);
			const ra = decideSmallTichu(mine, W, a);
			const rb = decideSmallTichu(mine, W, b);
			expect(rb, '상대 손패를 바꾸니 스몰 판단이 달라짐 — 남의 패를 봄').toBe(ra);
		}
	});

	it('플레이 결정은 내 손패와 공개 정보에만 의존한다', () => {
		for (let i = 0; i < 30; i++) {
			const { a, b, mine } = twoWorlds(14, 14);
			const ra = decidePlay(a, W);
			const rb = decidePlay(b, W);
			expect(JSON.stringify(rb), '상대 손패를 바꾸니 플레이가 달라짐 — 남의 패를 봄')
				.toBe(JSON.stringify(ra));
		}
	});
});

/**
 * 티츄 차단 시나리오 테스트.
 *
 * 통계로는 3%p 수준의 차이라 개별 판단이 옳은지 보이지 않는다.
 * 상황을 손으로 짜서 "이 자리에서 이 카드를 내야 한다"를 직접 확인한다.
 *
 * 핵심 원리(실측으로 확인한 것):
 *  - 티츄는 마지막 장을 내는 순간 나가므로 그 수를 이겨서는 막을 수 없다.
 *  - 막는 유일한 길은 낼 기회를 없애는 것 → 선언자를 패스시켜야 한다.
 *    (성공한 티츄는 평균 4.2회 패스, 실패한 티츄는 10.0회 패스)
 *  - 통제 가능한 지점은 "선언자 직전 순서"다. 내가 내는 것이 그들이 받을 수
 *    있는 것을 결정한다.
 */
import { describe, it, expect } from 'vitest';
import { decidePlay } from './strategy';
import { getWeightsForStrategy } from './presets';
import { createAllCards } from '../constants';
import { detectCombination } from '../combinations';
import type { Card, NormalCard, SeatIndex, TichuPlayer, Trick } from '../types';
import type { AiDecisionContext } from './types';

const DECK = createAllCards();
const used = new Set<string>();

/** 랭크로 아직 안 쓴 카드 한 장 집기 */
function c(rank: number): Card {
	const found = DECK.find(x => x.type === 'normal' && (x as NormalCard).rank === rank && !used.has(x.id));
	if (!found) throw new Error(`rank ${rank} 카드가 부족`);
	used.add(found.id);
	return found;
}

function player(seat: SeatIndex, hand: Card[], opts: Partial<TichuPlayer> = {}): TichuPlayer {
	return {
		userId: seat, name: `p${seat}`, seat,
		team: seat % 2 === 0 ? 'A' : 'B',
		hand, wonCards: [],
		grandTichu: null, smallTichu: false,
		hasPlayedFirstCard: true, finishOrder: null, connected: true,
		...opts
	};
}

/** 좌석 0이 판단하는 상황을 만든다 */
function ctx(hands: Card[][], trickPlays: { seat: SeatIndex; cards: Card[] }[], declarer: SeatIndex | null): AiDecisionContext {
	const players = hands.map((h, i) => player(i as SeatIndex, h,
		declarer === i ? { smallTichu: true } : {}));
	const trick: Trick | null = trickPlays.length === 0 ? null : {
		plays: trickPlays.map(p => ({ seat: p.seat, combination: detectCombination(p.cards)! })),
		passCount: 0,
		leadSeat: trickPlays[0].seat,
		currentSeat: 0 as SeatIndex
	};
	return {
		hand: hands[0], trick,
		wish: { active: false, requestedRank: null, requestedBy: null },
		currentSeat: 0 as SeatIndex, players,
		finishOrder: [], finishedCount: 0,
		cumulativeScoreA: 0, cumulativeScoreB: 0,
		completedRounds: [], roundNumber: 1
	};
}

/** 결정을 사람이 읽을 수 있는 형태로 */
function describePlay(r: string[] | 'pass', hand: Card[]): string {
	if (r === 'pass') return 'pass';
	return r.map(id => {
		const card = hand.find(x => x.id === id)!;
		return card.type === 'special' ? card.special! : String((card as NormalCard).rank);
	}).join('+');
}

const W = getWeightsForStrategy('balanced');

describe('티츄 차단 시나리오', () => {
	it('선언자가 다음 차례면, 낮은 패로 받아서 처분을 도와주지 않는다', () => {
		used.clear();
		// 3번이 4를 리드했다. 다음 차례는 1번(티츄 선언자).
		// 1번은 5·6·7 같은 낮은 패를 털고 싶다.
		// 내가 6으로 받으면 1번이 7을 얹어 헐값에 처분한다.
		// J로 올리면 1번은 낼 수 없다.
		const lead = [c(4)];
		const myHand = [c(6), c(11), c(14), c(9)];
		const declarerHand = [c(5), c(7), c(8)];
		const context = ctx(
			[myHand, declarerHand, [c(2), c(3)], [c(12), c(13)]],
			[{ seat: 3 as SeatIndex, cards: lead }],
			1 as SeatIndex
		);
		const r = decidePlay(context, W);
		const played = describePlay(r, myHand);
		// 6으로 받으면 선언자가 7·8을 얹을 수 있다
		expect(played, `선언자에게 낮은 패 처분 기회를 줌 (낸 카드: ${played})`).not.toBe('6');
		expect(r, '아무것도 안 냄').not.toBe('pass');
	});

	it('선언자가 다음 차례가 아니면 강패를 아낀다', () => {
		used.clear();
		// 같은 상황인데 다음 차례가 티츄를 부르지 않은 3번이다.
		// 굳이 J를 태울 이유가 없다.
		const lead = [c(4)];
		const myHand = [c(6), c(11), c(14), c(9)];
		const context = ctx(
			[myHand, [c(5), c(7), c(8)], [c(2), c(3)], [c(12), c(13)]],
			[{ seat: 2 as SeatIndex, cards: lead }],
			null
		);
		const r = decidePlay(context, W);
		const played = describePlay(r, myHand);
		expect(['6', '9', 'pass'], `선언자도 없는데 강패를 태움 (낸 카드: ${played})`).toContain(played);
	});

	it('다음 차례가 파트너면 봉쇄를 걸지 않는다', () => {
		used.clear();
		// 1번이 이미 나갔다 → 내 다음 차례는 파트너(2번)다.
		// 티츄 선언자는 3번이지만 내 다음이 아니므로, 여기서 강패를 태울 이유가 없다.
		// (봉쇄가 통하는 이유는 "선언자 직전 순서"라는 위치 때문이고,
		//  그 위치가 아니면 카드만 낭비된다 — 범위를 넓히면 오히려 나빠졌다)
		const lead = [c(4)];
		const myHand = [c(6), c(11), c(14), c(9)];
		const context = ctx(
			[myHand, [], [c(5), c(7)], [c(8), c(10)]],
			[{ seat: 2 as SeatIndex, cards: lead }],
			3 as SeatIndex
		);
		context.players[1].finishOrder = 1;
		const r = decidePlay(context, W);
		const played = describePlay(r, myHand);
		expect(['6', '9', 'pass'], `다음이 파트너인데 강패를 태움 (낸 카드: ${played})`).toContain(played);
	});
});

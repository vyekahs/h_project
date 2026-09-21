/**
 * 두 장 남았을 때의 리드 순서.
 *
 * 실제 플레이에서 나온 실수: AI가 Q·A 두 장을 들고 선을 잡았는데, 봉황이 아직
 * 안 나온 상태에서 A를 먼저 냈다. 봉황(14.5)에 A가 잡히고 Q를 든 채 갇혔다.
 *
 * Q를 먼저 내면 누가 뭘 얹든(K든, 봉황 12.5든) 내 차례에 A로 덮는 순간 손이 비어
 * 나간다. 아무도 안 받으면 선을 유지한 채 A를 내고 나간다. 막히는 건 용뿐이다.
 * A를 먼저 내면 봉황과 용 둘 다에 막힌다 — Q 먼저가 항상 같거나 낫다.
 */
import { describe, it, expect } from 'vitest';
import { decidePlay } from './strategy';
import { getWeightsForStrategy } from './presets';
import { createAllCards } from '../constants';
import type { Card, NormalCard, SeatIndex, TichuPlayer } from '../types';
import type { AiDecisionContext } from './types';
import type { AiStrategy } from './types';

const DECK = createAllCards();
const normal = (rank: number) => DECK.filter(x => x.type === 'normal' && (x as NormalCard).rank === rank);
const special = (name: string) => DECK.find(x => x.type === 'special' && x.special === name)!;

function player(seat: SeatIndex, hand: Card[], wonCards: Card[] = []): TichuPlayer {
	return {
		userId: seat, name: `p${seat}`, seat, team: seat % 2 === 0 ? 'A' : 'B',
		hand, wonCards, grandTichu: null, smallTichu: false,
		hasPlayedFirstCard: true, finishOrder: null, connected: true
	};
}

/** 좌석 0이 선을 잡은 상황. played = 이미 나온 카드 */
function leadCtx(myHand: Card[], others: Card[][], played: Card[]): AiDecisionContext {
	const players = [
		player(0 as SeatIndex, myHand, played),
		player(1 as SeatIndex, others[0]),
		player(2 as SeatIndex, others[1]),
		player(3 as SeatIndex, others[2])
	];
	return {
		hand: myHand, trick: null,
		wish: { active: false, requestedRank: null, requestedBy: null },
		currentSeat: 0 as SeatIndex, players,
		finishOrder: [], finishedCount: 0,
		cumulativeScoreA: 0, cumulativeScoreB: 0,
		completedRounds: [], roundNumber: 1
	};
}

const rankOf = (ids: string[] | 'pass') =>
	ids === 'pass' ? 'pass' : ids.map(id => {
		const card = DECK.find(x => x.id === id)!;
		return card.type === 'special' ? card.special : String((card as NormalCard).rank);
	}).join('+');

describe('두 장 남았을 때 리드 순서', () => {
	const strategies: AiStrategy[] = ['aggressive', 'balanced', 'defensive', 'tricky', 'wild'];

	for (const strategy of strategies) {
		it(`Q·A, 봉황이 아직 안 나왔고 다른 A·용은 다 나옴 → Q를 먼저 낸다 (${strategy})`, () => {
			const [a1, a2, a3, a4] = normal(14);
			const q = normal(12)[0];
			const phoenix = special('phoenix');
			// 남은 카드: 봉황 + 낮은 카드들. A 세 장과 용은 이미 나왔다.
			const lows = [...normal(3), ...normal(4), ...normal(6), ...normal(7)];
			const others = [
				[phoenix, lows[0], lows[1], lows[2], lows[3]],
				[lows[4], lows[5], lows[6], lows[7]],
				[lows[8], lows[9], lows[10], lows[11], lows[12]]
			];
			const inPlay = new Set([a1.id, q.id, ...others.flat().map(x => x.id)]);
			const played = DECK.filter(x => !inPlay.has(x.id));
			expect(played.some(x => x.id === a2.id && a3 && a4)).toBe(true);

			const W = getWeightsForStrategy(strategy);
			for (let i = 0; i < 10; i++) {
				const r = decidePlay(leadCtx([q, a1], others, played), W);
				expect(rankOf(r), 'A를 먼저 내면 봉황에 잡히고 Q를 든 채 갇힌다').toBe('12');
			}
		});
	}

	for (const strategy of strategies) {
		it(`Q·A, 봉황과 다른 A가 아직 안 보임 → 그래도 Q를 먼저 낸다 (${strategy})`, () => {
			// 실제로 재현된 조건. A를 먼저 내면 봉황에, Q를 먼저 내면 다른 A에 막힐 수 있어
			// 당장 나갈 확률은 비슷하지만, 막혔을 때 손에 남는 카드가 A냐 Q냐가 다르다.
			const [a1, a2] = normal(14);
			const q = normal(12)[0];
			const lows = [...normal(3), ...normal(4), ...normal(6), ...normal(7)];
			const others = [
				[special('phoenix'), lows[0], lows[1], lows[2], lows[3]],
				[lows[4], lows[5], lows[6], lows[7]],
				[a2, lows[8], lows[9], lows[10], lows[11]]
			];
			const inPlay = new Set([a1.id, q.id, ...others.flat().map(x => x.id)]);
			const played = DECK.filter(x => !inPlay.has(x.id));
			const W = getWeightsForStrategy(strategy);
			let qFirst = 0;
			for (let i = 0; i < 20; i++) {
				if (rankOf(decidePlay(leadCtx([q, a1], others, played), W)) === '12') qFirst++;
			}
			// 표본 세계를 무작위로 뽑으므로 100%를 요구하지 않는다
			expect(qFirst, `20번 중 Q 먼저 ${qFirst}번`).toBeGreaterThanOrEqual(18);
		});
	}

	it('5 페어·K 페어, 더 높은 페어가 안 보임 → 같은 원리로 5 페어를 먼저 낸다', () => {
		const k = normal(13), five = normal(5), aces = normal(14);
		const lows = [...normal(3), ...normal(4), ...normal(6), ...normal(7)];
		const others = [
			[aces[0], aces[1], lows[0], lows[1], lows[2]],
			[lows[4], lows[5], lows[6], lows[7]],
			[lows[8], lows[9], lows[10], lows[11]]
		];
		const mine = [five[0], five[1], k[0], k[1]];
		const inPlay = new Set([...mine, ...others.flat()].map(x => x.id));
		const played = DECK.filter(x => !inPlay.has(x.id));
		let weakFirst = 0;
		for (let i = 0; i < 20; i++) {
			if (rankOf(decidePlay(leadCtx(mine, others, played), getWeightsForStrategy('balanced'))) === '5+5') weakFirst++;
		}
		expect(weakFirst, `20번 중 5 페어 먼저 ${weakFirst}번`).toBeGreaterThanOrEqual(18);
	});

	it('A를 막을 카드가 하나도 안 남았으면 A를 먼저 내서 상대가 카드를 털 기회를 주지 않는다', () => {
		// 봉황·용·다른 A는 다 나왔고 K만 남았다. A는 확실히 이기고 Q는 K에 잡힐 수 있다.
		// 어느 순서로도 나가지만, Q를 먼저 내면 상대가 K를 털 기회를 얻는다.
		const a1 = normal(14)[0];
		const q = normal(12)[0];
		const kings = normal(13);
		// 낮은 카드는 랭크당 세 장씩만 — 폭탄이 나올 수 있으면 A도 확실하지 않게 된다
		const lows = [2, 3, 4, 6, 7].flatMap(r => normal(r).slice(0, 3));
		const others = [[kings[0], ...lows.slice(0, 4)], [kings[1], ...lows.slice(4, 7)], [kings[2], ...lows.slice(7, 11)]];
		const inPlay = new Set([a1.id, q.id, ...others.flat().map(x => x.id)]);
		const played = DECK.filter(x => !inPlay.has(x.id));
		const r = decidePlay(leadCtx([q, a1], others, played), getWeightsForStrategy('balanced'));
		expect(rankOf(r)).toBe('14');
	});
});

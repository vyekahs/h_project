/**
 * 누가 이미 나간 뒤에는 스몰 티츄를 부르지 않는다.
 *
 * 실제 플레이에서 나온 장면: 파트너가 개를 내고 나간 뒤 선을 넘겨받은 AI가,
 * 아직 첫 카드를 안 냈다는 이유로 스몰 티츄를 불렀다. 티츄는 1등으로 나가야
 * 성공이므로 누가 먼저 나간 시점에 부르면 확정 실패(−100)다.
 */
import { describe, it, expect } from 'vitest';
import { decideSmallTichu } from './strategy';
import { getWeightsForStrategy, getBehaviorForStrategy } from './presets';
import { createAllCards } from '../constants';
import type { Card, SeatIndex, TichuPlayer } from '../types';
import type { AiDecisionContext, AiStrategy } from './types';

const DECK = createAllCards();
const byId = (id: string): Card => {
	const found = DECK.find(x => x.id === id);
	if (!found) throw new Error(`없는 카드 ${id}`);
	return found;
};

// 용·봉황·A 세 장·K 세 장·Q 두 장 + 2-3-4-5 — 평소라면 모든 성향이 부르는 손패
const STRONG = ['dragon', 'phoenix', 'jade_14', 'sword_14', 'star_14', 'jade_13', 'sword_13', 'star_13',
	'jade_12', 'sword_12', 'jade_2', 'jade_3', 'sword_4', 'star_5'];

function ctx(partnerFinished: boolean): AiDecisionContext {
	const mine = STRONG.map(byId);
	const rest = DECK.filter(c => !STRONG.includes(c.id));
	const hands = [mine, rest.slice(0, 14), partnerFinished ? [] : rest.slice(14, 28), rest.slice(28, 42)];
	const players: TichuPlayer[] = hands.map((hand, seat) => ({
		userId: seat, name: `p${seat}`, seat: seat as SeatIndex, team: seat % 2 === 0 ? 'A' : 'B',
		hand, wonCards: seat === 2 && partnerFinished ? rest.slice(14, 28) : [],
		grandTichu: null, smallTichu: false,
		hasPlayedFirstCard: seat !== 0, finishOrder: seat === 2 && partnerFinished ? 1 : null, connected: true
	}));
	return {
		hand: mine, trick: null,
		wish: { active: false, requestedRank: null, requestedBy: null },
		currentSeat: 0 as SeatIndex, players,
		finishOrder: partnerFinished ? [2 as SeatIndex] : [], finishedCount: partnerFinished ? 1 : 0,
		cumulativeScoreA: 0, cumulativeScoreB: 0, completedRounds: [], roundNumber: 1
	};
}

describe('누가 나간 뒤 스몰 티츄', () => {
	const strategies: AiStrategy[] = ['aggressive', 'balanced', 'defensive', 'tricky', 'wild'];

	it('전제: 아무도 안 나갔으면 이 손패로 부른다', () => {
		for (const s of strategies) {
			expect(decideSmallTichu(ctx(false).hand, getWeightsForStrategy(s), ctx(false), getBehaviorForStrategy(s)), s).toBe(true);
		}
	});

	for (const s of strategies) {
		it(`파트너가 이미 나갔으면 부르지 않는다 (${s})`, () => {
			const c = ctx(true);
			expect(decideSmallTichu(c.hand, getWeightsForStrategy(s), c, getBehaviorForStrategy(s))).toBe(false);
		});
	}
});

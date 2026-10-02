/**
 * 파트너 폭탄 위에 폭탄을 덮지 않는다.
 *
 * 실제 플레이 기록(2026-09, id 837)에서 그대로 가져온 장면이다. 사람이 스몰 티츄를
 * 부른 상태에서 A를 냈고, 상대 AI(자리 1)가 3333 폭탄으로 받았다. 파트너(자리 2)가
 * 패스한 뒤 자리 3의 AI가 6666을 덮었다 — 자리 1의 파트너다. 트릭은 이미 자기 팀
 * 것이었으니 폭탄 하나를 그냥 버린 셈이다.
 */
import { describe, it, expect } from 'vitest';
import { decidePlay } from './strategy';
import { getWeightsForStrategy } from './presets';
import { createAllCards } from '../constants';
import { detectCombination } from '../combinations';
import type { Card, SeatIndex, TichuPlayer } from '../types';
import type { AiDecisionContext, AiStrategy } from './types';

const DECK = createAllCards();
const byId = (id: string): Card => {
	const found = DECK.find(x => x.id === id);
	if (!found) throw new Error(`없는 카드 ${id}`);
	return found;
};

const RECORDED = {
	hands: [
		['jade_13', 'pagoda_4', 'star_8', 'jade_8', 'pagoda_8', 'star_4', 'sword_14', 'sword_2', 'jade_2', 'sword_4', 'pagoda_5'],
		['star_11', 'jade_9', 'sword_8', 'sword_11', 'pagoda_10', 'pagoda_11', 'dog', 'sword_12'],
		['jade_10', 'star_9', 'star_10', 'sword_9', 'star_13', 'jade_11', 'sword_10', 'jade_5'],
		['pagoda_6', 'sword_13', 'jade_6', 'star_12', 'sword_6', 'star_2', 'pagoda_2', 'star_6', 'pagoda_12', 'pagoda_9', 'star_5', 'jade_14']
	],
	trick: [[2, ['jade_4']], [3, ['sword_5']], [0, ['jade_12']], [1, ['pagoda_13']], [0, ['pagoda_14']],
		[1, ['pagoda_3', 'jade_3', 'star_3', 'sword_3']]] as [number, string[]][],
	played: ['mahjong', 'star_14', 'phoenix', 'dragon', 'sword_7', 'jade_7', 'pagoda_7', 'star_7']
};

function recordedCtx(hand3 = RECORDED.hands[3]): AiDecisionContext {
	const hands = [...RECORDED.hands.slice(0, 3), hand3];
	const players: TichuPlayer[] = hands.map((ids, seat) => ({
		userId: seat, name: `p${seat}`, seat: seat as SeatIndex, team: seat % 2 === 0 ? 'A' : 'B',
		hand: ids.map(byId), wonCards: seat === 2 ? RECORDED.played.map(byId) : [],
		grandTichu: null, smallTichu: seat === 0, hasPlayedFirstCard: true, finishOrder: null, connected: true
	}));
	return {
		hand: players[3].hand,
		trick: {
			plays: RECORDED.trick.map(([seat, ids]) => ({ seat: seat as SeatIndex, combination: detectCombination(ids.map(byId))! })),
			passCount: 1, leadSeat: 2 as SeatIndex, currentSeat: 3 as SeatIndex
		},
		wish: { active: false, requestedRank: null, requestedBy: null },
		currentSeat: 3 as SeatIndex, players,
		finishOrder: [], finishedCount: 0, cumulativeScoreA: 0, cumulativeScoreB: 0,
		completedRounds: [], roundNumber: 3
	};
}

describe('파트너 폭탄 위 폭탄', () => {
	const strategies: AiStrategy[] = ['aggressive', 'balanced', 'defensive', 'tricky', 'wild'];
	for (const strategy of strategies) {
		it(`기록된 장면: 파트너 3333 위에 6666을 덮지 않는다 (${strategy})`, () => {
			for (let i = 0; i < 5; i++) {
				expect(decidePlay(recordedCtx(), getWeightsForStrategy(strategy))).toBe('pass');
			}
		});
	}

	it('그 폭탄으로 손패가 비면 덮고 나간다', () => {
		const r = decidePlay(recordedCtx(['pagoda_6', 'jade_6', 'sword_6', 'star_6']), getWeightsForStrategy('defensive'));
		expect(r).toHaveLength(4);
	});
});

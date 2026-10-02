/**
 * 받을 때 남은 손패의 구조를 깨지 않는 카드를 고른다.
 *
 * 실제 플레이 기록(2026-09, id 265)에서 그대로 가져온 장면이다. 스몰 티츄를 부른
 * AI(자리 1)가 A 9 J Q K 6 6 봉을 들고 있었고, 사람이 Q를 냈다.
 *   - A로 받으면 남은 패는 9-봉-J-Q-K 스트레이트 + 66 → 두 턴
 *   - K로 받으면 A·9·J·Q·66·봉 → 다섯 턴
 * AI는 K로 받았고, 사람이 먼저 나가 티츄가 실패했다. 나가기 효율(exitRate)이 남은
 * 분할의 평균 승률 중심이라, 센 낱장이 많이 남는 쪽을 더 높게 쳤기 때문이다.
 */
import { describe, it, expect } from 'vitest';
import { decidePlay } from './strategy';
import { getWeightsForStrategy, getBehaviorForStrategy } from './presets';
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
		['pagoda_7', 'jade_5', 'pagoda_13', 'jade_13', 'jade_2', 'star_5', 'sword_7', 'star_7', 'pagoda_2', 'pagoda_5', 'sword_4', 'sword_14', 'star_2'],
		['jade_14', 'pagoda_9', 'sword_11', 'sword_6', 'pagoda_12', 'sword_13', 'star_6', 'phoenix'],
		['sword_9', 'sword_8', 'star_3', 'pagoda_3', 'pagoda_8', 'jade_3', 'dog'],
		['jade_6', 'star_14', 'jade_4', 'sword_10', 'pagoda_6', 'star_13', 'pagoda_10', 'pagoda_4', 'jade_12', 'pagoda_11', 'sword_3', 'dragon']
	],
	trick: [[1, 'sword_2'], [2, 'star_4'], [3, 'sword_5'], [0, 'sword_12']] as [number, string][],
	played: ['mahjong', 'pagoda_14', 'jade_7', 'jade_8', 'jade_9', 'jade_10', 'jade_11', 'star_8', 'star_9', 'star_10', 'star_11', 'star_12']
};

function recordedCtx(): AiDecisionContext {
	const players: TichuPlayer[] = RECORDED.hands.map((ids, seat) => ({
		userId: seat, name: `p${seat}`, seat: seat as SeatIndex, team: seat % 2 === 0 ? 'A' : 'B',
		hand: ids.map(byId), wonCards: seat === 0 ? RECORDED.played.map(byId) : [],
		grandTichu: null, smallTichu: seat === 1, hasPlayedFirstCard: true, finishOrder: null, connected: true
	}));
	return {
		hand: players[1].hand,
		trick: {
			plays: RECORDED.trick.map(([seat, id]) => ({ seat: seat as SeatIndex, combination: detectCombination([byId(id)])! })),
			passCount: 0, leadSeat: 1 as SeatIndex, currentSeat: 1 as SeatIndex
		},
		wish: { active: false, requestedRank: null, requestedBy: null },
		currentSeat: 1 as SeatIndex, players,
		finishOrder: [], finishedCount: 0, cumulativeScoreA: 0, cumulativeScoreB: 0,
		completedRounds: [], roundNumber: 14
	};
}

describe('받을 때 손패 구조 유지', () => {
	const strategies: AiStrategy[] = ['aggressive', 'balanced', 'defensive', 'tricky', 'wild'];
	for (const strategy of strategies) {
		it(`기록된 장면: Q를 K가 아니라 A로 받아 스트레이트를 남긴다 (${strategy})`, () => {
			for (let i = 0; i < 10; i++) {
				const r = decidePlay(recordedCtx(), getWeightsForStrategy(strategy), getBehaviorForStrategy(strategy));
				expect(r, 'K로 받으면 남은 패가 2턴 → 5턴이 된다').toEqual(['jade_14']);
			}
		});
	}
});

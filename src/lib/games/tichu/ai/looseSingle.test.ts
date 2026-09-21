/**
 * 패스 대신 짝 없는 낱장을 턴다.
 *
 * 실제 플레이 기록(2026-09-20, 9라운드)에서 그대로 가져온 장면이다.
 * 사람이 3을 리드해 4·5·8이 얹혔고 사람이 다시 9를 냈다. 바로 다음 자리의 AI(수비적)는
 *   개 3 3 6 9 9 10 J J Q Q K A
 * 를 쥐고 패스했다. 이 손패를 가장 빨리 비우는 분할은 9-10-J-Q-K-A 스트레이트 + 3 페어이고
 * 9·J·Q·6이 낱장으로 남는다. 그 낱장 J를 여기서 얹으면 공짜로 한 장을 턴다. 사람은 이런 패스 덕에 낮은 낱장을 헐값에 처분하고, 강도 11짜리
 * 손패로 1등을 했다.
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
		['jade_8', 'pagoda_8', 'jade_10', 'sword_5', 'jade_11', 'star_8', 'phoenix'],
		['pagoda_12', 'sword_11', 'star_3', 'sword_13', 'sword_10', 'dog', 'star_9', 'star_11', 'sword_3', 'pagoda_9', 'jade_12', 'star_6', 'star_14'],
		['jade_5', 'jade_13', 'sword_14', 'jade_14', 'jade_6', 'pagoda_7', 'star_13', 'pagoda_10', 'pagoda_6', 'sword_9', 'sword_12', 'sword_2', 'sword_6'],
		['pagoda_14', 'star_7', 'pagoda_4', 'sword_7', 'jade_4', 'star_10', 'pagoda_11', 'star_12', 'pagoda_13', 'jade_7', 'jade_2', 'dragon', 'star_2']
	],
	trick: [[0, 'pagoda_3'], [1, 'sword_4'], [2, 'pagoda_5'], [3, 'sword_8'], [0, 'jade_9']] as [number, string][],
	played: ['mahjong', 'pagoda_2', 'jade_3', 'star_4', 'star_5']
};

function recordedCtx(): AiDecisionContext {
	const players: TichuPlayer[] = RECORDED.hands.map((ids, seat) => ({
		userId: seat, name: `p${seat}`, seat: seat as SeatIndex, team: seat % 2 === 0 ? 'A' : 'B',
		hand: ids.map(byId), wonCards: seat === 0 ? RECORDED.played.map(byId) : [],
		grandTichu: null, smallTichu: false, hasPlayedFirstCard: true, finishOrder: null, connected: true
	}));
	return {
		hand: players[1].hand,
		trick: {
			plays: RECORDED.trick.map(([seat, id]) => ({ seat: seat as SeatIndex, combination: detectCombination([byId(id)])! })),
			passCount: 0, leadSeat: 0 as SeatIndex, currentSeat: 1 as SeatIndex
		},
		wish: { active: false, requestedRank: null, requestedBy: null },
		currentSeat: 1 as SeatIndex, players,
		finishOrder: [], finishedCount: 0, cumulativeScoreA: 0, cumulativeScoreB: 0,
		completedRounds: [], roundNumber: 9
	};
}

describe('패스 대신 낱장 털기', () => {
	const strategies: AiStrategy[] = ['aggressive', 'balanced', 'defensive', 'tricky', 'wild'];
	for (const strategy of strategies) {
		it(`기록된 장면: 상대 9 위에서 패스하지 않는다 (${strategy})`, () => {
			for (let i = 0; i < 10; i++) {
				const r = decidePlay(recordedCtx(), getWeightsForStrategy(strategy));
				expect(r, '낱장으로 받을 수 있는데 패스함').not.toBe('pass');
				expect(r).toHaveLength(1);
			}
		});
	}
});

/**
 * 낱장 두 장에서 높은 쪽이 확실히 이기면 높은 쪽부터 리드한다.
 *
 * 실제 플레이 기록(id 1533)에서 그대로 가져온 장면이다. 자리 1의 AI가 Q·J를 들고 선을
 * 잡았다. Q보다 높은 카드와 봉황·용은 이미 모두 나왔으므로 Q를 내면 선을 지키고, 마지막
 * J는 내는 순간 손이 비어 나간다. 그런데 J부터 냈다.
 */
import { describe, it, expect } from 'vitest';
import { decidePlay } from './strategy';
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

const RECORDED = {
	hands: [
		[],
		['pagoda_12', 'sword_11'],
		['star_4', 'sword_4', 'sword_3', 'jade_3', 'pagoda_4', 'pagoda_9'],
		['star_2', 'dog', 'pagoda_2', 'pagoda_3', 'jade_2']
	],
	played: ['mahjong', 'sword_2', 'star_14', 'sword_7', 'jade_7', 'pagoda_8', 'star_8', 'jade_8', 'sword_8', 'star_9', 'sword_9',
		'star_3', 'pagoda_6', 'jade_12', 'pagoda_13', 'jade_14', 'dragon', 'sword_5', 'jade_5', 'sword_6', 'star_6', 'phoenix',
		'pagoda_10', 'star_12', 'sword_12', 'jade_6', 'star_11', 'jade_13', 'jade_4', 'jade_11', 'pagoda_14', 'pagoda_5', 'star_5',
		'star_7', 'pagoda_7', 'star_10', 'sword_10', 'sword_13', 'star_13', 'jade_9', 'pagoda_11', 'sword_14', 'jade_10']
};

function recordedCtx(): AiDecisionContext {
	const players: TichuPlayer[] = RECORDED.hands.map((ids, seat) => ({
		userId: seat, name: `p${seat}`, seat: seat as SeatIndex, team: seat % 2 === 0 ? 'A' : 'B',
		hand: ids.map(byId), wonCards: seat === 0 ? RECORDED.played.map(byId) : [],
		grandTichu: null, smallTichu: false, hasPlayedFirstCard: true, finishOrder: seat === 0 ? 1 : null, connected: true
	}));
	return {
		hand: players[1].hand, trick: null,
		wish: { active: false, requestedRank: null, requestedBy: null },
		currentSeat: 1 as SeatIndex, players,
		finishOrder: [0 as SeatIndex], finishedCount: 1, cumulativeScoreA: 0, cumulativeScoreB: 0,
		completedRounds: [], roundNumber: 5
	};
}

describe('낱장 두 장 마무리', () => {
	const strategies: AiStrategy[] = ['aggressive', 'balanced', 'defensive', 'tricky', 'wild'];
	for (const strategy of strategies) {
		it(`기록된 장면: Q·J에서 확실히 이기는 Q부터 낸다 (${strategy})`, () => {
			for (let i = 0; i < 5; i++) {
				expect(decidePlay(recordedCtx(), getWeightsForStrategy(strategy), getBehaviorForStrategy(strategy))).toEqual(['pagoda_12']);
			}
		});
	}
});

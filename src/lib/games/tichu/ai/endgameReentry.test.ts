/**
 * 남은 패가 세 조합일 때, 선을 되찾는 카드(A 페어)를 먼저 써 버리지 않는다.
 *
 * 실제 플레이 기록(2026-10-07, id 2001)에서 그대로 가져온 장면이다. AI(자리 1)가
 * A A 7 9를 들고 선을 잡았다. AA를 먼저 내 이긴 뒤 9를 리드했다가 J에 잡혀서
 * 7 한 장을 쥐고 3등을 했다.
 *
 * 낱장을 먼저 내면 잡혀도 두 갈래로 선을 되찾을 수 있다 — AA로 남의 페어를 받거나,
 * 남은 낱장으로 더 낮은 낱장을 받거나. 되찾으면 나머지를 리드해 나간다.
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
		['star_5', 'sword_9', 'sword_8', 'star_7', 'pagoda_10', 'pagoda_11', 'sword_4', 'phoenix'],
		['sword_14', 'jade_14', 'sword_7', 'star_9'],
		['jade_2', 'sword_2', 'star_11', 'star_2', 'sword_3'],
		['star_10', 'dog']
	],
	played: ['mahjong', 'pagoda_2', 'star_3', 'pagoda_4', 'pagoda_5', 'pagoda_3', 'star_4', 'jade_5', 'sword_6', 'pagoda_7',
		'pagoda_8', 'pagoda_9', 'jade_10', 'sword_11', 'jade_12', 'jade_3', 'sword_5', 'jade_7', 'jade_9', 'sword_10',
		'pagoda_14', 'dragon', 'pagoda_12', 'star_12', 'jade_13', 'pagoda_13', 'star_8', 'jade_8', 'pagoda_6', 'jade_6',
		'star_6', 'sword_12', 'star_13', 'star_14', 'jade_4', 'jade_11', 'sword_13']
};

function recordedCtx(): AiDecisionContext {
	const players: TichuPlayer[] = RECORDED.hands.map((ids, seat) => ({
		userId: seat, name: `p${seat}`, seat: seat as SeatIndex, team: seat % 2 === 0 ? 'A' : 'B',
		hand: ids.map(byId), wonCards: seat === 1 ? RECORDED.played.map(byId) : [],
		grandTichu: null, smallTichu: false, hasPlayedFirstCard: true, finishOrder: null, connected: true
	}));
	return {
		hand: players[1].hand, trick: null,
		wish: { active: false, requestedRank: null, requestedBy: null },
		currentSeat: 1 as SeatIndex, players,
		finishOrder: [], finishedCount: 0, cumulativeScoreA: 0, cumulativeScoreB: 0,
		completedRounds: [], roundNumber: 7
	};
}

describe('끝판 재진입 카드 보존', () => {
	const strategies: AiStrategy[] = ['aggressive', 'balanced', 'defensive', 'tricky', 'wild'];
	for (const strategy of strategies) {
		it(`기록된 장면: A A 7 9에서 AA가 아니라 낱장을 먼저 리드한다 (${strategy})`, () => {
			for (let i = 0; i < 5; i++) {
				const r = decidePlay(recordedCtx(), getWeightsForStrategy(strategy), getBehaviorForStrategy(strategy));
				expect(r, 'AA를 먼저 내면 낱장이 잡혔을 때 되찾을 길이 없다').toHaveLength(1);
				expect(['sword_7', 'star_9']).toContain((r as string[])[0]);
			}
		});
	}
});

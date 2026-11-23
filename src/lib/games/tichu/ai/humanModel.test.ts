/**
 * 학습 모델이 실제로 불러와지고, 게임 끝까지 규칙에 맞는 수만 고르는지 확인한다.
 * (규칙에 어긋난 수를 내면 엔진이 [Engine] 경고를 남기고 대체 수를 낸다 — 그 경고가 없어야 한다)
 */
import { describe, it, expect } from 'vitest';
import { loadHumanModel, extractCandidates, situationTags, FEATURE_NAMES } from './humanModel';
import * as hm from './humanModel';
import { createAllCards } from '../constants';
import { detectCombination } from '../combinations';
import type { Card, SeatIndex, TichuPlayer } from '../types';
import type { AiDecisionContext } from './types';
import { simulateGame, clampTimers, seedRandom } from './simHarness';
import type { AiStrategy } from './types';

describe('사람 기록 학습 모델', () => {
	it('불러와진다', async () => {
		const model = await loadHumanModel();
		expect(model).not.toBeNull();
		expect(model!.trees.length).toBeGreaterThan(0);
		expect(model!.features).toContain('u_rami');
	});

	it('모델이 쓰는 특징을 엔진이 모두 만든다', async () => {
		const model = await loadHumanModel();
		const known = new Set([...FEATURE_NAMES, 'u_arang', 'u_memo', 'u_odin', 'u_rami']);
		expect(model!.features.filter(n => !known.has(n))).toEqual([]);
		// 상황 조건(바닥 주인의 남은 장수 등)을 보고 배운 모델이어야 한다
		expect(model!.features).toContain('ownerLeft');
	});

	it('모든 캐릭터가 모델로 게임을 끝까지 둔다', async () => {
		await loadHumanModel();
		const restore = clampTimers();
		const un = seedRandom(42);
		try {
			const presets: AiStrategy[] = ['aggressive', 'balanced', 'defensive', 'tricky', 'wild'];
			for (let g = 0; g < 2; g++) {
				const r = await simulateGame({
					presets: [presets[g], presets[(g + 1) % 5], presets[(g + 2) % 5], presets[(g + 3) % 5]] as [AiStrategy, AiStrategy, AiStrategy, AiStrategy],
					targetScore: 300
				});
				expect(r.crash).toBeNull();
				expect(r.completed).toBe(true);
				expect(r.consoleNoise.filter(n => /\[Engine\]/.test(n))).toEqual([]);
			}
			expect(hm.getHumanModel()).not.toBeNull();
		} finally {
			un();
			restore();
		}
	}, 120_000);
});

describe('상황 구분', () => {
	const DECK = createAllCards();
	const card = (id: string): Card => DECK.find(x => x.id === id)!;
	const cards = (ids: string) => ids.split(' ').map(card);

	/** 1번 자리(상대) 또는 2번 자리(파트너)가 낸 카드를 0번 자리가 받는 장면 */
	function follow(myHand: string, top: string, topSeat = 1): AiDecisionContext {
		const filler = DECK.filter(c => c.type === 'normal' && c.rank <= 4);
		const players: TichuPlayer[] = [0, 1, 2, 3].map(seat => ({
			userId: seat, name: `p${seat}`, seat: seat as SeatIndex, team: seat % 2 === 0 ? 'A' : 'B',
			hand: seat === 0 ? cards(myHand) : filler.slice(seat * 3, seat * 3 + 9), wonCards: [],
			grandTichu: null, smallTichu: false, hasPlayedFirstCard: true, finishOrder: null, connected: true
		}));
		return {
			hand: players[0].hand,
			trick: { plays: [{ seat: topSeat as SeatIndex, combination: detectCombination(cards(top))! }], passCount: 0, leadSeat: topSeat as SeatIndex, currentSeat: 0 as SeatIndex },
			wish: { active: false, requestedRank: null, requestedBy: null },
			currentSeat: 0 as SeatIndex, players, finishOrder: [], finishedCount: 0,
			cumulativeScoreA: 0, cumulativeScoreB: 0, completedRounds: [], roundNumber: 1
		};
	}
	const tagsOf = (ctx: AiDecisionContext) => {
		const set = extractCandidates(ctx);
		const tags = situationTags(set);
		return Object.fromEntries(set.keys.map((k, i) => [k, tags[i]]));
	};

	it('상대 K 위 — 용 말고는 못 이기면 용과 패스에 상황이 붙는다', () => {
		const t = tagsOf(follow('dragon jade_3 sword_5 pagoda_7 star_9 jade_10 sword_11', 'jade_13'));
		expect(t['dragon']).toBe('dragonLowOnly_far');
		expect(t['P']).toBe('passHigh_far');
	});

	it('상대 9 위 — 낮은 카드로도 이길 수 있으면 A는 "남는 A"다', () => {
		const t = tagsOf(follow('jade_14 jade_11 sword_3 pagoda_5 star_7 jade_8 sword_6', 'jade_9'));
		expect(t['14']).toBe('aceSpare');
		expect(t['11']).toBeNull();
		expect(['passFree_far', 'passBreak_far']).toContain(t['P']);
	});

	it('파트너가 이기고 있으면 패스에만 붙는다', () => {
		const t = tagsOf(follow('jade_14 jade_11 sword_3 pagoda_5', 'jade_9', 2));
		expect(t['P']).toBe('passPartner');
		expect(t['14']).toBeNull();
	});
});

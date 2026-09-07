/**
 * 봉황이 낀 스트레이트 판정 회귀 테스트.
 *
 * 봉황은 스트레이트에서 어떤 값도 될 수 있어 해석이 여러 개 나온다.
 * (10·J·Q·K + 봉황 → 9-10-J-Q-K 또는 10-J-Q-K-A)
 * 항상 가장 높은 해석을 골라야 한다. 높은 해석은 낮은 해석이 이기는 모든 것을
 * 이기므로 손해가 없다.
 */
import { describe, it, expect } from 'vitest';
import { detectCombination, getPhoenixSubstituteRank } from './combinations';
import { createAllCards } from './constants';
import type { Card } from './types';

const DECK = createAllCards();

/** 랭크로 일반 카드 한 장 집기 */
function card(rank: number): Card {
	const c = DECK.find(x => x.type === 'normal' && x.rank === rank);
	if (!c) throw new Error(`rank ${rank} 카드 없음`);
	return c;
}
const phoenix = DECK.find(c => c.type === 'special' && c.special === 'phoenix')!;

describe('봉황 스트레이트', () => {
	it('10·J·Q·K + 봉황 → A탑 (K탑이 아니라)', () => {
		const combo = detectCombination([card(10), card(11), card(12), card(13), phoenix]);
		expect(combo?.type).toBe('straight');
		expect(combo?.length).toBe(5);
		expect(combo?.rank, '봉황을 9로 채워 K탑이 됨').toBe(14);
		expect(getPhoenixSubstituteRank([card(10), card(11), card(12), card(13), phoenix])).toBe(14);
	});

	it('9·10·J·Q·K + 봉황 → A탑 6장', () => {
		const cards = [card(9), card(10), card(11), card(12), card(13), phoenix];
		const combo = detectCombination(cards);
		expect(combo?.type).toBe('straight');
		expect(combo?.rank).toBe(14);
		expect(getPhoenixSubstituteRank(cards)).toBe(14);
	});

	it('중간이 빈 경우는 그 자리를 채운다: 10·J·K·A + 봉황 → A탑', () => {
		const cards = [card(10), card(11), card(13), card(14), phoenix];
		const combo = detectCombination(cards);
		expect(combo?.type).toBe('straight');
		expect(combo?.rank).toBe(14);
		expect(getPhoenixSubstituteRank(cards), '빠진 Q를 채워야 함').toBe(12);
	});

	it('A가 이미 있으면 위로 못 늘리므로 아래를 채운다: 10·J·Q·K·A + 봉황 → A탑 6장', () => {
		const cards = [card(10), card(11), card(12), card(13), card(14), phoenix];
		const combo = detectCombination(cards);
		expect(combo?.type).toBe('straight');
		expect(combo?.rank).toBe(14);
		expect(combo?.length).toBe(6);
		expect(getPhoenixSubstituteRank(cards)).toBe(9);
	});

	it('낮은 쪽 스트레이트도 최대로 올린다: 3·4·5·6 + 봉황 → 7탑', () => {
		const cards = [card(3), card(4), card(5), card(6), phoenix];
		const combo = detectCombination(cards);
		expect(combo?.type).toBe('straight');
		expect(combo?.rank).toBe(7);
		expect(getPhoenixSubstituteRank(cards)).toBe(7);
	});

	it('표시용 봉황 값과 실제 판정이 어긋나지 않는다', () => {
		for (let base = 2; base <= 10; base++) {
			const cards = [card(base), card(base + 1), card(base + 2), card(base + 3), phoenix];
			const combo = detectCombination(cards);
			const sub = getPhoenixSubstituteRank(cards);
			expect(combo, `base ${base}`).not.toBeNull();
			expect(sub, `base ${base}: 봉황 값 없음`).not.toBeNull();
			// 봉황이 최고 랭크를 맡았다면 combo.rank와 같아야 하고,
			// 아니면 combo.rank는 실제 카드의 최고 랭크(base+3)여야 한다
			const expectedTop = Math.max(base + 3, sub!);
			expect(combo!.rank, `base ${base}: 판정 랭크와 봉황 값 불일치`).toBe(expectedTop);
		}
	});
});

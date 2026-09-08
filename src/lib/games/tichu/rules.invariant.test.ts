/**
 * 티츄 규칙 불변식 테스트 (속성 기반).
 *
 * 지금까지의 검증은 "AI가 얼마나 잘 두나"(점수 측정)에 치우쳐 있었고
 * "규칙을 맞게 구현했나"를 보지 않았다. 봉황 스트레이트가 항상 약한 해석으로
 * 판정되던 버그는 시뮬레이션 수만 판으로도 안 잡히지만 이런 테스트 하나면 잡힌다.
 *
 * 무작위 손패를 많이 만들어 아래 불변식을 확인한다.
 */
import { describe, it, expect } from 'vitest';
import { detectCombination, canBeat, isBomb, getPhoenixSubstituteRank, resolvePhoenixSingleRank } from './combinations';
import {
	findAllPlayableCombinations,
	findOptimalPartition,
	findBeatablePlays,
	findLeadPlays
} from './ai/handEvaluator';
import { createShuffledDeck } from './deck';
import type { Card, Combination } from './types';

const ITER = 400;

function hands(n: number, size: number): Card[][] {
	const out: Card[][] = [];
	for (let i = 0; i < n; i++) out.push(createShuffledDeck().slice(0, size));
	return out;
}

function sameCardSet(a: Card[], b: Card[]): boolean {
	if (a.length !== b.length) return false;
	const ids = new Set(a.map(c => c.id));
	return b.every(c => ids.has(c.id));
}

describe('조합 판정 불변식', () => {
	it('findAllPlayableCombinations가 돌려준 조합은 detectCombination과 일치한다', () => {
		for (const hand of hands(ITER, 14)) {
			for (const combo of findAllPlayableCombinations(hand)) {
				const handIds = new Set(hand.map(c => c.id));
				expect(combo.cards.every(c => handIds.has(c.id)), '손패에 없는 카드를 씀').toBe(true);
				const re = detectCombination(combo.cards);
				expect(re, `판정 실패: ${combo.type} ${combo.cards.map(c => c.id).join(',')}`).not.toBeNull();
				expect(re!.type, `타입 불일치 (${combo.type} → ${re!.type})`).toBe(combo.type);
				expect(re!.rank, `랭크 불일치 (${combo.type})`).toBe(combo.rank);
			}
		}
	});

	it('detectCombination은 같은 카드에 대해 항상 같은 결과를 준다 (순서 무관)', () => {
		for (const hand of hands(ITER, 14)) {
			for (const combo of findAllPlayableCombinations(hand)) {
				const shuffled = [...combo.cards].sort(() => Math.random() - 0.5);
				const a = detectCombination(combo.cards);
				const b = detectCombination(shuffled);
				expect(b, '순서를 바꾸니 판정 실패').not.toBeNull();
				expect(b!.type, '순서에 따라 타입이 달라짐').toBe(a!.type);
				expect(b!.rank, '순서에 따라 랭크가 달라짐').toBe(a!.rank);
			}
		}
	});

	// 봉황 싱글과 개는 제외한다.
	// 봉황 싱글의 랭크는 "무엇 위에 냈는가"로 결정되며(resolvePhoenixSingleRank),
	// 엔진이 플레이 시점에 확정한다. detectCombination이 돌려주는 원시 조합의
	// rank 0은 아직 값이 정해지지 않았다는 표시일 뿐이다.
	// 개는 트릭을 즉시 넘기므로 이길 대상(current)이 되는 일이 없다.
	const isUnresolvedSingle = (c: Combination) =>
		c.type === 'single' && c.cards.length === 1 && c.cards[0].type === 'special' &&
		(c.cards[0].special === 'phoenix' || c.cards[0].special === 'dog');

	it('canBeat는 반대칭이다 — 서로를 이길 수는 없다', () => {
		for (const hand of hands(ITER, 14)) {
			const combos = findAllPlayableCombinations(hand)
				.filter(c => !isUnresolvedSingle(c)).slice(0, 12);
			for (const a of combos) {
				for (const b of combos) {
					if (a === b) continue;
					const ab = canBeat(a, b);
					const ba = canBeat(b, a);
					expect(ab && ba, `서로 이김: ${a.type}(${a.rank}) ↔ ${b.type}(${b.rank})`).toBe(false);
				}
			}
		}
	});

	it('폭탄은 일반 조합을 항상 이기고, 일반 조합은 폭탄을 못 이긴다', () => {
		for (const hand of hands(ITER, 14)) {
			const combos = findAllPlayableCombinations(hand);
			const bombs = combos.filter(isBomb);
			const normals = combos.filter(c => !isBomb(c));
			for (const bomb of bombs) {
				for (const n of normals.slice(0, 10)) {
					expect(canBeat(n, bomb), `폭탄이 ${n.type}을 못 이김`).toBe(true);
					expect(canBeat(bomb, n), `${n.type}이 폭탄을 이김`).toBe(false);
				}
			}
		}
	});

	it('findOptimalPartition은 손패를 정확히 분할한다', () => {
		for (const hand of hands(ITER, 14)) {
			const part = findOptimalPartition(hand);
			expect(part.turns, '턴 수 ≠ 조합 수').toBe(part.combos.length);
			const used = part.combos.flatMap(c => c.cards);
			expect(sameCardSet(used, hand), '분할이 손패와 다름 (중복/누락)').toBe(true);
			for (const c of part.combos) {
				expect(detectCombination(c.cards), `분할에 유효하지 않은 조합: ${c.type}`).not.toBeNull();
			}
		}
	});

	it('findBeatablePlays가 돌려준 수는 실제로 상대 조합을 이긴다', () => {
		for (const hand of hands(ITER, 14)) {
			const target = findAllPlayableCombinations(hand)[0];
			if (!target) continue;
			const other = createShuffledDeck().slice(0, 14);
			for (const play of findBeatablePlays(other, target).slice(0, 10)) {
				expect(canBeat(target, play), `이긴다고 했는데 못 이김: ${play.type}(${play.rank}) vs ${target.type}(${target.rank})`).toBe(true);
			}
		}
	});

	it('findLeadPlays는 손패 카드만 쓰고 모두 유효한 조합이다', () => {
		for (const hand of hands(ITER, 14)) {
			const handIds = new Set(hand.map(c => c.id));
			for (const play of findLeadPlays(hand)) {
				expect(play.cards.every(c => handIds.has(c.id)), '손패에 없는 카드').toBe(true);
				expect(detectCombination(play.cards), `유효하지 않은 리드: ${play.type}`).not.toBeNull();
			}
		}
	});

	it('봉황이 낀 조합은 표시 랭크와 판정 랭크가 어긋나지 않는다', () => {
		for (const hand of hands(ITER, 14)) {
			for (const combo of findAllPlayableCombinations(hand)) {
				const hasPhoenix = combo.cards.some(c => c.type === 'special' && c.special === 'phoenix');
				if (!hasPhoenix || combo.type !== 'straight') continue;
				const sub = getPhoenixSubstituteRank(combo.cards);
				expect(sub, '봉황 대체값을 못 구함').not.toBeNull();
				const realTop = Math.max(
					...combo.cards.filter(c => c.type === 'normal').map(c => (c as { rank: number }).rank)
				);
				// 스트레이트 최고 랭크는 실제 카드 최고값이거나 봉황이 맡은 값이어야 한다
				expect(combo.rank, `스트레이트 랭크 ${combo.rank}가 실제 최고(${realTop})/봉황(${sub})과 무관`)
					.toBe(Math.max(realTop, sub!));
			}
		}
	});

	it('봉황 싱글은 해소 후 규칙대로 동작한다 (용만 못 이김)', () => {
		const deck = createShuffledDeck();
		const phoenix = deck.find(c => c.type === 'special' && c.special === 'phoenix')!;
		const dragon = deck.find(c => c.type === 'special' && c.special === 'dragon')!;
		const phoenixSingle = detectCombination([phoenix])!;
		const dragonSingle = detectCombination([dragon])!;
		expect(canBeat(dragonSingle, phoenixSingle), '봉황이 용을 이김').toBe(false);
		for (let rank = 2; rank <= 14; rank++) {
			const c = deck.find(x => x.type === 'normal' && x.rank === rank)!;
			const single = detectCombination([c])!;
			expect(canBeat(single, phoenixSingle), `봉황이 ${rank}을 못 이김`).toBe(true);
			// 해소 후에는 그 위 랭크만 이길 수 있다
			const resolved = resolvePhoenixSingleRank(phoenixSingle, single);
			const higher = deck.find(x => x.type === 'normal' && x.rank === rank + 1);
			if (higher) {
				expect(canBeat(resolved, detectCombination([higher])!), `해소된 봉황(${resolved.rank})을 ${rank + 1}이 못 이김`).toBe(true);
			}
			expect(canBeat(resolved, single), `해소된 봉황(${resolved.rank})을 같은 ${rank}이 이김`).toBe(false);
		}
	});

	it('같은 랭크·타입 조합끼리는 서로 이기지 못한다', () => {
		for (const hand of hands(ITER, 14)) {
			const combos = findAllPlayableCombinations(hand)
				.filter(c => !isBomb(c) && !isUnresolvedSingle(c));
			const byKey = new Map<string, Combination[]>();
			for (const c of combos) {
				const k = `${c.type}:${c.rank}:${c.cards.length}`;
				byKey.set(k, [...(byKey.get(k) ?? []), c]);
			}
			for (const [k, group] of byKey) {
				if (group.length < 2) continue;
				expect(canBeat(group[0], group[1]), `동급끼리 이김: ${k}`).toBe(false);
			}
		}
	});
});

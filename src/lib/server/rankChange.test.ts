import { describe, it, expect } from 'vitest';
import { displacedRankRange } from './rankChange';

/** 범위 안(above < rank <= upTo)에 드는 순위 목록 */
const ranks = (r: { above: number; upTo: number }) =>
	Array.from({ length: r.upTo - r.above }, (_, i) => r.above + 1 + i);

describe('순위 변동 알림 대상', () => {
	it('2위가 1위로 올라가면 원래 1위(지금 2위)만 밀려난다 — 3위는 아니다', () => {
		expect(ranks(displacedRankRange(1, 2))).toEqual([2]);
	});

	it('5위가 2위로 올라가면 원래 2~4위(지금 3~5위)가 밀려난다', () => {
		expect(ranks(displacedRankRange(2, 5))).toEqual([3, 4, 5]);
	});

	it('처음 기록으로 3위에 들어오면 바로 아래 5명에게만 알린다', () => {
		expect(ranks(displacedRankRange(3, null))).toEqual([4, 5, 6, 7, 8]);
	});
});

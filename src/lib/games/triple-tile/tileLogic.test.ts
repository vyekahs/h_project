import { describe, it, expect } from 'vitest';
import { insertIntoStaging, resolveStagingMatch, stagingOccupied } from './tileLogic';
import type { Tile } from './types';

const CAP = 7;
let nextId = 1;
const tile = (typeId: number): Tile => ({ id: nextId++, typeId, col: 0, row: 0, layer: 0, removed: false });
const staging = (...types: number[]): (Tile | null)[] => {
	const s: (Tile | null)[] = Array(CAP).fill(null);
	types.forEach((t, i) => (s[i] = tile(t)));
	return s;
};

/** 타일들을 연달아 고른다 — 앞 타일이 아직 날아가는 중이라 가상 칸으로 계산한다 */
function pickAll(start: (Tile | null)[], types: number[], resolve: boolean): number {
	let virtual = start;
	let picked = 0;
	for (const t of types) {
		const r = insertIntoStaging(virtual, tile(t), CAP);
		if (!r) break; // 꽉 참 → 게임 오버
		virtual = resolve ? resolveStagingMatch(r.newStaging, CAP).resolved : r.newStaging;
		picked++;
	}
	return picked;
}

describe('트리플 타일: 날아가는 중인 타일의 매치', () => {
	it('세 장이 모이면 터진 뒤 상태를 돌려준다', () => {
		const { matchedType, resolved } = resolveStagingMatch(staging(1, 1, 1, 2, 3), CAP);
		expect(matchedType).toBe(1);
		expect(stagingOccupied(resolved)).toBe(2);
	});

	it('A A B C D에서 세 번째 A가 날아가는 동안 네 장을 더 골라도 게임이 끝나지 않는다', () => {
		// 세 번째 A가 들어가면 A 세 장이 터져 B C D만 남는다 → 네 장 더 들어갈 자리가 있다
		const start = staging(1, 1, 2, 3, 4);
		expect(pickAll(start, [1, 5, 6, 7, 8], true)).toBe(5);
		// 예전 계산(터질 세 장을 그대로 둠)에서는 두 장째에 꽉 찼다
		expect(pickAll(start, [1, 5, 6, 7, 8], false)).toBe(2);
	});

	it('정말 꽉 찼으면 여전히 막는다', () => {
		expect(pickAll(staging(1, 2, 3, 4, 5, 6), [7, 8], true)).toBe(1);
	});
});

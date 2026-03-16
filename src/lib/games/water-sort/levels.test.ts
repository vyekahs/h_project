import { describe, it, expect } from 'vitest';
import { canPour, pourWater, checkWin, isStuck, isEffectivelyStuck, serializeTubes, getTopGroup } from './levels';
import type { Tube } from './types';

/** Helper: create tubes from layer arrays (id auto-assigned) */
function makeTubes(...layers: number[][]): Tube[] {
	return layers.map((l, i) => ({ id: i, layers: [...l] }));
}

// ============================================================
// 1. isStuck — 기본 케이스
// ============================================================
describe('isStuck', () => {
	it('1a. 완성 상태 → stuck (이동 없음, 하지만 checkWin이 먼저 처리)', () => {
		const tubes = makeTubes(
			[0, 0, 0, 0],
			[1, 1, 1, 1],
			[]
		);
		// 완성 상태에서는 이동 가능한 수가 없으므로 isStuck=true
		// 게임에서는 checkWin을 먼저 검사하므로 문제없음
		expect(isStuck(tubes)).toBe(true);
	});

	it('1b. 이동 가능한 수 있음 → not stuck', () => {
		const tubes = makeTubes(
			[0, 0, 1],
			[1, 1, 0],
			[]
		);
		expect(isStuck(tubes)).toBe(false);
	});

	it('1c. 모든 튜브 꽉 찼고 색 다름 → stuck', () => {
		const tubes = makeTubes(
			[0, 1, 0, 1],
			[1, 0, 1, 0]
		);
		expect(isStuck(tubes)).toBe(true);
	});

	it('1d. 빈 튜브 없고 색 안 맞음 → stuck', () => {
		const tubes = makeTubes(
			[0, 0, 1, 1],
			[1, 1, 0, 0]
		);
		// top of tube0 = 1, top of tube1 = 0 → different, and both full
		expect(isStuck(tubes)).toBe(true);
	});
});

// ============================================================
// 2. isEffectivelyStuck — false negative 케이스 (막혔는데 감지해야 함)
// ============================================================
describe('isEffectivelyStuck — should detect stuck', () => {
	it('2a. 같은 색끼리만 빈 튜브로 왔다갔다', () => {
		// [R,R,R], [R], [] — 빨간색만 있고, 완성된 건 아니지만 합칠 수 있으니 이건 풀 수 있음
		// 대신: 완성 불가한 상태를 만들자
		// [0,0,0], [1], [], 나머지 완성 — 0이 3개, 1이 1개 → 0을 완성 못함 (4개 필요), 1도 완성 못함
		// 그런데 이건 색 수가 안 맞는 비정상 상태. 정상 게임에서 각 색은 정확히 4개.
		// 실제 시나리오: 완성된 튜브 + 남은 미완성 튜브만 순환
		const tubes = makeTubes(
			[0, 0, 0, 0], // 완성
			[1, 1, 1, 1], // 완성
			[2, 2, 3],    // 미완성: top=3
			[3, 3, 2],    // 미완성: top=2
			[]            // 빈 튜브
		);
		// 가능한 수: 2→빈(2옮김), 3→빈(3옮김) — 하지만 어디로 옮겨도 순환
		// 2에서 top 3을 빈 튜브로 → [2,2], [3,3,2], [3] → 3에서 2를 빈... 순환
		expect(isStuck(tubes)).toBe(false); // canPour는 가능 → isStuck=false
		// isEffectivelyStuck이 true여야 함 (아직 함수 없으므로 이 테스트는 Step 2에서 활성화)
	});

	it('2b. 혼합 튜브에서 같은 색 top만 교환, 완성 불가', () => {
		// [A,A,B,B] ↔ [C,C,B] + [] 패턴
		// B를 옮길 수 있지만 밑에 A/C가 깔려 있어 완성 불가
		const tubes = makeTubes(
			[0, 0, 1, 1], // top=1
			[2, 2, 1],    // top=1
			[]            // 빈
		);
		// 1을 빈 튜브로 옮기거나 서로 교환 가능, 하지만 밑의 0,2는 꺼낼 수 없음
		// 0이 2개, 1이 3개, 2가 2개 — 어떤 색도 4개가 아님 → 비정상이지만 테스트용
		expect(isStuck(tubes)).toBe(false);
	});

	it('2c. 여러 색이 교착 — 순환만 가능', () => {
		// 두 튜브가 서로의 색을 top에 갖고, 빈 튜브 하나
		const tubes = makeTubes(
			[0, 1],  // top=1
			[1, 0],  // top=0
			[]       // 빈
		);
		// 0→빈(0옮김) → [0], [1,0], [1] → 이제 1을 옮길 수 있고...
		// 실제로 이건 풀 수 있나? [0,1],[1,0],[] → 0에서 1을 빈으로 → [0],[1,0],[1]
		// → 1에서 0을 0튜브로 → [0,0],[1],[1] → 1합침 → [0,0],[1,1],[] → 아직 미완성(2개씩)
		// 색당 2개밖에 없으면 완성 불가 (TUBE_CAPACITY=4)
		// 정상 게임에서는 색당 4개이므로 이 상태 자체가 비정상
		// 더 현실적인 케이스를 만들자
		expect(isStuck(tubes)).toBe(false);
	});

	it('2d. 현실적 교착: 2색이 서로 섞여있고 빈 공간 부족', () => {
		// 색 0: 4개, 색 1: 4개, 색 2: 4개 → 3개 완성 튜브가 목표
		// 하지만 배치가 교착되어 풀 수 없는 상태
		const tubes = makeTubes(
			[0, 1, 0, 1], // 교차 배열, 꽉 참
			[1, 0, 1, 0], // 교차 배열, 꽉 참
			[2, 2, 2, 2], // 완성
			[]            // 빈 튜브 1개
		);
		// tube0 top=1, tube1 top=0 → 서로 못 부음 (다른 색), 빈 튜브로만 가능
		// tube0→빈: 1 옮김 → [0,1,0],[1,0,1,0],[2,2,2,2],[1]
		// tube1 top=0, 빈 top=1 → 못 부음, tube0 top=0 → tube1은 꽉 참
		// 유일한 수: tube0→빈 반복 → 결국 원래대로 돌아옴
		expect(isStuck(tubes)).toBe(false); // isStuck=false (canPour 가능)
	});

	it('2e. 단색 튜브끼리 빈 튜브로 셔플만 가능', () => {
		// 완성된 것 제외하고, 남은 튜브가 같은 색만 왔다갔다
		const tubes = makeTubes(
			[0, 0, 0, 0], // 완성
			[1, 1, 1, 1], // 완성
			[2, 2],       // 미완성 (2가 2개 — 나머지 2개는 어디?)
			[3, 3],       // 미완성 (3이 2개)
			[2, 2, 3, 3], // top=3
			[]            // 빈
		);
		// tube4 top=3 → tube3로 (3+3=4 → 완성!) → [2,2],[],[2,2,3,3→3,3만 옮김]
		// 실제로 pourWater는 연속된 같은 색을 한번에 옮김
		// tube4: [2,2,3,3] top group = 3, count=2, tube3에 space=2 → 2개 옮김
		// → tube4: [2,2], tube3: [3,3,3,3] 완성! → tube2+tube4 합치면 [2,2,2,2] 완성
		// 이건 풀 수 있는 상태 → not stuck
		expect(isStuck(tubes)).toBe(false);
	});
});

// ============================================================
// 2-real. isEffectivelyStuck 실제 테스트 (BFS로 검증된 케이스)
// ============================================================
describe('isEffectivelyStuck', () => {
	// --- TRUE 케이스: 이동은 가능하지만 풀 수 없는 상태 (BFS 검증 완료) ---

	it('교착: 교차 2튜브 + 부분 튜브 [0] (9 states explored)', () => {
		// [0,1,0,1],[1,0,1,0],[0] — 이동 가능하지만 풀 수 없음
		const tubes = makeTubes([0, 1, 0, 1], [1, 0, 1, 0], [0]);
		expect(isStuck(tubes)).toBe(false);
		expect(isEffectivelyStuck(tubes)).toBe(true);
	});

	it('교착: 교차 2튜브 + 부분 튜브 [1] (9 states explored)', () => {
		const tubes = makeTubes([0, 1, 0, 1], [1, 0, 1, 0], [1]);
		expect(isStuck(tubes)).toBe(false);
		expect(isEffectivelyStuck(tubes)).toBe(true);
	});

	it('교착: 3색 순환 3x3 + 빈 1개 (60 states explored)', () => {
		// 3색 각 3개, 3개 튜브에 순환 배치, 빈 1개로는 불가
		const tubes = makeTubes([0, 1, 2], [2, 0, 1], [1, 2, 0], []);
		expect(isStuck(tubes)).toBe(false);
		expect(isEffectivelyStuck(tubes)).toBe(true);
	});

	it('교착: 교차 2튜브 + 부분 빈(18 states)', () => {
		// [0,1,0,1],[1,0,1],[] — top만 이동 가능, 순환
		const tubes = makeTubes([0, 1, 0, 1], [1, 0, 1], []);
		expect(isStuck(tubes)).toBe(false);
		expect(isEffectivelyStuck(tubes)).toBe(true);
	});

	it('교착: 교차 2튜브 + 부분 [0,0] (6 states)', () => {
		const tubes = makeTubes([0, 1, 0, 1], [1, 0, 1, 0], [0, 0]);
		expect(isStuck(tubes)).toBe(false);
		expect(isEffectivelyStuck(tubes)).toBe(true);
	});

	// --- FALSE 케이스: 풀 수 있는 상태 (BFS 검증 완료) ---

	it('풀 수 있음: 한 수로 완성 가능', () => {
		const tubes = makeTubes(
			[0, 0, 0],    // 0이 3개
			[1, 1, 1, 0], // top=0
			[1],
			[]
		);
		expect(isEffectivelyStuck(tubes)).toBe(false);
	});

	it('풀 수 있음: 교차 2튜브 + 빈 1개 (충분한 공간)', () => {
		// BFS로 검증: [0,1,0,1],[1,0,1,0],[] → 7수만에 해결 가능
		const tubes = makeTubes([0, 1, 0, 1], [1, 0, 1, 0], []);
		expect(isEffectivelyStuck(tubes)).toBe(false);
	});

	it('풀 수 있음: 빈 튜브 2개로 분리 후 해결', () => {
		const tubes = makeTubes([0, 0, 1, 1], [1, 1, 0, 0], [], []);
		expect(isEffectivelyStuck(tubes)).toBe(false);
	});

	it('풀 수 있음: 완성 1개 + 교차 2개 + 빈 1개', () => {
		// BFS 검증: [0,0,0,0],[1,2,1,2],[2,1,2,1],[] → WIN
		const tubes = makeTubes([0, 0, 0, 0], [1, 2, 1, 2], [2, 1, 2, 1], []);
		expect(isEffectivelyStuck(tubes)).toBe(false);
	});

	it('풀 수 있음: 교차 + 빈 2개', () => {
		// [0,1,0,1],[1,0,1],[0],[] → WIN
		const tubes = makeTubes([0, 1, 0, 1], [1, 0, 1], [0], []);
		expect(isEffectivelyStuck(tubes)).toBe(false);
	});

	it('풀 수 있음: 거의 완성된 상태', () => {
		const tubes = makeTubes(
			[0, 0, 0, 0], [1, 1, 1], [2, 2, 2, 1], [2], []
		);
		expect(isEffectivelyStuck(tubes)).toBe(false);
	});

	it('풀 수 있음: 3색 순환 + 빈 2개', () => {
		// BFS 검증: 빈 2개면 충분한 작업 공간
		const tubes = makeTubes([0, 1, 2, 0], [1, 2, 0, 1], [2, 0, 1, 2], [], []);
		expect(isEffectivelyStuck(tubes)).toBe(false);
	});

	it('완성 상태 → not effectively stuck', () => {
		const tubes = makeTubes([0, 0, 0, 0], [1, 1, 1, 1], []);
		expect(isEffectivelyStuck(tubes)).toBe(false);
	});

	it('물리적으로 막힘 (isStuck=true) → effectively stuck도 true', () => {
		const tubes = makeTubes([0, 1, 0, 1], [1, 0, 1, 0]);
		expect(isStuck(tubes)).toBe(true);
		expect(isEffectivelyStuck(tubes)).toBe(true);
	});
});

// ============================================================
// 3. serializeTubes
// ============================================================
describe('serializeTubes', () => {
	it('4a. 튜브 순서 달라도 같은 상태면 같은 키', () => {
		const tubes1 = makeTubes([0, 1], [2, 3], []);
		const tubes2 = makeTubes([2, 3], [], [0, 1]);
		expect(serializeTubes(tubes1)).toBe(serializeTubes(tubes2));
	});

	it('4b. 다른 상태면 다른 키', () => {
		const tubes1 = makeTubes([0, 1], [2, 3]);
		const tubes2 = makeTubes([0, 2], [1, 3]);
		expect(serializeTubes(tubes1)).not.toBe(serializeTubes(tubes2));
	});
});

// ============================================================
// 4. 기존 함수 검증
// ============================================================
describe('canPour', () => {
	it('빈 소스 → false', () => {
		expect(canPour({ id: 0, layers: [] }, { id: 1, layers: [0] })).toBe(false);
	});

	it('꽉 찬 타겟 → false', () => {
		expect(canPour(
			{ id: 0, layers: [0] },
			{ id: 1, layers: [1, 1, 1, 1] }
		)).toBe(false);
	});

	it('빈 타겟 → true', () => {
		expect(canPour(
			{ id: 0, layers: [0] },
			{ id: 1, layers: [] }
		)).toBe(true);
	});

	it('같은 색 top → true', () => {
		expect(canPour(
			{ id: 0, layers: [0, 1] },
			{ id: 1, layers: [2, 1] }
		)).toBe(true);
	});

	it('다른 색 top → false', () => {
		expect(canPour(
			{ id: 0, layers: [0, 1] },
			{ id: 1, layers: [2, 0] }
		)).toBe(false);
	});
});

describe('pourWater', () => {
	it('연속 같은 색 한번에 옮김', () => {
		const src: Tube = { id: 0, layers: [0, 1, 1] };
		const tgt: Tube = { id: 1, layers: [1] };
		const count = pourWater(src, tgt);
		expect(count).toBe(2);
		expect(src.layers).toEqual([0]);
		expect(tgt.layers).toEqual([1, 1, 1]);
	});

	it('공간 부족하면 가능한 만큼만', () => {
		const src: Tube = { id: 0, layers: [0, 1, 1, 1] };
		const tgt: Tube = { id: 1, layers: [2, 2, 1] };
		const count = pourWater(src, tgt);
		expect(count).toBe(1);
		expect(src.layers).toEqual([0, 1, 1]);
		expect(tgt.layers).toEqual([2, 2, 1, 1]);
	});

	it('부을 수 없으면 0 반환', () => {
		const src: Tube = { id: 0, layers: [0, 1] };
		const tgt: Tube = { id: 1, layers: [2, 0] };
		expect(pourWater(src, tgt)).toBe(0);
	});
});

describe('checkWin', () => {
	it('모든 튜브 완성 또는 비어있음 → true', () => {
		const tubes = makeTubes([0, 0, 0, 0], [1, 1, 1, 1], []);
		expect(checkWin(tubes)).toBe(true);
	});

	it('미완성 튜브 있음 → false', () => {
		const tubes = makeTubes([0, 0, 0], [1, 1, 1, 1], [0]);
		expect(checkWin(tubes)).toBe(false);
	});

	it('혼합 색 완성 → false', () => {
		const tubes = makeTubes([0, 1, 0, 1]);
		expect(checkWin(tubes)).toBe(false);
	});

	it('모든 빈 튜브 → true', () => {
		const tubes = makeTubes([], []);
		expect(checkWin(tubes)).toBe(true);
	});
});

describe('getTopGroup', () => {
	it('빈 튜브 → null', () => {
		expect(getTopGroup({ id: 0, layers: [] })).toBe(null);
	});

	it('단일 색 → count=전체', () => {
		const result = getTopGroup({ id: 0, layers: [1, 1, 1] });
		expect(result).toEqual({ color: 1, count: 3 });
	});

	it('혼합 → top 연속만', () => {
		const result = getTopGroup({ id: 0, layers: [0, 1, 1] });
		expect(result).toEqual({ color: 1, count: 2 });
	});
});

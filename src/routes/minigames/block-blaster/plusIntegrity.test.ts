/**
 * 플러스 모드 상태 정합성 회귀 테스트.
 *
 * 제보 증상:
 *  (A) 보라/흑돌 칸에 블록이 놓이고, 꽉 찬 줄이 안 없어진다
 *  (B) 놓을 자리가 없는데 게임이 끝나지도 진행되지도 않는다
 *
 * (A)의 메커니즘은 "유령 셀" — grid는 0인데 cellMeta에 채워짐을 뜻하는 마커가
 * 남은 칸이다. 화면은 메타를 보고 돌로 그리는데 canPlaceBlock/findCompletedLines는
 * 빈 칸으로 취급하므로, 그 위에 블록이 놓이고 줄이 꽉 차 보여도 안 지워진다.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runGame, clampTimers } from './simHarness';

let restoreFetch: (() => void) | null = null;
beforeAll(() => {
	const real = globalThis.fetch;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(globalThis as any).fetch = async () => ({ ok: true, json: async () => ({}) });
	restoreFetch = () => { globalThis.fetch = real; };
});
afterAll(() => restoreFetch?.());

async function runMany(n: number) {
	const stalls: number[] = [];
	const ghosts: string[] = [];
	for (let i = 0; i < n; i++) {
		const r = await runGame({ mode: 'special' });
		if (r.stalled) stalls.push(i);
		if (r.ghostCells.length) ghosts.push(`run${i}: ${r.ghostCells.join(' | ')}`);
	}
	return { stalls, ghosts };
}

describe('플러스 모드 상태 정합성', () => {
	// (B) 봉인된 슬롯을 "쓸 수 있는 능력"으로 세면 게임오버가 무기한 보류돼
	// 판이 멈춘다. hasUsableActiveAbility()에서 봉인 슬롯을 제외해 고쳤다.
	it('놓을 자리가 없으면 판이 멈추지 않고 끝난다', async () => {
		const restore = clampTimers();
		try {
			const { stalls } = await runMany(6);
			expect(stalls, `stall 발생 판: ${stalls.join(', ')}`).toEqual([]);
		} finally {
			restore();
		}
	}, 300_000);

	// (A) 발생 경로 두 개를 모두 고쳤다.
	//   - 부활이 호출하는 clearRandomCells가 셀을 비우며 메타를 안 지움
	//   - undo가 grid/currentBlocks만 되돌리고 cellMeta는 그대로 둠 (주범)
	// 수정 전 120판 중 3판에서 15건 관측 → 수정 후 120판 0건.
	it('유령 셀(grid 0 + 채워짐 마커)이 생기지 않는다', async () => {
		const restore = clampTimers();
		try {
			const { ghosts } = await runMany(6);
			expect(ghosts, `유령 셀 관측:\n${ghosts.join('\n')}`).toEqual([]);
		} finally {
			restore();
		}
	}, 300_000);
});

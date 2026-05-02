/**
 * 블록블라스터 특수능력 모드 — 위험 시스템 (1단계)
 *
 * 위험 종류는 점진적으로 추가됨. 1단계에서는 doom-row / doom-col만 구현.
 * 2단계: hazard-zone, reinforced
 * 3단계: spreading + 트레이 잠금 추가 잠금 정책
 */

import { GRID_SIZE, type BoardGrid, type Danger, type DangerStage, type DangerType } from './types';

let nextId = 1;
function generateId(prefix: string): string {
	return `${prefix}-${Date.now()}-${nextId++}`;
}

/**
 * 위험 스테이지에 등장할 위험 개수 — 큰 막 기준
 * 기 (1~2): 1개
 * 승 (3~5): 2개
 * 전 (6~8): 2~3개
 * 결 (9~10): 3개
 */
export function dangerCountForStage(stage: number): number {
	if (stage <= 2) return 1;
	if (stage <= 5) return 2;
	if (stage <= 8) return 2 + (Math.random() < 0.5 ? 1 : 0); // 50% 확률로 3
	return 3;
}

/**
 * 위험 스테이지 카운트다운 — 큰 막 기준 (해당 위험에 주어지는 턴 수)
 * 기: 6~7턴 / 승: 5~6턴 / 전: 4~5턴 / 결: 3~4턴
 */
export function countdownForStage(stage: number): number {
	if (stage <= 2) return 6 + Math.floor(Math.random() * 2); // 6~7
	if (stage <= 5) return 5 + Math.floor(Math.random() * 2); // 5~6
	if (stage <= 8) return 4 + Math.floor(Math.random() * 2); // 4~5
	return 3 + Math.floor(Math.random() * 2); // 3~4
}

/**
 * 트레이 잠금 슬롯 수
 * 기 (1~2): 0
 * 승 (3~5): 1
 * 전 (6~8): 1~2
 * 결 (9~10): 2
 */
export function lockedSlotsForStage(stage: number): number {
	if (stage <= 2) return 0;
	if (stage <= 5) return 1;
	if (stage <= 8) return 1 + (Math.random() < 0.5 ? 1 : 0);
	return 2;
}

/**
 * 1단계 — doom-row / doom-col 위험만 생성.
 * 2단계 이후 다른 type으로 확장 시 여기에 분기 추가.
 *
 * 보드 상태(grid)를 보고 가능하면 "이미 채워진 줄"을 우선 위험으로 지정.
 * 빈 줄도 위험이 될 수 있으나 채워진 줄이 더 긴장감 있음.
 */
export function generateDangerStage(stageNumber: number, grid: BoardGrid): DangerStage {
	const dangerCount = dangerCountForStage(stageNumber);
	const dangers: Danger[] = [];
	const usedRows = new Set<number>();
	const usedCols = new Set<number>();

	for (let i = 0; i < dangerCount; i++) {
		// 1단계는 doom-row/col만 — 50% 확률로 결정
		const type: DangerType = Math.random() < 0.5 ? 'doom-row' : 'doom-col';

		if (type === 'doom-row') {
			const row = pickAvailableLine(usedRows, GRID_SIZE);
			if (row === null) continue;
			usedRows.add(row);
			const cells: [number, number][] = [];
			for (let c = 0; c < GRID_SIZE; c++) cells.push([row, c]);
			const cd = countdownForStage(stageNumber);
			dangers.push({
				id: generateId('doom-row'),
				type: 'doom-row',
				cells,
				countdown: cd,
				initialCountdown: cd,
				resolved: false
			});
		} else {
			const col = pickAvailableLine(usedCols, GRID_SIZE);
			if (col === null) continue;
			usedCols.add(col);
			const cells: [number, number][] = [];
			for (let r = 0; r < GRID_SIZE; r++) cells.push([r, col]);
			const cd = countdownForStage(stageNumber);
			dangers.push({
				id: generateId('doom-col'),
				type: 'doom-col',
				cells,
				countdown: cd,
				initialCountdown: cd,
				resolved: false
			});
		}
	}

	return {
		stageNumber,
		dangers,
		lockedTraySlots: lockedSlotsForStage(stageNumber)
	};
}

function pickAvailableLine(used: Set<number>, max: number): number | null {
	const available: number[] = [];
	for (let i = 0; i < max; i++) {
		if (!used.has(i)) available.push(i);
	}
	if (available.length === 0) return null;
	return available[Math.floor(Math.random() * available.length)];
}

/**
 * 위험이 해결되었는지 판정.
 * doom-row/col: 해당 줄/열의 모든 셀이 비어있으면 해결.
 * (라인 클리어로 비워지면 자연 해결됨)
 */
export function isDangerResolved(danger: Danger, grid: BoardGrid): boolean {
	if (danger.resolved) return true;
	switch (danger.type) {
		case 'doom-row':
		case 'doom-col': {
			for (const [r, c] of danger.cells) {
				if (grid[r][c] !== 0) return false;
			}
			return true;
		}
		default:
			return false;
	}
}

/**
 * doom-row / doom-col이 카운트 0에 도달했는데 해결 못 한 경우 게임오버.
 */
export function isDoomTriggered(danger: Danger, grid: BoardGrid): boolean {
	if (danger.resolved) return false;
	if (danger.countdown > 0) return false;
	if (danger.type !== 'doom-row' && danger.type !== 'doom-col') return false;
	// 카운트 0이고 해결 안 됨 → 그 줄에 블록 1개라도 있으면 게임오버
	for (const [r, c] of danger.cells) {
		if (grid[r][c] !== 0) return true;
	}
	return false;
}

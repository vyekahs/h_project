import { GRID_SIZE, type BoardGrid, type CellColor, COLOR_COUNT } from './types';
import { cloneGrid } from './gameLogic';
import { hazardCellCount } from './abilities';

/**
 * 매 턴 보드에 무작위 셀을 추가하여 난이도를 올림.
 * - 라인을 완성시키지 않는 위치에만 추가 (기존 블록이 사라지지 않도록).
 * - 자리가 부족하면 가능한 만큼만 채움.
 * - 추가된 셀 좌표 목록을 함께 반환 → 페이드인 애니메이션용.
 */
export function applyStageHazard(
	grid: BoardGrid,
	stage: number
): { grid: BoardGrid; addedCells: [number, number][] } {
	const target = hazardCellCount(stage);

	const empty: [number, number][] = [];
	for (let r = 0; r < GRID_SIZE; r++) {
		for (let c = 0; c < GRID_SIZE; c++) {
			if (grid[r][c] === 0) empty.push([r, c]);
		}
	}

	// 무작위 순서로 시도
	for (let i = empty.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[empty[i], empty[j]] = [empty[j], empty[i]];
	}

	const newGrid = cloneGrid(grid);
	const addedCells: [number, number][] = [];

	// 행/열별 빈 셀 카운트 (newGrid 기준 — 추가될 때마다 감소)
	const emptyInRow = new Array(GRID_SIZE).fill(0);
	const emptyInCol = new Array(GRID_SIZE).fill(0);
	for (let r = 0; r < GRID_SIZE; r++) {
		for (let c = 0; c < GRID_SIZE; c++) {
			if (newGrid[r][c] === 0) {
				emptyInRow[r]++;
				emptyInCol[c]++;
			}
		}
	}

	for (const [r, c] of empty) {
		if (addedCells.length >= target) break;
		// 이 셀을 채우면 행이나 열이 완성되는지 확인
		// emptyInRow[r] === 1 이면 이 셀이 마지막 빈 자리 → 완성됨 → 스킵
		if (emptyInRow[r] <= 1 || emptyInCol[c] <= 1) continue;

		const color = (Math.floor(Math.random() * COLOR_COUNT) + 1) as CellColor;
		newGrid[r][c] = color;
		addedCells.push([r, c]);
		emptyInRow[r]--;
		emptyInCol[c]--;
	}

	return { grid: newGrid, addedCells };
}

export const GRID_SIZE = 8;
export const BLOCKS_PER_SET = 3;
export const COLOR_COUNT = 5;

/** 0 = empty, 1–5 = colored */
export type CellColor = 0 | 1 | 2 | 3 | 4 | 5;

export interface BlockShape {
	/** Relative [row, col] offsets from anchor (top-left of bounding box) */
	cells: [number, number][];
	color: CellColor;
}

/** 8×8 grid, grid[row][col] */
export type BoardGrid = CellColor[][];

// ===========================================================================
// 특수능력 모드 — 위험 시스템 타입
// ===========================================================================

/** 위험 종류 */
export type DangerType = 'doom-row' | 'doom-col' | 'hazard-zone' | 'reinforced' | 'spreading';

/** 활성 위험 한 건 */
export interface Danger {
	id: string;
	type: DangerType;
	/** 영향 받는 셀 좌표 — doom-row의 경우 줄 전체 셀, doom-col은 열 전체 */
	cells: [number, number][];
	/** 남은 카운트다운 턴 (블록 배치 단위) */
	countdown: number;
	/** 초기 카운트다운 (시각 변화 비율 계산용) */
	initialCountdown: number;
	/** 해결됨 마커 — 해결 직후 ticking에서 제외, UI 페이드아웃 처리용 */
	resolved: boolean;
}

/** 위험 스테이지 활성 상태 */
export interface DangerStage {
	stageNumber: number;
	dangers: Danger[];
	lockedTraySlots: number;
}


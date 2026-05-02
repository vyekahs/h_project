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
// 플러스 모드 — 위험 시스템 타입
// ===========================================================================

/** 위험 종류 */
export type DangerType = 'doom-row' | 'doom-col' | 'hazard-zone' | 'reinforced' | 'spreading';

/**
 * 셀별 메타데이터 — `BoardGrid`(색상 0~5)와 분리된 추가 정보.
 * 좌표 키 `"r,c"` 기반의 객체 맵으로 보관.
 */
export interface CellMeta {
	/** 위험 셀(petrified) — 라인 클리어 외에는 제거 불가 */
	petrified?: boolean;
	/** (legacy, 셀별 hp) 강화 블록 잔여 HP — 폴리오미노 모델에서는 Danger.hp 사용 */
	hp?: number;
	/** 강화 블록 가족 마커 — 어느 Danger 소속인지 추적해서 가족 공유 hp 갱신 */
	reinforcedDangerId?: string;
	/** 증식 블록 가족 마커 — 모든 셀이 동등한 근원으로 취급 */
	spreadOrigin?: boolean;
	/** 증식 블록 가족 마커 — 어느 Danger 소속인지 추적 */
	spreadingDangerId?: string;
}

export type CellMetaMap = Record<string, CellMeta>;

export function cellKey(r: number, c: number): string {
	return `${r},${c}`;
}

/** 활성 위험 한 건 */
export interface Danger {
	id: string;
	type: DangerType;
	/**
	 * 영향 받는 셀 좌표.
	 * - doom-row: 줄 전체 셀, doom-col: 열 전체
	 * - hazard-zone: 3×3 영역
	 * - reinforced/spreading: 가족 폴리오미노 (2~3셀, 첫 셀이 시작점이지만 동등 처리)
	 */
	cells: [number, number][];
	/** 남은 카운트다운 턴 (블록 배치 단위) */
	countdown: number;
	/** 초기 카운트다운 (시각 변화 비율 계산용) */
	initialCountdown: number;
	/** 해결됨 마커 — 해결 직후 ticking에서 제외, UI 페이드아웃 처리용 */
	resolved: boolean;
	/**
	 * 등장 지연 턴 수 (단계별 위험 등장용).
	 * 0이면 활성(보드에 표시·카운트다운 진행), >0이면 대기 중(매 턴 -1).
	 * 0이 되는 순간 활성화되며 reinforced/spreading은 그때 보드에 셀 배치.
	 */
	delayTurns: number;
	/** reinforced 전용 — 가족 공유 잔여 HP. 라인 클리어로 가족 셀 영향받으면 -1, 0 도달 시 가족 전체 제거 */
	hp?: number;
}

/** 위험 스테이지 활성 상태 */
export interface DangerStage {
	stageNumber: number;
	dangers: Danger[];
	lockedTraySlots: number;
}


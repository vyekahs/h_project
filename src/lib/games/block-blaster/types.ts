export const GRID_SIZE = 8;
export const BLOCKS_PER_SET = 3;
export const COLOR_COUNT = 5;

/** 0 = empty, 1–5 = colored */
export type CellColor = 0 | 1 | 2 | 3 | 4 | 5;

export interface BlockShape {
	/** Relative [row, col] offsets from anchor (top-left of bounding box) */
	cells: [number, number][];
	color: CellColor;
	/**
	 * JAM(고장) 위험이 트레이에 밀어넣은 불량 블록 표식 — 해당 Danger의 id.
	 * 이 블록이 트레이에서 사라지면(놓았거나 교체·변형했거나) 그 위험이 해결된다.
	 * 보드 압박(빈 칸)과 별개의 두 번째 압박 축을 만들기 위한 장치.
	 */
	jamId?: string;
}

/** 8×8 grid, grid[row][col] */
export type BoardGrid = CellColor[][];

// ===========================================================================
// 플러스 모드 — 위험 시스템 타입
// ===========================================================================

/** 위험 종류 */
export type DangerType = 'doom-row' | 'doom-col' | 'hazard-zone' | 'reinforced' | 'spreading' | 'storm' | 'portal' | 'rust' | 'chaser' | 'quest' | 'jam';

/** QUEST 패턴 종류 — 사용자가 카운트 동안 한 번 달성하면 위험 해결 */
export type QuestPatternType = 'combo' | 'same-color-line' | 'cross';

/**
 * 셀별 메타데이터 — `BoardGrid`(색상 0~5)와 분리된 추가 정보.
 * 좌표 키 `"r,c"` 기반의 객체 맵으로 보관.
 */
export interface CellMeta {
	/** 위험 셀(petrified) — 라인 클리어 외에는 제거 불가 */
	petrified?: boolean;
	/** 강화 셀의 잔여 HP — 셀별 독립. 라인 클리어 영향 시 -1, 0이면 셀 비워짐 */
	hp?: number;
	/** 강화 블록 가족 마커 — isDangerResolved에서 가족 단위 판정용 */
	reinforcedDangerId?: string;
	/** 증식 블록 가족 마커 — 모든 셀이 동등한 근원으로 취급 */
	spreadOrigin?: boolean;
	/** 증식 블록 가족 마커 — 어느 Danger 소속인지 추적 */
	spreadingDangerId?: string;
	/** STORM 중심 셀 마커 — 라인 클리어로 비워지면 위험 해결 */
	stormOrigin?: boolean;
	/** STORM 위험 ID (셀 → 위험 매핑) */
	stormDangerId?: string;
	/** PORTAL 마커 — 사용자 블록 배치 시 짝꿍 포털에 같은 색 1셀 자동 추가 */
	portalMark?: boolean;
	/** PORTAL 위험 ID (셀 → 위험 매핑) */
	portalDangerId?: string;
	/** RUST 부식 셀 마커 — 라인 클리어에 포함되면 그 라인 점수 -50% */
	rustMark?: boolean;
	/** RUST 위험 ID (셀 → 위험 매핑) */
	rustDangerId?: string;
	/** CHASER 추적 폭탄 마커 — 매 턴 인접 셀로 이동, 카운트 0 도달 시 3x3 폭발 */
	chaserMark?: boolean;
	/** CHASER 위험 ID (셀 → 위험 매핑) */
	chaserDangerId?: string;
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
	/** 종료됨 마커 — 종료 직후 ticking에서 제외, UI 페이드아웃 처리용 */
	resolved: boolean;
	/**
	 * 종료가 "플레이어의 해결"이 아니라 "카운트 만료"였는지.
	 *
	 * 이 구분이 없던 시절에는 만료도 스테이지 클리어 크레딧을 그대로 줬다.
	 * 그래서 카운트다운을 쓰는 6종(hazard-zone/storm/portal/rust/chaser/quest)은
	 * 실패 경로 자체가 없었고, 방치하는 것이 언제나 최적이라 위험 시스템이
	 * 사실상 진행 티켓으로만 동작했다(시뮬레이션 해결률 87~97%의 정체).
	 * 만료 시 페널티(석화·폭발 등)는 그대로 두되 크레딧은 주지 않는다.
	 */
	expired?: boolean;
	/**
	 * 등장 지연 턴 수 (단계별 위험 등장용).
	 * 0이면 활성(보드에 표시·카운트다운 진행), >0이면 대기 중(매 턴 -1).
	 * 0이 되는 순간 활성화되며 reinforced/spreading은 그때 보드에 셀 배치.
	 */
	delayTurns: number;
	/** CHASER 전용 — 폭발 목표 셀 좌표 (활성화 시 결정, 매 턴 이동으로 접근) */
	chaserTarget?: [number, number];
	/** QUEST 전용 — 달성해야 할 패턴 (활성화 시 1개 무작위 부여) */
	questPattern?: QuestPatternType;
	/** QUEST 전용 — 콤보 패턴의 목표 콤보 수 (예: 3) */
	questThreshold?: number;
}

/** 위험 스테이지 활성 상태 */
export interface DangerStage {
	stageNumber: number;
	dangers: Danger[];
	/**
	 * 잠긴 슬롯 → 묶인 위험 ID 배열. 길이 = 잠긴 슬롯 수.
	 * 위험 합류 시 같이 나온 위험 N개의 ID가 잠금에 매칭됨.
	 * 매칭된 위험을 해결할 때 해당 ID가 배열에서 제거되며 슬롯이 풀림.
	 */
	lockedSlotDangerIds: string[];
}


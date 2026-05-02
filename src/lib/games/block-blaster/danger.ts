/**
 * 블록블라스터 플러스 모드 — 위험 시스템 (1단계)
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
 * 기: 6~7턴 / 승: 6~7턴 / 전: 5~6턴 / 결: 4~5턴
 * (능력 사용 시에는 카운트 -1 안 함 — 능력은 위기 탈출 도구)
 */
export function countdownForStage(stage: number): number {
	if (stage <= 2) return 6 + Math.floor(Math.random() * 2); // 6~7
	if (stage <= 5) return 6 + Math.floor(Math.random() * 2); // 6~7
	if (stage <= 8) return 5 + Math.floor(Math.random() * 2); // 5~6
	return 4 + Math.floor(Math.random() * 2); // 4~5
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
 * 위험 스테이지 생성 — 사용 가능한 위험 종류 풀에서 뽑아 N개 구성.
 * 1단계: doom-row, doom-col
 * 2단계: + hazard-zone, reinforced
 * 3단계: + spreading
 */
function availableDangerTypes(stageNumber: number): DangerType[] {
	// 큰 막에 따라 점진 해금 — 게임오버를 일으키지 않는 위험부터 학습 후
	// 후반부에 doom-row/col로 진짜 게임오버 위협 등장.
	if (stageNumber <= 2) {
		// 1막(기): 보드 관리 학습 — reinforced + hazard-zone
		return ['reinforced', 'hazard-zone'];
	}
	if (stageNumber <= 5) {
		// 2막(승): + spreading (보드 복잡도 ↑)
		return ['reinforced', 'hazard-zone', 'spreading'];
	}
	if (stageNumber <= 8) {
		// 3막(전): + doom-row/col (진짜 게임오버 위협 등장)
		return ['reinforced', 'hazard-zone', 'spreading', 'doom-row', 'doom-col'];
	}
	// 4막(결): 전체
	return ['reinforced', 'hazard-zone', 'spreading', 'doom-row', 'doom-col'];
}

/**
 * 위험 등장 간격(턴 수) — 막별 차등.
 * 첫 위험은 즉시(0), 이후 위험은 이 간격만큼 대기 후 등장.
 * 기(1~2): 3턴 / 승(3~5): 2~3턴 / 전(6~8): 2턴 / 결(9~10): 1~2턴
 */
function dangerStaggerInterval(stageNumber: number): number {
	if (stageNumber <= 2) return 3;
	if (stageNumber <= 5) return 2 + Math.floor(Math.random() * 2); // 2~3
	if (stageNumber <= 8) return 2;
	return 1 + Math.floor(Math.random() * 2); // 1~2
}

export function generateDangerStage(stageNumber: number, grid: BoardGrid): DangerStage {
	const dangerCount = dangerCountForStage(stageNumber);
	const dangers: Danger[] = [];
	const usedRows = new Set<number>();
	const usedCols = new Set<number>();
	const usedZoneAnchors = new Set<string>(); // 영역 중복 방지
	const types = availableDangerTypes(stageNumber);

	for (let i = 0; i < dangerCount; i++) {
		const type: DangerType = types[Math.floor(Math.random() * types.length)];
		const danger = createDanger(type, stageNumber, grid, {
			usedRows,
			usedCols,
			usedZoneAnchors
		});
		if (!danger) continue;
		dangers.push(danger);
	}

	// 등장 순서 — 게임을 어렵게 하는 위험이 먼저, 게임오버를 일으키는 위험은 뒤로.
	// (난이도가 점진 상승하며 가장 위협적인 위험이 마지막에 등장하도록)
	const dangerOrderRank = (t: DangerType): number => {
		switch (t) {
			case 'reinforced': return 0;
			case 'spreading': return 1;
			case 'hazard-zone': return 2;
			case 'doom-row':
			case 'doom-col': return 3;
		}
	};
	dangers.sort((a, b) => dangerOrderRank(a.type) - dangerOrderRank(b.type));

	// 정렬된 순서대로 등장 간격 부여 — 첫 위험은 즉시, 이후는 누적 간격 후
	let cumulativeDelay = 0;
	for (let i = 0; i < dangers.length; i++) {
		if (i > 0) cumulativeDelay += dangerStaggerInterval(stageNumber);
		dangers[i].delayTurns = cumulativeDelay;
	}

	return {
		stageNumber,
		dangers,
		lockedTraySlots: lockedSlotsForStage(stageNumber)
	};
}

interface CreateDangerCtx {
	usedRows: Set<number>;
	usedCols: Set<number>;
	usedZoneAnchors: Set<string>;
}

function createDanger(
	type: DangerType,
	stageNumber: number,
	grid: BoardGrid,
	ctx: CreateDangerCtx
): Danger | null {
	const cd = countdownForStage(stageNumber);
	// 첫 위험(스테이지 1)의 doom-row/col은 트레이 운에 따라 무력하게 패배하는 일이
	// 없도록 카운트다운 +2턴 완화 (학습 단계 보호).
	const doomCd = stageNumber === 1 ? cd + 2 : cd;
	switch (type) {
		case 'doom-row': {
			// 블록이 1개 이상 있는 가로줄에서만 후보
			const row = pickFilledLine('row', grid, ctx.usedRows);
			if (row === null) return null;
			ctx.usedRows.add(row);
			const cells: [number, number][] = [];
			for (let c = 0; c < GRID_SIZE; c++) cells.push([row, c]);
			return {
				id: generateId('doom-row'),
				type: 'doom-row',
				cells,
				countdown: doomCd,
				initialCountdown: doomCd,
				resolved: false,
				delayTurns: 0
			};
		}
		case 'doom-col': {
			// 블록이 1개 이상 있는 세로열에서만 후보
			const col = pickFilledLine('col', grid, ctx.usedCols);
			if (col === null) return null;
			ctx.usedCols.add(col);
			const cells: [number, number][] = [];
			for (let r = 0; r < GRID_SIZE; r++) cells.push([r, col]);
			return {
				id: generateId('doom-col'),
				type: 'doom-col',
				cells,
				countdown: doomCd,
				initialCountdown: doomCd,
				resolved: false,
				delayTurns: 0
			};
		}
		case 'hazard-zone': {
			// 3×3 영역. 보드 안쪽으로만 (앵커 0~5)
			const anchorR = Math.floor(Math.random() * (GRID_SIZE - 2));
			const anchorC = Math.floor(Math.random() * (GRID_SIZE - 2));
			const key = `${anchorR},${anchorC}`;
			if (ctx.usedZoneAnchors.has(key)) return null;
			ctx.usedZoneAnchors.add(key);
			const cells: [number, number][] = [];
			for (let r = anchorR; r < anchorR + 3; r++) {
				for (let c = anchorC; c < anchorC + 3; c++) {
					cells.push([r, c]);
				}
			}
			return {
				id: generateId('zone'),
				type: 'hazard-zone',
				cells,
				countdown: cd,
				initialCountdown: cd,
				resolved: false,
				delayTurns: 0
			};
		}
		case 'reinforced': {
			// 2~3셀 폴리오미노 강화 블록. 가족 공유 hp.
			const cells = pickPolyomino(grid, 2 + Math.floor(Math.random() * 2));
			if (cells.length === 0) return null;
			const hp = stageNumber <= 5 ? 2 : 3;
			return {
				id: generateId('reinforced'),
				type: 'reinforced',
				cells,
				countdown: 999, // 카운트다운 의미 없음 (hp로 해결)
				initialCountdown: 999,
				resolved: false,
				delayTurns: 0,
				hp
			};
		}
		case 'spreading': {
			// 2~3셀 폴리오미노 증식 블록. 모든 셀이 동등한 근원.
			const cells = pickPolyomino(grid, 2 + Math.floor(Math.random() * 2));
			if (cells.length === 0) return null;
			// countdown은 활성화 주기. 0 도달 시 증식 후 다시 주기로 리셋
			const interval = stageNumber <= 7 ? 3 : 2;
			return {
				id: generateId('spreading'),
				type: 'spreading',
				cells,
				countdown: interval,
				initialCountdown: interval,
				resolved: false,
				delayTurns: 0
			};
		}
		default:
			return null;
	}
}

/**
 * 빈 셀 중 무작위 시작점을 잡고 BFS로 인접 빈 셀까지 확장해 폴리오미노(연결된 N셀) 생성.
 * 빈 셀이 부족하거나 시작점에서 확장 안 되면 가능한 만큼만 반환 (최소 1셀).
 * 빈 셀이 0개면 빈 배열 반환.
 */
function pickPolyomino(grid: BoardGrid, size: number): [number, number][] {
	const empty: [number, number][] = [];
	for (let r = 0; r < GRID_SIZE; r++) {
		for (let c = 0; c < GRID_SIZE; c++) {
			if (grid[r][c] === 0) empty.push([r, c]);
		}
	}
	if (empty.length === 0) return [];
	const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

	for (let attempt = 0; attempt < 8; attempt++) {
		const [sr, sc] = empty[Math.floor(Math.random() * empty.length)];
		const cluster: [number, number][] = [[sr, sc]];
		const used = new Set<string>([`${sr},${sc}`]);
		while (cluster.length < size) {
			const frontier: [number, number][] = [];
			for (const [r, c] of cluster) {
				for (const [dr, dc] of dirs) {
					const nr = r + dr;
					const nc = c + dc;
					if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
					if (grid[nr][nc] !== 0) continue;
					const key = `${nr},${nc}`;
					if (used.has(key)) continue;
					frontier.push([nr, nc]);
					used.add(key);
				}
			}
			if (frontier.length === 0) break;
			cluster.push(frontier[Math.floor(Math.random() * frontier.length)]);
		}
		if (cluster.length >= 2 || empty.length < 2) return cluster;
	}
	// 최후 폴백 — 1셀이라도
	return [empty[Math.floor(Math.random() * empty.length)]];
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
 * 보드에 블록이 1개 이상 있는 줄/열만 후보로 무작위 선택.
 * 후보가 없으면(보드가 비어있는 등) pickAvailableLine으로 폴백.
 */
function pickFilledLine(axis: 'row' | 'col', grid: BoardGrid, used: Set<number>): number | null {
	const filled: number[] = [];
	for (let i = 0; i < GRID_SIZE; i++) {
		if (used.has(i)) continue;
		let hasBlock = false;
		for (let j = 0; j < GRID_SIZE; j++) {
			const r = axis === 'row' ? i : j;
			const c = axis === 'row' ? j : i;
			if (grid[r][c] !== 0) {
				hasBlock = true;
				break;
			}
		}
		if (hasBlock) filled.push(i);
	}
	if (filled.length > 0) {
		return filled[Math.floor(Math.random() * filled.length)];
	}
	// 후보 없음 — 빈 줄에서라도 선택 (게임 시작 직후 보드가 비어있는 경우)
	return pickAvailableLine(used, GRID_SIZE);
}

/**
 * 위험이 해결되었는지 판정.
 * doom-row/col: 해당 줄/열의 모든 셀이 비어있으면 해결
 * hazard-zone: 영역의 모든 셀이 비어있으면 해결
 * reinforced: 강화 가족 셀이 모두 비어있으면 해결 (가족 hp 0 도달)
 * spreading: 가족 셀이 모두 비어있으면 해결 (cascade 없음, 라인 클리어로만 정리)
 */
export function isDangerResolved(danger: Danger, grid: BoardGrid): boolean {
	if (danger.resolved) return true;
	for (const [r, c] of danger.cells) {
		if (grid[r][c] !== 0) return false;
	}
	return true;
}

/** 위험 종류별 사용자 친화적 표시명 */
export function dangerLabel(type: DangerType): string {
	switch (type) {
		case 'doom-row':
			return '게임오버 줄';
		case 'doom-col':
			return '게임오버 열';
		case 'hazard-zone':
			return '위험 구역';
		case 'reinforced':
			return '강화 블록';
		case 'spreading':
			return '증식 블록';
	}
}

/** 위험 종류별 짧은 한 줄 설명 */
export function dangerDescription(type: DangerType): string {
	switch (type) {
		case 'doom-row':
			return '해당 가로줄을 라인 완성하세요. 실패 시 게임오버!';
		case 'doom-col':
			return '해당 세로열을 라인 완성하세요. 실패 시 게임오버!';
		case 'hazard-zone':
			return '카운트 종료 전에 영역의 셀을 모두 비우세요. 남은 셀은 위험 셀(검은 돌)로 변환됩니다.';
		case 'reinforced':
			return '회색 강화 블록 가족은 공유 HP를 가집니다. 라인 클리어로 가족 셀이 영향받을 때마다 HP -1, 0이 되면 가족 전체가 사라집니다.';
		case 'spreading':
			return '★ 표시된 증식 블록 가족은 주기마다 인접 빈 셀로 1칸씩 늘어납니다. 라인 클리어로 가족 셀을 모두 비워야 사라집니다.';
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

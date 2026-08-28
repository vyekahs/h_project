/**
 * 블록블라스터 플러스 모드 — 위험 시스템 (1단계)
 *
 * 위험 종류는 점진적으로 추가됨. 1단계에서는 doom-row / doom-col만 구현.
 * 2단계: hazard-zone, reinforced
 * 3단계: spreading + 트레이 잠금 추가 잠금 정책
 */

import { GRID_SIZE, type BoardGrid, type CellMetaMap, type Danger, type DangerStage, type DangerType, type QuestPatternType } from './types';

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
/**
 * 위험 종류별 출현 가중치 — WAVE와 무관하게 처음부터 5종 모두 등장.
 * 강도가 낮을수록 자주, 게임오버 위협(doom)이 가장 드물게.
 */
const DANGER_WEIGHTS: Record<DangerType, number> = {
	reinforced: 35,
	spreading: 25,
	'hazard-zone': 20,
	storm: 15,
	portal: 15,
	rust: 20,
	chaser: 15,
	quest: 15,
	'doom-row': 10,
	'doom-col': 10
};

/** 가중 무작위 — 한 가지 위험 종류 뽑기 */
function pickWeightedDangerType(): DangerType {
	const types = Object.keys(DANGER_WEIGHTS) as DangerType[];
	const total = types.reduce((sum, t) => sum + DANGER_WEIGHTS[t], 0);
	let roll = Math.random() * total;
	for (const t of types) {
		roll -= DANGER_WEIGHTS[t];
		if (roll <= 0) return t;
	}
	return types[types.length - 1];
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
	const usedCells = new Set<string>(); // 가족형 위험(reinforced/spreading/storm/portal)이 픽한 좌표

	for (let i = 0; i < dangerCount; i++) {
		const type: DangerType = pickWeightedDangerType();
		const danger = createDanger(type, stageNumber, grid, {
			usedRows,
			usedCols,
			usedZoneAnchors,
			usedCells
		});
		if (!danger) continue;
		// 활성화 시점에 좌표 충돌 방지 — 픽한 셀들을 누적 추적
		for (const [r, c] of danger.cells) usedCells.add(`${r},${c}`);
		dangers.push(danger);
	}

	// 등장 순서 — 게임을 어렵게 하는 위험이 먼저, 게임오버를 일으키는 위험은 뒤로.
	// (난이도가 점진 상승하며 가장 위협적인 위험이 마지막에 등장하도록)
	const dangerOrderRank = (t: DangerType): number => {
		switch (t) {
			case 'reinforced': return 0;
			case 'spreading':
			case 'portal':
			case 'rust':
			case 'quest': return 1;
			case 'hazard-zone':
			case 'storm':
			case 'chaser': return 2;
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

	// 잠금 슬롯 → 위험 ID 1:1 매칭. 함께 나온 위험들 중 등장 순서대로.
	// 잠금 수가 dangers 수보다 많으면 dangers 수만큼만(잠금이 dangers와 함께 풀리도록).
	const lockTarget = Math.min(lockedSlotsForStage(stageNumber), dangers.length);
	const lockedSlotDangerIds = dangers.slice(0, lockTarget).map(d => d.id);

	return {
		stageNumber,
		dangers,
		lockedSlotDangerIds
	};
}

interface CreateDangerCtx {
	usedRows: Set<number>;
	usedCols: Set<number>;
	usedZoneAnchors: Set<string>;
	/** 가족형 위험(reinforced/spreading/storm/portal)이 이미 픽한 좌표 — 다음 가족이 제외 */
	usedCells: Set<string>;
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
			// 2~3셀 폴리오미노 강화 블록. 셀별 독립 hp는 activateDangerOnBoard에서 부여.
			const cells = pickPolyomino(grid, 2 + Math.floor(Math.random() * 2), ctx.usedCells);
			if (cells.length === 0) return null;
			return {
				id: generateId('reinforced'),
				type: 'reinforced',
				cells,
				countdown: 999, // 카운트다운 의미 없음 (셀별 hp로 해결)
				initialCountdown: 999,
				resolved: false,
				delayTurns: 0
			};
		}
		case 'spreading': {
			// 2~3셀 폴리오미노 증식 블록. 모든 셀이 동등한 근원.
			const cells = pickPolyomino(grid, 2 + Math.floor(Math.random() * 2), ctx.usedCells);
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
		case 'storm': {
			// 폭풍 — 빈 셀 1개를 중심으로 선택 (☁ 마커). 카운트는 일반 위험과 동일.
			const empty: [number, number][] = [];
			for (let r = 0; r < GRID_SIZE; r++) {
				for (let c = 0; c < GRID_SIZE; c++) {
					if (grid[r][c] !== 0) continue;
					if (ctx.usedCells.has(`${r},${c}`)) continue;
					empty.push([r, c]);
				}
			}
			if (empty.length === 0) return null;
			const [r, c] = empty[Math.floor(Math.random() * empty.length)];
			return {
				id: generateId('storm'),
				type: 'storm',
				cells: [[r, c]],
				countdown: cd,
				initialCountdown: cd,
				resolved: false,
				delayTurns: 0
			};
		}
		case 'portal': {
			// 포털 — 빈 셀 2개를 짝지어 선택 (◎ 마커). 카운트는 일반 위험과 동일.
			const empty: [number, number][] = [];
			for (let r = 0; r < GRID_SIZE; r++) {
				for (let c = 0; c < GRID_SIZE; c++) {
					if (grid[r][c] !== 0) continue;
					if (ctx.usedCells.has(`${r},${c}`)) continue;
					empty.push([r, c]);
				}
			}
			if (empty.length < 2) return null;
			// 무작위 두 칸 선택 (서로 달라야 함)
			const i1 = Math.floor(Math.random() * empty.length);
			let i2 = Math.floor(Math.random() * (empty.length - 1));
			if (i2 >= i1) i2++;
			return {
				id: generateId('portal'),
				type: 'portal',
				cells: [empty[i1], empty[i2]],
				countdown: cd,
				initialCountdown: cd,
				resolved: false,
				delayTurns: 0
			};
		}
		case 'rust': {
			// 부식 — 빈 셀 1개에서 시작. 카운트는 "수명" — 0 도달 시 위험 종료(부식 셀 모두 사라짐).
			// 확산은 매 RUST_SPREAD_INTERVAL턴마다 (gameLogic에서 처리).
			const empty: [number, number][] = [];
			for (let r = 0; r < GRID_SIZE; r++) {
				for (let c = 0; c < GRID_SIZE; c++) {
					if (grid[r][c] !== 0) continue;
					if (ctx.usedCells.has(`${r},${c}`)) continue;
					empty.push([r, c]);
				}
			}
			if (empty.length === 0) return null;
			const [r, c] = empty[Math.floor(Math.random() * empty.length)];
			return {
				id: generateId('rust'),
				type: 'rust',
				cells: [[r, c]],
				countdown: cd,
				initialCountdown: cd,
				resolved: false,
				delayTurns: 0
			};
		}
		case 'quest': {
			// 도전 과제 — 보드 셀 점거 X, cells는 빈 배열. 카운트 동안 패턴 달성하면 해결.
			// 카운트는 일반 위험의 1.5배 (사용자 결정 — 시간 여유)
			const questCd = Math.floor(cd * 1.5);
			const patternPool: QuestPatternType[] = ['combo', 'same-color-line', 'cross'];
			const pattern = patternPool[Math.floor(Math.random() * patternPool.length)];
			// combo 임계값 — 스테이지 진행도에 따라 ≥3 (1~5) 또는 ≥4 (6~10)
			const threshold = pattern === 'combo' ? (stageNumber <= 5 ? 3 : 4) : 0;
			return {
				id: generateId('quest'),
				type: 'quest',
				cells: [],
				countdown: questCd,
				initialCountdown: questCd,
				resolved: false,
				delayTurns: 0,
				questPattern: pattern,
				questThreshold: threshold
			};
		}
		case 'chaser': {
			// 추적 폭탄 — 활성화 시 "목표 셀" 결정, 시작 위치는 목표에서 정확히 cd칸 떨어진 자리.
			// 매 턴 목표를 향해 1칸 이동하여 카운트 0 도달 시 목표에 도착해 폭발.
			// 목표는 폭발 효율(주변 채워진 일반 셀 수)이 가장 높은 빈 셀.
			const empty: [number, number][] = [];
			for (let r = 0; r < GRID_SIZE; r++) {
				for (let c = 0; c < GRID_SIZE; c++) {
					if (grid[r][c] !== 0) continue;
					if (ctx.usedCells.has(`${r},${c}`)) continue;
					empty.push([r, c]);
				}
			}
			if (empty.length < 2) return null; // 시작 + 목표 = 빈 셀 2개 이상 필요

			// 폭발 효율 = 후보 셀 중심 3x3에 채워진 셀 수
			const explosionScore = (r: number, c: number): number => {
				let n = 0;
				for (let dr = -1; dr <= 1; dr++) {
					for (let dc = -1; dc <= 1; dc++) {
						const nr = r + dr;
						const nc = c + dc;
						if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
						if (grid[nr][nc] !== 0) n++;
					}
				}
				return n;
			};

			// 목표 후보: 효율 가장 높은 빈 셀 (효율 동률 시 무작위)
			const scored = empty.map(([r, c]) => ({ pos: [r, c] as [number, number], s: explosionScore(r, c) }));
			const maxS = Math.max(...scored.map(x => x.s));
			const topTargets = scored.filter(x => x.s === maxS).map(x => x.pos);

			// 시작 위치 — 목표에서 맨해튼 거리 정확히 cd 칸 떨어진 빈 셀.
			// cd 거리 후보 없으면 cd-1, cd-2... 줄여가며 시도. 시작/목표는 다른 셀.
			let target: [number, number] | null = null;
			let start: [number, number] | null = null;
			let actualCd = cd;
			outer: for (let dist = cd; dist >= 1; dist--) {
				for (const t of topTargets) {
					const candidates = empty.filter(([r, c]) => {
						if (r === t[0] && c === t[1]) return false;
						return Math.abs(r - t[0]) + Math.abs(c - t[1]) === dist;
					});
					if (candidates.length > 0) {
						target = t;
						start = candidates[Math.floor(Math.random() * candidates.length)];
						actualCd = dist;
						break outer;
					}
				}
			}
			if (!target || !start) return null;

			return {
				id: generateId('chaser'),
				type: 'chaser',
				cells: [start],
				countdown: actualCd,
				initialCountdown: actualCd,
				resolved: false,
				delayTurns: 0,
				chaserTarget: target
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
 * @param excludeCells 이미 다른 가족이 픽한 좌표 — 후보에서 제외해 충돌 방지
 */
function pickPolyomino(grid: BoardGrid, size: number, excludeCells?: Set<string>): [number, number][] {
	const empty: [number, number][] = [];
	for (let r = 0; r < GRID_SIZE; r++) {
		for (let c = 0; c < GRID_SIZE; c++) {
			if (grid[r][c] !== 0) continue;
			if (excludeCells?.has(`${r},${c}`)) continue;
			empty.push([r, c]);
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
					const k = `${nr},${nc}`;
					if (excludeCells?.has(k)) continue;
					if (used.has(k)) continue;
					frontier.push([nr, nc]);
					used.add(k);
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
 * storm: 중심 셀이 비워지면 해결
 * portal: 두 셀의 portal 마커가 cellMeta에서 모두 사라지면 해결 (능력 등으로 마커 제거 시)
 */
export function isDangerResolved(danger: Danger, grid: BoardGrid, cellMeta?: CellMetaMap): boolean {
	if (danger.resolved) return true;
	if (danger.type === 'portal') {
		// portal은 빈 셀에 마커만 있는 형태 — grid가 0이라도 마커가 살아있으면 미해결
		if (!cellMeta) return false;
		for (const [r, c] of danger.cells) {
			if (cellMeta[`${r},${c}`]?.portalMark) return false;
		}
		return true;
	}
	if (danger.type === 'quest') {
		// quest는 cells가 빈 배열 — 패턴 달성 시 명시적으로 d.resolved=true 처리됨
		return false;
	}
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
		case 'storm':
			return '폭풍';
		case 'portal':
			return '포털';
		case 'rust':
			return '부식';
		case 'chaser':
			return '추적 폭탄';
		case 'quest':
			return '도전 과제';
	}
}

/** QUEST 패턴별 짧은 라벨 (헤더 표시용) */
export function questPatternLabel(p: QuestPatternType, threshold?: number): string {
	switch (p) {
		case 'combo':
			return `콤보 ${threshold ?? 3}+`;
		case 'same-color-line':
			return '같은 색 라인';
		case 'cross':
			return '가로+세로 동시';
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
			return '카운트 종료 전에 영역의 셀을 모두 비우세요. 남은 셀은 스킬이 통하지 않는 블록으로 변환됩니다.';
		case 'reinforced':
			return '회색 강화 블록은 HP 0이 되면 사라집니다.';
		case 'spreading':
			return '★ 표시된 증식 블록은 주기마다 인접 빈 셀로 1칸씩 늘어납니다.';
		case 'storm':
			return '☁ 폭풍 셀이 살아있는 동안 매 턴 보드에 검은 돌이 추가됩니다. ☁ 셀을 라인 클리어로 제거하거나 카운트가 끝날 때까지 견디세요.';
		case 'portal':
			return '◎ 포털 두 칸. 한쪽에 블록을 놓으면 다른 쪽 위치에 같은 색 셀이 자동 추가되고 두 포털이 새 빈 칸으로 이동합니다. 카운트가 끝나면 사라집니다.';
		case 'rust':
			return '⚠ 부식 셀이 주기마다 인접 빈 칸으로 확산됩니다. 부식 셀이 라인 클리어에 포함되면 그 라인 점수가 절반으로 줄어듭니다. 부식 가족을 모두 라인 클리어로 비우거나 카운트 종료까지 견디세요.';
		case 'chaser':
			return '⚡ 추적 폭탄이 매 턴 가장 많은 셀을 폭파시킬 수 있는 인접 칸으로 이동합니다. 카운트가 끝나면 3×3 영역의 모든 셀이 검은 돌로 변환됩니다.';
		case 'quest':
			return '🎯 도전 과제 — 카운트 안에 특정 패턴을 달성하면 해결. 능력 사용은 카운트되지 않고 사용자 블록 배치로 만든 라인 클리어만 인정됩니다. 실패해도 게임오버는 아닙니다.';
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

import {
	Direction,
	type Cell,
	type TrackType,
	type Difficulty,
	DIFFICULTY_CONFIG,
	getOpenDirections,
	oppositeDirection
} from './types';

function shuffle<T>(arr: T[]): T[] {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

// Get direction from cell A to cell B (adjacent cells)
function getDirection(fromRow: number, fromCol: number, toRow: number, toCol: number): Direction {
	if (toRow < fromRow) return Direction.TOP;
	if (toRow > fromRow) return Direction.BOTTOM;
	if (toCol > fromCol) return Direction.RIGHT;
	return Direction.LEFT;
}

// Determine track type from two connection directions
function determineTrackType(dir1: Direction, dir2: Direction): TrackType {
	if (Math.abs(dir1 - dir2) === 2) return 'straight';
	return 'corner';
}

// Find rotation for a track type that matches required directions
function findRotation(type: TrackType, requiredDirs: Direction[]): number {
	for (let rot = 0; rot < 4; rot++) {
		const open = getOpenDirections(type, rot);
		if (open.length === requiredDirs.length && requiredDirs.every((d) => open.includes(d))) {
			return rot;
		}
	}
	return 0;
}

// Check if placing a path cell at (r,c) would create a 2x2 block
function wouldCreate2x2(visited: boolean[][], r: number, c: number, size: number): boolean {
	const offsets = [
		[-1, -1],
		[-1, 0],
		[0, -1],
		[0, 0]
	];
	// Check all four 2x2 squares that include (r,c)
	for (const [dr, dc] of offsets) {
		const tr = r + dr;
		const tc = c + dc;
		if (tr < 0 || tc < 0 || tr + 1 >= size || tc + 1 >= size) continue;
		let count = 0;
		for (let rr = tr; rr <= tr + 1; rr++) {
			for (let cc = tc; cc <= tc + 1; cc++) {
				if ((rr === r && cc === c) || visited[rr][cc]) count++;
			}
		}
		if (count === 4) return true;
	}
	return false;
}

// Pick a random edge cell
function pickEdgeCell(
	size: number,
	exclude?: { row: number; col: number }
): { row: number; col: number; inwardDir: Direction } {
	const edges: { row: number; col: number; inwardDir: Direction }[] = [];

	for (let i = 0; i < size; i++) {
		edges.push({ row: 0, col: i, inwardDir: Direction.BOTTOM }); // top edge
		edges.push({ row: size - 1, col: i, inwardDir: Direction.TOP }); // bottom edge
		edges.push({ row: i, col: 0, inwardDir: Direction.RIGHT }); // left edge
		edges.push({ row: i, col: size - 1, inwardDir: Direction.LEFT }); // right edge
	}

	// Remove corners (they're on two edges, already added twice) - deduplicate
	const unique = edges.filter(
		(e, i, arr) => arr.findIndex((x) => x.row === e.row && x.col === e.col) === i
	);

	if (exclude) {
		const filtered = unique.filter(
			(e) =>
				Math.abs(e.row - exclude.row) + Math.abs(e.col - exclude.col) >= Math.floor(size * 0.8)
		);
		if (filtered.length > 0) {
			return filtered[Math.floor(Math.random() * filtered.length)];
		}
	}

	return unique[Math.floor(Math.random() * unique.length)];
}

// Count corners in a path (direction changes)
function countCorners(path: [number, number][]): number {
	let corners = 0;
	for (let i = 1; i < path.length - 1; i++) {
		const prevDir = getDirection(path[i][0], path[i][1], path[i - 1][0], path[i - 1][1]);
		const nextDir = getDirection(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]);
		if (Math.abs(prevDir - nextDir) !== 2) corners++;
	}
	return corners;
}

type PathResult = { path: [number, number][]; start: { row: number; col: number }; finish: { row: number; col: number } };

// Generate path from start to finish using backtracking DFS
function generatePath(
	size: number,
	minPathRatio: number,
	minCornerRatio: number
): PathResult | null {
	const startCell = pickEdgeCell(size);
	const finishCell = pickEdgeCell(size, startCell);

	const visited: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
	const path: [number, number][] = [[startCell.row, startCell.col]];
	visited[startCell.row][startCell.col] = true;

	const minLength = Math.floor(size * minPathRatio);
	const maxAttempts = 5000;
	let attempts = 0;

	function dfs(): boolean {
		attempts++;
		if (attempts > maxAttempts) return false;

		const [cr, cc] = path[path.length - 1];

		// Check if we can reach finish
		if (cr === finishCell.row && cc === finishCell.col && path.length >= minLength) {
			// Check minimum corner ratio (middle cells = path.length - 2)
			if (minCornerRatio > 0) {
				const middleCells = path.length - 2;
				const corners = countCorners(path);
				if (middleCells > 0 && corners / middleCells < minCornerRatio) {
					return false;
				}
			}
			return true;
		}

		// Get neighbors in random order
		const neighbors: [number, number][] = shuffle([
			[cr - 1, cc],
			[cr + 1, cc],
			[cr, cc - 1],
			[cr, cc + 1]
		] as [number, number][]);

		for (const [nr, nc] of neighbors) {
			if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
			if (visited[nr][nc]) continue;
			if (wouldCreate2x2(visited, nr, nc, size)) continue;

			// Don't reach finish too early
			if (nr === finishCell.row && nc === finishCell.col && path.length < minLength - 1) {
				continue;
			}

			visited[nr][nc] = true;
			path.push([nr, nc]);

			if (dfs()) return true;

			path.pop();
			visited[nr][nc] = false;
		}

		return false;
	}

	if (dfs()) {
		return {
			path,
			start: startCell,
			finish: finishCell
		};
	}
	return null;
}

// Convert path to grid of cells
function pathToGrid(
	pathData: PathResult,
	size: number
): Cell[][] {
	const { path } = pathData;
	const grid: Cell[][] = Array.from({ length: size }, (_, r) =>
		Array.from({ length: size }, (_, c) => ({
			row: r,
			col: c,
			trackType: 'empty' as TrackType,
			rotation: 0,
			isFixed: false,
			isStart: false,
			isFinish: false,
			playerMarkedEmpty: false
		}))
	);

	for (let i = 0; i < path.length; i++) {
		const [r, c] = path[i];
		const cell = grid[r][c];

		if (i === 0) {
			// START cell
			cell.isStart = true;
			const nextDir = getDirection(r, c, path[1][0], path[1][1]);
			cell.trackType = 'start';
			cell.rotation = findRotation('start', [nextDir]);
		} else if (i === path.length - 1) {
			// FINISH cell
			cell.isFinish = true;
			const prevDir = getDirection(r, c, path[i - 1][0], path[i - 1][1]);
			cell.trackType = 'finish';
			cell.rotation = findRotation('finish', [prevDir]);
		} else {
			// Middle cell
			const prevDir = getDirection(r, c, path[i - 1][0], path[i - 1][1]);
			const nextDir = getDirection(r, c, path[i + 1][0], path[i + 1][1]);
			const type = determineTrackType(prevDir, nextDir);
			cell.trackType = type;
			cell.rotation = findRotation(type, [prevDir, nextDir]);
		}
	}

	return grid;
}

export interface TrainTracksLevel {
	grid: Cell[][];
	solution: Cell[][];
	rowCounts: number[];
	colCounts: number[];
	pathLength: number;
}

// Spread clues along the path: higher spread = more evenly distributed
function selectSpreadClues(
	pathCells: { r: number; c: number; pathIdx: number }[],
	count: number,
	spread: number
): { r: number; c: number }[] {
	if (count >= pathCells.length || spread <= 0) {
		// No spread: just take first N (already shuffled externally)
		return pathCells.slice(0, count);
	}

	// Spread selection: pick cells evenly spaced along path index
	const sorted = [...pathCells].sort((a, b) => a.pathIdx - b.pathIdx);
	const selected: { r: number; c: number }[] = [];

	// Use spread to interpolate between random and evenly-spaced
	const step = sorted.length / count;
	for (let i = 0; i < count && i < sorted.length; i++) {
		// Evenly-spaced target index
		const evenIdx = Math.min(Math.floor(i * step), sorted.length - 1);
		// Random index
		const randIdx = i;
		// Interpolate
		const finalIdx = Math.round(evenIdx * spread + randIdx * (1 - spread));
		const clamped = Math.min(Math.max(0, finalIdx), sorted.length - 1);
		selected.push(sorted[clamped]);
	}

	return selected;
}

// ── Difficulty Scoring ──────────────────────────────────────────

// 행/열 카운트 균일성 (균일할수록 어려움, 0이나 max가 많으면 쉬움)
function computeRowColUniformity(rowCounts: number[], colCounts: number[], size: number): number {
	const allCounts = [...rowCounts, ...colCounts];
	const extremeCount = allCounts.filter((c) => c === 0 || c === size).length;
	const extremePenalty = extremeCount / allCounts.length;

	const mean = allCounts.reduce((a, b) => a + b, 0) / allCounts.length;
	if (mean === 0) return 0;
	const variance = allCounts.reduce((a, c) => a + (c - mean) ** 2, 0) / allCounts.length;
	const cv = Math.sqrt(variance) / mean;
	const uniformityScore = Math.max(0, 1 - cv);

	return uniformityScore * (1 - extremePenalty);
}

// 즉시 풀리는 행/열 비율 (낮을수록 어려움)
function computeTrivialLineRatio(
	grid: Cell[][],
	rowCounts: number[],
	colCounts: number[],
	size: number
): number {
	let trivialLines = 0;
	const totalLines = size * 2;

	for (let r = 0; r < size; r++) {
		const fixedTrackCount = grid[r].filter((c) => c.isFixed && c.trackType !== 'empty').length;
		if (rowCounts[r] === 0 || rowCounts[r] === size || fixedTrackCount === rowCounts[r]) {
			trivialLines++;
		} else if (rowCounts[r] - fixedTrackCount <= 1) {
			trivialLines += 0.5;
		}
	}

	for (let c = 0; c < size; c++) {
		let fixedTrackCount = 0;
		for (let r = 0; r < size; r++) {
			if (grid[r][c].isFixed && grid[r][c].trackType !== 'empty') fixedTrackCount++;
		}
		if (colCounts[c] === 0 || colCounts[c] === size || fixedTrackCount === colCounts[c]) {
			trivialLines++;
		} else if (colCounts[c] - fixedTrackCount <= 1) {
			trivialLines += 0.5;
		}
	}

	return 1 - trivialLines / totalLines;
}

// 커브가 그리드 전체에 분산되었는지 (분산=어려움)
function computeCornerDistribution(path: [number, number][], size: number): number {
	const cornerIndices: number[] = [];
	for (let i = 1; i < path.length - 1; i++) {
		const prevDir = getDirection(path[i][0], path[i][1], path[i - 1][0], path[i - 1][1]);
		const nextDir = getDirection(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]);
		if (Math.abs(prevDir - nextDir) !== 2) {
			cornerIndices.push(i);
		}
	}

	if (cornerIndices.length <= 1) return 0;

	// 사분면 분산
	const quadrantCounts = [0, 0, 0, 0];
	const half = size / 2;
	for (const idx of cornerIndices) {
		const [r, c] = path[idx];
		const qi = (r < half ? 0 : 2) + (c < half ? 0 : 1);
		quadrantCounts[qi]++;
	}
	const occupiedQuadrants = quadrantCounts.filter((q) => q > 0).length;
	const quadrantScore = (occupiedQuadrants - 1) / 3;

	// 경로 상 간격 균일성
	const gaps: number[] = [];
	for (let i = 1; i < cornerIndices.length; i++) {
		gaps.push(cornerIndices[i] - cornerIndices[i - 1]);
	}
	if (gaps.length > 0) {
		const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
		if (meanGap > 0) {
			const gapVariance = gaps.reduce((a, g) => a + (g - meanGap) ** 2, 0) / gaps.length;
			const gapCV = Math.sqrt(gapVariance) / meanGap;
			const spacingScore = Math.max(0, 1 - gapCV);
			return (quadrantScore + spacingScore) / 2;
		}
	}

	return quadrantScore;
}

// 빈 셀 중 인접 단서만으로 결정 불가능한 비율 (높을수록 어려움)
function computeAmbiguityScore(
	solution: Cell[][],
	grid: Cell[][],
	size: number
): number {
	let ambiguousCells = 0;
	let totalEmptyCells = 0;

	const dirOffsets: { dr: number; dc: number; from: Direction }[] = [
		{ dr: -1, dc: 0, from: Direction.BOTTOM },
		{ dr: 1, dc: 0, from: Direction.TOP },
		{ dr: 0, dc: -1, from: Direction.RIGHT },
		{ dr: 0, dc: 1, from: Direction.LEFT }
	];

	for (let r = 0; r < size; r++) {
		for (let c = 0; c < size; c++) {
			if (grid[r][c].isFixed || solution[r][c].trackType === 'empty') continue;

			totalEmptyCells++;

			let constrainedDirections = 0;
			for (const { dr, dc, from } of dirOffsets) {
				const nr = r + dr;
				const nc = c + dc;
				if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
				const neighbor = grid[nr][nc];
				if (neighbor.isFixed && neighbor.trackType !== 'empty') {
					const openDirs = getOpenDirections(neighbor.trackType, neighbor.rotation);
					if (openDirs.includes(from)) {
						constrainedDirections++;
					}
				}
			}

			if (constrainedDirections < 2) {
				ambiguousCells++;
			}
		}
	}

	if (totalEmptyCells === 0) return 0;
	return ambiguousCells / totalEmptyCells;
}

// 퍼즐 난이도 종합 평가 (0.0~1.0)
function scorePuzzleDifficulty(
	solution: Cell[][],
	grid: Cell[][],
	rowCounts: number[],
	colCounts: number[],
	path: [number, number][]
): number {
	const size = solution.length;
	const rowColUniformity = computeRowColUniformity(rowCounts, colCounts, size);
	const trivialLineRatio = computeTrivialLineRatio(grid, rowCounts, colCounts, size);
	const cornerDistribution = computeCornerDistribution(path, size);
	const ambiguityScore = computeAmbiguityScore(solution, grid, size);

	return (
		rowColUniformity * 0.20 +
		trivialLineRatio * 0.25 +
		cornerDistribution * 0.20 +
		ambiguityScore * 0.35
	);
}

// ── Path Quality Scoring ────────────────────────────────────────

// 경로 품질 점수 (여러 후보 중 최적 선택용)
function scorePathShape(path: [number, number][], size: number): number {
	// 길이
	const lengthScore = Math.min(1, path.length / (size * size * 0.6));

	// 그리드 커버리지
	const rowsUsed = new Set(path.map(([r]) => r)).size;
	const colsUsed = new Set(path.map(([, c]) => c)).size;
	const coverageScore = (rowsUsed / size + colsUsed / size) / 2;

	// 행/열 카운트 균일성
	const rowCounts = new Array(size).fill(0);
	const colCounts = new Array(size).fill(0);
	for (const [r, c] of path) {
		rowCounts[r]++;
		colCounts[c]++;
	}
	const allCounts = [...rowCounts, ...colCounts].filter((c) => c > 0);
	const mean = allCounts.reduce((a, b) => a + b, 0) / allCounts.length;
	const cv =
		mean > 0
			? Math.sqrt(allCounts.reduce((a, c) => a + (c - mean) ** 2, 0) / allCounts.length) / mean
			: 0;
	const uniformityScore = Math.max(0, 1 - cv);

	// 커브 분산
	const cornerDist = computeCornerDistribution(path, size);

	return lengthScore * 0.2 + coverageScore * 0.3 + uniformityScore * 0.3 + cornerDist * 0.2;
}

// 여러 경로 후보 중 최적 경로 선택
function generateBestPath(
	size: number,
	minPathRatio: number,
	minCornerRatio: number,
	candidates: number
): PathResult | null {
	let bestPath: PathResult | null = null;
	let bestScore = -1;

	for (let i = 0; i < candidates; i++) {
		let result: PathResult | null = null;
		for (let attempt = 0; attempt < 50; attempt++) {
			result = generatePath(size, minPathRatio, minCornerRatio);
			if (result) break;
		}
		if (!result) continue;

		const pathScore = scorePathShape(result.path, size);
		if (pathScore > bestScore) {
			bestScore = pathScore;
			bestPath = result;
		}
	}

	return bestPath;
}

// ── Helpers ─────────────────────────────────────────────────────

function computeRowCounts(solution: Cell[][], size: number): number[] {
	const rowCounts: number[] = [];
	for (let r = 0; r < size; r++) {
		let count = 0;
		for (let c = 0; c < size; c++) {
			if (solution[r][c].trackType !== 'empty') count++;
		}
		rowCounts.push(count);
	}
	return rowCounts;
}

function computeColCounts(solution: Cell[][], size: number): number[] {
	const colCounts: number[] = Array(size).fill(0);
	for (let r = 0; r < size; r++) {
		for (let c = 0; c < size; c++) {
			if (solution[r][c].trackType !== 'empty') colCounts[c]++;
		}
	}
	return colCounts;
}

function selectClues(
	pathData: PathResult,
	solution: Cell[][],
	config: { cluePercentage: number; clueStraightOnly: boolean; clueSpread: number },
	minExtraClues: number
): Set<string> {
	const pathCells = pathData.path.map(([r, c], idx) => ({ r, c, pathIdx: idx }));
	const totalClues = Math.max(2 + minExtraClues, Math.floor(pathCells.length * config.cluePercentage));

	const clueSet = new Set<string>();
	clueSet.add(`${pathData.start.row},${pathData.start.col}`);
	clueSet.add(`${pathData.finish.row},${pathData.finish.col}`);

	const candidates = pathCells.filter(({ r, c }) => !clueSet.has(`${r},${c}`));
	let prioritized: { r: number; c: number; pathIdx: number }[];

	if (config.clueStraightOnly) {
		const straights = candidates.filter(({ r, c }) => solution[r][c].trackType === 'straight');
		const corners = candidates.filter(({ r, c }) => solution[r][c].trackType === 'corner');
		shuffle(straights);
		shuffle(corners);
		prioritized = [...straights, ...corners];
	} else {
		const corners = candidates.filter(({ r, c }) => solution[r][c].trackType === 'corner');
		const straights = candidates.filter(({ r, c }) => solution[r][c].trackType === 'straight');
		shuffle(corners);
		shuffle(straights);
		prioritized = [...corners, ...straights];
	}

	const neededClues = totalClues - clueSet.size;
	const spreadSelected = selectSpreadClues(prioritized, neededClues, config.clueSpread);
	for (const { r, c } of spreadSelected) {
		clueSet.add(`${r},${c}`);
	}

	return clueSet;
}

function buildPlayerGrid(solution: Cell[][], clueSet: Set<string>, size: number): Cell[][] {
	return Array.from({ length: size }, (_, r) =>
		Array.from({ length: size }, (_, c) => {
			const sol = solution[r][c];
			const isClue = clueSet.has(`${r},${c}`);

			if (isClue && sol.trackType !== 'empty') {
				return { ...sol, isFixed: true };
			}

			return {
				row: r,
				col: c,
				trackType: 'empty' as TrackType,
				rotation: 0,
				isFixed: false,
				isStart: false,
				isFinish: false,
				playerMarkedEmpty: false
			};
		})
	);
}

// ── Level Generation ────────────────────────────────────────────

export function generateLevel(difficulty: Difficulty): TrainTracksLevel {
	const config = DIFFICULTY_CONFIG[difficulty];
	const size = config.gridSize;

	// 난이도별 경로 후보 수 (높을수록 더 좋은 경로 선택)
	const candidateCount =
		difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : difficulty === 'hard' ? 3 : 5;

	// hard 이상은 START/FINISH 외 최소 1개 추가 단서 보장
	const minExtraClues = difficulty === 'easy' || difficulty === 'medium' ? 0 : 1;

	const maxLevelAttempts = 30;
	let lastResult: TrainTracksLevel | null = null;

	for (let levelAttempt = 0; levelAttempt < maxLevelAttempts; levelAttempt++) {
		const pathData = generateBestPath(size, config.minPathRatio, config.minCornerRatio, candidateCount);
		if (!pathData) continue;

		const solution = pathToGrid(pathData, size);
		const rowCounts = computeRowCounts(solution, size);
		const colCounts = computeColCounts(solution, size);
		const clueSet = selectClues(pathData, solution, config, minExtraClues);
		const grid = buildPlayerGrid(solution, clueSet, size);

		lastResult = { grid, solution, rowCounts, colCounts, pathLength: pathData.path.length };

		// 난이도 점수 검증
		if (config.minDifficultyScore <= 0) {
			return lastResult;
		}

		const score = scorePuzzleDifficulty(solution, grid, rowCounts, colCounts, pathData.path);
		if (score >= config.minDifficultyScore) {
			return lastResult;
		}
	}

	// 폴백: 재시도 초과 시 마지막 결과 반환
	if (lastResult) return lastResult;

	// 최후의 폴백
	const pathData = generateBestPath(size, config.minPathRatio, config.minCornerRatio, 1);
	if (!pathData) throw new Error('Failed to generate path after all attempts');

	const solution = pathToGrid(pathData, size);
	const rowCounts = computeRowCounts(solution, size);
	const colCounts = computeColCounts(solution, size);
	const clueSet = selectClues(pathData, solution, config, minExtraClues);
	const grid = buildPlayerGrid(solution, clueSet, size);

	return { grid, solution, rowCounts, colCounts, pathLength: pathData.path.length };
}

export function validateRowColCounts(
	grid: Cell[][],
	rowCounts: number[],
	colCounts: number[]
): { rowStatus: ('correct' | 'over' | 'under')[]; colStatus: ('correct' | 'over' | 'under')[] } {
	const size = grid.length;
	const rowStatus: ('correct' | 'over' | 'under')[] = [];
	const colStatus: ('correct' | 'over' | 'under')[] = [];

	for (let r = 0; r < size; r++) {
		let count = 0;
		for (let c = 0; c < size; c++) {
			if (grid[r][c].trackType !== 'empty') count++;
		}
		if (count === rowCounts[r]) rowStatus.push('correct');
		else if (count > rowCounts[r]) rowStatus.push('over');
		else rowStatus.push('under');
	}

	for (let c = 0; c < size; c++) {
		let count = 0;
		for (let r = 0; r < size; r++) {
			if (grid[r][c].trackType !== 'empty') count++;
		}
		if (count === colCounts[c]) colStatus.push('correct');
		else if (count > colCounts[c]) colStatus.push('over');
		else colStatus.push('under');
	}

	return { rowStatus, colStatus };
}

export function checkWin(
	grid: Cell[][],
	rowCounts: number[],
	colCounts: number[]
): boolean {
	const size = grid.length;

	// 1. Check row/col counts
	const { rowStatus, colStatus } = validateRowColCounts(grid, rowCounts, colCounts);
	if (rowStatus.some((s) => s !== 'correct') || colStatus.some((s) => s !== 'correct')) {
		return false;
	}

	// 2. Check path continuity from start to finish
	let startR = -1,
		startC = -1;
	let finishR = -1,
		finishC = -1;

	for (let r = 0; r < size; r++) {
		for (let c = 0; c < size; c++) {
			if (grid[r][c].isStart) {
				startR = r;
				startC = c;
			}
			if (grid[r][c].isFinish) {
				finishR = r;
				finishC = c;
			}
		}
	}

	if (startR === -1 || finishR === -1) return false;

	// BFS/walk from start following connections
	const visited = new Set<string>();
	let curR = startR,
		curC = startC;
	let prevR = -1,
		prevC = -1;

	while (true) {
		const key = `${curR},${curC}`;
		if (visited.has(key)) return false; // cycle
		visited.add(key);

		const cell = grid[curR][curC];
		if (cell.trackType === 'empty') return false;

		const dirs = getOpenDirections(cell.trackType, cell.rotation);
		let foundNext = false;

		for (const dir of dirs) {
			const dr = dir === Direction.TOP ? -1 : dir === Direction.BOTTOM ? 1 : 0;
			const dc = dir === Direction.LEFT ? -1 : dir === Direction.RIGHT ? 1 : 0;
			const nr = curR + dr;
			const nc = curC + dc;

			// Skip out of bounds
			if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;

			// Skip where we came from
			if (nr === prevR && nc === prevC) continue;

			// Check that neighbor connects back
			const neighbor = grid[nr][nc];
			if (neighbor.trackType === 'empty') continue;
			const neighborDirs = getOpenDirections(neighbor.trackType, neighbor.rotation);
			const opp = oppositeDirection(dir);
			if (!neighborDirs.includes(opp)) continue;

			prevR = curR;
			prevC = curC;
			curR = nr;
			curC = nc;
			foundNext = true;
			break;
		}

		if (!foundNext) {
			// Dead end - check if we're at finish
			if (curR === finishR && curC === finishC) break;
			return false;
		}

		// Reached finish
		if (curR === finishR && curC === finishC) {
			visited.add(`${curR},${curC}`);
			break;
		}
	}

	// Check all track cells are visited
	for (let r = 0; r < size; r++) {
		for (let c = 0; c < size; c++) {
			if (grid[r][c].trackType !== 'empty' && !visited.has(`${r},${c}`)) {
				return false;
			}
		}
	}

	return true;
}

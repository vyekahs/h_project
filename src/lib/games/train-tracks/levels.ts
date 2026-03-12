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

// Generate path from start to finish using backtracking DFS
function generatePath(
	size: number,
	minPathRatio: number,
	minCornerRatio: number
): { path: [number, number][]; start: { row: number; col: number }; finish: { row: number; col: number } } | null {
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
	pathData: { path: [number, number][]; start: { row: number; col: number }; finish: { row: number; col: number } },
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

	const pathSet = new Set(path.map(([r, c]) => `${r},${c}`));

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

export function generateLevel(difficulty: Difficulty): TrainTracksLevel {
	const config = DIFFICULTY_CONFIG[difficulty];
	const size = config.gridSize;

	// Try generating path up to 50 times
	let pathData: ReturnType<typeof generatePath> = null;
	for (let attempt = 0; attempt < 50; attempt++) {
		pathData = generatePath(size, config.minPathRatio, config.minCornerRatio);
		if (pathData) break;
	}

	if (!pathData) {
		throw new Error('Failed to generate path after 50 attempts');
	}

	// Build solution grid
	const solution = pathToGrid(pathData, size);

	// Compute row/column counts
	const rowCounts: number[] = [];
	const colCounts: number[] = Array(size).fill(0);

	for (let r = 0; r < size; r++) {
		let count = 0;
		for (let c = 0; c < size; c++) {
			if (solution[r][c].trackType !== 'empty') {
				count++;
				colCounts[c]++;
			}
		}
		rowCounts.push(count);
	}

	// Select clue cells
	const pathCells = pathData.path.map(([r, c], idx) => ({ r, c, pathIdx: idx }));
	const totalClues = Math.max(2, Math.floor(pathCells.length * config.cluePercentage));

	// Always include start and finish
	const clueSet = new Set<string>();
	clueSet.add(`${pathData.start.row},${pathData.start.col}`);
	clueSet.add(`${pathData.finish.row},${pathData.finish.col}`);

	// Filter candidates by clue type strategy
	const candidates = pathCells.filter(
		({ r, c }) => !clueSet.has(`${r},${c}`)
	);

	let prioritized: { r: number; c: number; pathIdx: number }[];

	if (config.clueStraightOnly) {
		// Hard+: 단서에 직선만 제공, 커브는 플레이어가 추론
		const straights = candidates.filter(({ r, c }) => solution[r][c].trackType === 'straight');
		const corners = candidates.filter(({ r, c }) => solution[r][c].trackType === 'corner');
		shuffle(straights);
		shuffle(corners);
		// 직선 우선, 부족하면 커브도 사용
		prioritized = [...straights, ...corners];
	} else {
		// Easy/Medium: 커브 우선 제공 (커브가 더 많은 정보를 줌)
		const corners = candidates.filter(({ r, c }) => solution[r][c].trackType === 'corner');
		const straights = candidates.filter(({ r, c }) => solution[r][c].trackType === 'straight');
		shuffle(corners);
		shuffle(straights);
		prioritized = [...corners, ...straights];
	}

	// Apply spread strategy for clue distribution
	const neededClues = totalClues - clueSet.size;
	const spreadSelected = selectSpreadClues(prioritized, neededClues, config.clueSpread);
	for (const { r, c } of spreadSelected) {
		clueSet.add(`${r},${c}`);
	}

	// Build player grid: clue cells are fixed, others are empty
	const grid: Cell[][] = Array.from({ length: size }, (_, r) =>
		Array.from({ length: size }, (_, c) => {
			const sol = solution[r][c];
			const isClue = clueSet.has(`${r},${c}`);

			if (isClue && sol.trackType !== 'empty') {
				return {
					...sol,
					isFixed: true
				};
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

	return {
		grid,
		solution,
		rowCounts,
		colCounts,
		pathLength: pathData.path.length
	};
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

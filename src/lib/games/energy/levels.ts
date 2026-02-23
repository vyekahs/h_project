import {
	Direction,
	type Tile,
	type TileType,
	type Difficulty,
	GRID_SIZES,
	getOpenDirections,
	getNeighborCoords,
	oppositeDirection
} from './types';

// Shuffle array in place (Fisher-Yates)
function shuffle<T>(arr: T[]): T[] {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

function setsEqual(a: Set<Direction>, b: Set<Direction>): boolean {
	if (a.size !== b.size) return false;
	for (const v of a) {
		if (!b.has(v)) return false;
	}
	return true;
}

// Determine tile type from its connection directions
function determineTileType(dirs: Set<Direction>): TileType {
	const count = dirs.size;
	if (count === 0) return 'empty';
	if (count === 1) return 'bulb';
	if (count === 4) return 'cross';
	if (count === 3) return 'tee';
	// count === 2: straight or corner
	const arr = [...dirs];
	// Check if opposite: TOP+BOTTOM or LEFT+RIGHT
	if (Math.abs(arr[0] - arr[1]) === 2) return 'straight';
	return 'corner';
}

// Find the rotation that makes base connections of a tile type match the required directions
function findRotation(type: TileType, requiredDirs: Set<Direction>): number {
	for (let rot = 0; rot < 4; rot++) {
		const open = new Set(getOpenDirections(type, rot));
		if (setsEqual(open, requiredDirs)) return rot;
	}
	return 0;
}

export interface EnergyLevel {
	tiles: Tile[][];
	optimalMoves: number;
}

export function generateLevel(size: number, _difficulty?: Difficulty): EnergyLevel {
	// 1. Initialize connection map
	const connections: Set<Direction>[][] = [];
	for (let r = 0; r < size; r++) {
		connections[r] = [];
		for (let c = 0; c < size; c++) {
			connections[r][c] = new Set();
		}
	}

	// 2. Place source near center with small random offset
	const center = Math.floor(size / 2);
	const offset = size >= 7 ? Math.floor(Math.random() * 3) - 1 : 0;
	const sourceRow = Math.max(1, Math.min(size - 2, center + offset));
	const sourceCol = Math.max(1, Math.min(size - 2, center + offset));

	// 3. Randomized DFS spanning tree from source
	const visited = new Set<string>();
	const key = (r: number, c: number) => `${r},${c}`;

	const stack: [number, number][] = [[sourceRow, sourceCol]];
	visited.add(key(sourceRow, sourceCol));

	const allDirs: Direction[] = [Direction.TOP, Direction.RIGHT, Direction.BOTTOM, Direction.LEFT];

	while (stack.length > 0) {
		const [r, c] = stack[stack.length - 1];

		// Find unvisited neighbors
		const neighbors: [number, number, Direction][] = [];
		for (const dir of allDirs) {
			const [nr, nc] = getNeighborCoords(r, c, dir);
			if (nr >= 0 && nr < size && nc >= 0 && nc < size && !visited.has(key(nr, nc))) {
				neighbors.push([nr, nc, dir]);
			}
		}

		if (neighbors.length === 0) {
			stack.pop();
			continue;
		}

		shuffle(neighbors);
		const [nr, nc, dir] = neighbors[0];
		visited.add(key(nr, nc));

		// Add bidirectional connections
		connections[r][c].add(dir);
		connections[nr][nc].add(oppositeDirection(dir));

		stack.push([nr, nc]);
	}

	// 4. Build tiles from connections
	const tiles: Tile[][] = [];
	let optimalMoves = 0;

	for (let r = 0; r < size; r++) {
		tiles[r] = [];
		for (let c = 0; c < size; c++) {
			const dirs = connections[r][c];
			const isSource = r === sourceRow && c === sourceCol;

			let type: TileType;
			if (isSource) {
				type = 'source';
			} else {
				type = determineTileType(dirs);
			}

			// Find the correct rotation for this tile
			const solutionRotation = findRotation(type, dirs);

			// Scramble: apply random rotation (1-3, never 0)
			let scramble = 0;
			const fixed = isSource;
			if (!fixed && type !== 'empty') {
				// For cross tiles (rotationally symmetric), no scramble needed
				if (type === 'cross') {
					scramble = 0;
				} else if (type === 'straight') {
					// Straight has 2 unique rotations (0=horizontal, 1=vertical)
					scramble = Math.random() < 0.5 ? 1 : 0;
					// Ensure not in solved position
					if (scramble === 0) scramble = 1;
				} else {
					scramble = Math.floor(Math.random() * 3) + 1; // 1, 2, or 3
				}
				const minRotations = Math.min(scramble, 4 - scramble);
				optimalMoves += minRotations;
			}

			const rotation = (solutionRotation + scramble) % 4;

			tiles[r][c] = {
				type,
				rotation,
				row: r,
				col: c,
				powered: false,
				fixed,
				solutionRotation
			};
		}
	}

	// Compute initial powered state
	computePoweredTiles(tiles);

	return { tiles, optimalMoves };
}

export function computePoweredTiles(tiles: Tile[][]): void {
	const rows = tiles.length;
	const cols = tiles[0].length;

	// Reset all powered states
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			tiles[r][c].powered = false;
		}
	}

	// BFS from source tiles
	const queue: [number, number][] = [];
	const visited = new Set<string>();

	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			if (tiles[r][c].type === 'source') {
				tiles[r][c].powered = true;
				queue.push([r, c]);
				visited.add(`${r},${c}`);
			}
		}
	}

	while (queue.length > 0) {
		const [r, c] = queue.shift()!;
		const tile = tiles[r][c];
		const openDirs = getOpenDirections(tile.type, tile.rotation);

		for (const dir of openDirs) {
			const [nr, nc] = getNeighborCoords(r, c, dir);
			if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;

			const nKey = `${nr},${nc}`;
			if (visited.has(nKey)) continue;

			const neighbor = tiles[nr][nc];
			if (neighbor.type === 'empty') continue;

			const neighborOpenDirs = getOpenDirections(neighbor.type, neighbor.rotation);
			const opposite = oppositeDirection(dir);

			if (neighborOpenDirs.includes(opposite)) {
				neighbor.powered = true;
				visited.add(nKey);
				queue.push([nr, nc]);
			}
		}
	}
}

export function checkWin(tiles: Tile[][]): boolean {
	for (const row of tiles) {
		for (const tile of row) {
			if (tile.type === 'bulb' && !tile.powered) return false;
		}
	}
	return true;
}

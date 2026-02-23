export enum Direction {
	TOP = 0,
	RIGHT = 1,
	BOTTOM = 2,
	LEFT = 3
}

export type TileType = 'source' | 'bulb' | 'straight' | 'corner' | 'tee' | 'cross' | 'empty';

export interface Tile {
	type: TileType;
	rotation: number; // 0-3 (clockwise 90deg increments)
	row: number;
	col: number;
	powered: boolean;
	fixed: boolean; // source tiles cannot be rotated
	solutionRotation: number;
}

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert' | 'master';

export const GRID_SIZES: Record<Difficulty, number> = {
	easy: 5,
	medium: 6,
	hard: 7,
	expert: 8,
	master: 9
};

// Base connections at rotation=0 for each tile type
export const TILE_CONNECTIONS: Record<Exclude<TileType, 'empty'>, Direction[]> = {
	source: [Direction.TOP, Direction.RIGHT, Direction.BOTTOM, Direction.LEFT],
	bulb: [Direction.BOTTOM],
	straight: [Direction.LEFT, Direction.RIGHT],
	corner: [Direction.TOP, Direction.RIGHT],
	tee: [Direction.TOP, Direction.RIGHT, Direction.BOTTOM],
	cross: [Direction.TOP, Direction.RIGHT, Direction.BOTTOM, Direction.LEFT]
};

export function getOpenDirections(type: TileType, rotation: number): Direction[] {
	if (type === 'empty') return [];
	const base = TILE_CONNECTIONS[type];
	return base.map((d) => ((d + rotation) % 4) as Direction);
}

export function getNeighborCoords(
	row: number,
	col: number,
	dir: Direction
): [number, number] {
	switch (dir) {
		case Direction.TOP:
			return [row - 1, col];
		case Direction.RIGHT:
			return [row, col + 1];
		case Direction.BOTTOM:
			return [row + 1, col];
		case Direction.LEFT:
			return [row, col - 1];
	}
}

export function oppositeDirection(dir: Direction): Direction {
	return ((dir + 2) % 4) as Direction;
}

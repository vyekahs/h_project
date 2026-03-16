export const GRID_SIZE = 4;

export interface Tile {
	id: number;
	value: number;
	row: number;
	col: number;
}

export interface Board {
	tiles: Tile[];
	score: number;
	nextId: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface MoveResult {
	board: Board;
	moved: boolean;
	mergeScore: number;
	spawnedTile: Tile | null;
}

// Background + text color per tile value
export const TILE_STYLES: Record<number, { bg: string; color: string }> = {
	2:    { bg: '#eee4da', color: '#776e65' },
	4:    { bg: '#ede0c8', color: '#776e65' },
	8:    { bg: '#f2b179', color: '#f9f6f2' },
	16:   { bg: '#f59563', color: '#f9f6f2' },
	32:   { bg: '#f67c5f', color: '#f9f6f2' },
	64:   { bg: '#f65e3b', color: '#f9f6f2' },
	128:  { bg: '#edcf72', color: '#f9f6f2' },
	256:  { bg: '#edcc61', color: '#f9f6f2' },
	512:  { bg: '#edc850', color: '#f9f6f2' },
	1024: { bg: '#edc53f', color: '#f9f6f2' },
	2048: { bg: '#edc22e', color: '#f9f6f2' },
	4096: { bg: '#3c3a32', color: '#f9f6f2' },
	8192: { bg: '#3c3a32', color: '#f9f6f2' },
};

export function getTileStyle(value: number): { bg: string; color: string } {
	return TILE_STYLES[value] ?? { bg: '#3c3a32', color: '#f9f6f2' };
}

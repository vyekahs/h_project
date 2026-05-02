export const BOARD_SIZE = 8;
export const TILE_COLORS = 6;
export const TIME_LIMIT = 90;

export enum TileType {
	NORMAL = 'normal',
	BOMB = 'bomb',
	RAINBOW = 'rainbow',
	BLAST = 'blast'
}

export interface Tile {
	color: number;
	type: TileType;
	id: number;
}

export type Board = (Tile | null)[][];

export interface MatchResult {
	matchedCells: Set<string>;
	specialTiles: { row: number; col: number; type: TileType; color: number }[];
	runs: { cells: [number, number][]; length: number }[];
}

export interface CascadeStep {
	matched: Set<string>;
	specials: { row: number; col: number; type: TileType; color: number }[];
	score: number;
}

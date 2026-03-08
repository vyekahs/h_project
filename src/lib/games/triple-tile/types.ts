export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert' | 'master';

export interface TilePosition {
	col: number;
	row: number;
	layer: number;
}

export interface Tile {
	id: number;
	typeId: number; // index into TILE_TYPES
	col: number;
	row: number;
	layer: number;
	removed: boolean;
}

export interface LayoutTemplate {
	name: string;
	positions: TilePosition[];
}

export interface DifficultyConfig {
	tileTypes: number; // number of unique tile types
	layers: number;
	shuffleUses: number;
	timeLimit: number; // base time limit in seconds (will be adjusted based on actual moves)
	stagingCapacity: number; // number of staging slots
	targetMoves: { min: number; max: number }; // target number of moves (clicks) for this difficulty
}

export const STAGING_CAPACITY = 7;

export const TILE_TYPES = [
	// Fruits (0-9)
	'🍎', '🍊', '🍋', '🍇', '🍓',
	'🍑', '🍒', '🫐', '🥝', '🍌',
	// Animals (10-19)
	'🐶', '🐱', '🐭', '🐹', '🐰',
	'🦊', '🐻', '🐼', '🐨', '🐯',
	// Plants (20-25)
	'🌸', '🌺', '🌻', '🌹', '🌷', '🍀',
	// Objects (26-33)
	'⭐', '🌙', '❤️', '💎', '🔔', '🎵', '🎀', '🎈',
] as const;

export const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
	easy: {
		tileTypes: 8,
		layers: 5,
		shuffleUses: 3,
		timeLimit: 120,
		stagingCapacity: 7,
		targetMoves: { min: 5, max: 8 }
	},
	medium: {
		tileTypes: 12,
		layers: 5,
		shuffleUses: 2,
		timeLimit: 180,
		stagingCapacity: 7,
		targetMoves: { min: 9, max: 12 }
	},
	hard: {
		tileTypes: 16,
		layers: 5,
		shuffleUses: 2,
		timeLimit: 300,
		stagingCapacity: 7,
		targetMoves: { min: 13, max: 16 }
	},
	expert: {
		tileTypes: 20,
		layers: 5,
		shuffleUses: 1,
		timeLimit: 480,
		stagingCapacity: 7,
		targetMoves: { min: 17, max: 20 }
	},
	master: {
		tileTypes: 26,
		layers: 5,
		shuffleUses: 1,
		timeLimit: 600,
		stagingCapacity: 7,
		targetMoves: { min: 22, max: 26 }
	},
};

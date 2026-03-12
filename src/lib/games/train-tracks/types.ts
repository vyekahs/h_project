export enum Direction {
	TOP = 0,
	RIGHT = 1,
	BOTTOM = 2,
	LEFT = 3
}

export type TrackType = 'empty' | 'straight' | 'corner' | 'start' | 'finish';

export interface Cell {
	row: number;
	col: number;
	trackType: TrackType;
	rotation: number; // 0-3 (clockwise 90deg increments)
	isFixed: boolean;
	isStart: boolean;
	isFinish: boolean;
	playerMarkedEmpty: boolean;
}

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert' | 'master';

export interface TrainTracksDifficultyConfig {
	gridSize: number;
	cluePercentage: number;
	minPathRatio: number;       // 경로 최소 길이 비율 (gridSize * ratio)
	minCornerRatio: number;     // 커브 최소 비율 (0~1, 경로 중간 셀 대비)
	clueStraightOnly: boolean;  // true면 단서에 직선만 제공 (커브 제외)
	clueSpread: number;         // 단서 분산도 (0=연속, 1=최대 분산)
	maxMistakes: number;        // 최대 허용 실수 횟수
}

export const DIFFICULTY_CONFIG: Record<Difficulty, TrainTracksDifficultyConfig> = {
	easy:   { gridSize: 5, cluePercentage: 0.40, minPathRatio: 1.4, minCornerRatio: 0.10, clueStraightOnly: false, clueSpread: 0.2, maxMistakes: 5 },
	medium: { gridSize: 6, cluePercentage: 0.28, minPathRatio: 1.7, minCornerRatio: 0.25, clueStraightOnly: false, clueSpread: 0.5, maxMistakes: 4 },
	hard:   { gridSize: 7, cluePercentage: 0.20, minPathRatio: 2.0, minCornerRatio: 0.35, clueStraightOnly: true,  clueSpread: 0.7, maxMistakes: 3 },
	expert: { gridSize: 8, cluePercentage: 0.14, minPathRatio: 2.2, minCornerRatio: 0.40, clueStraightOnly: true,  clueSpread: 0.85, maxMistakes: 2 },
	master: { gridSize: 9, cluePercentage: 0.08, minPathRatio: 2.5, minCornerRatio: 0.45, clueStraightOnly: true,  clueSpread: 1.0, maxMistakes: 1 }
};

// Base connections at rotation=0 for each track type
export const TRACK_CONNECTIONS: Record<Exclude<TrackType, 'empty'>, Direction[]> = {
	straight: [Direction.LEFT, Direction.RIGHT],
	corner: [Direction.TOP, Direction.RIGHT],
	start: [Direction.RIGHT],
	finish: [Direction.RIGHT]
};

export function getOpenDirections(type: TrackType, rotation: number): Direction[] {
	if (type === 'empty') return [];
	const base = TRACK_CONNECTIONS[type];
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

// Tool types for the palette
export type ToolType =
	| 'straight_h'   // straight rotation 0 (horizontal)
	| 'straight_v'   // straight rotation 1 (vertical)
	| 'corner_tr'    // corner rotation 0 (top-right)
	| 'corner_rb'    // corner rotation 1 (right-bottom)
	| 'corner_bl'    // corner rotation 2 (bottom-left)
	| 'corner_lt'    // corner rotation 3 (left-top)
	| 'eraser'
	| 'mark_empty';

export function toolToTrack(tool: ToolType): { trackType: TrackType; rotation: number } | null {
	switch (tool) {
		case 'straight_h': return { trackType: 'straight', rotation: 0 };
		case 'straight_v': return { trackType: 'straight', rotation: 1 };
		case 'corner_tr': return { trackType: 'corner', rotation: 0 };
		case 'corner_rb': return { trackType: 'corner', rotation: 1 };
		case 'corner_bl': return { trackType: 'corner', rotation: 2 };
		case 'corner_lt': return { trackType: 'corner', rotation: 3 };
		default: return null;
	}
}

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert' | 'master';

export interface Tube {
	id: number;
	layers: number[]; // bottom(idx 0) to top, color index (0-based), empty slots not stored
}

export const TUBE_CAPACITY = 4;

export const COLORS = [
	'#dc2626', // 0: Red
	'#2563eb', // 1: Blue
	'#16a34a', // 2: Green
	'#eab308', // 3: Yellow
	'#9333ea', // 4: Purple
	'#ea580c', // 5: Orange
	'#ec4899', // 6: Pink
	'#06b6d4', // 7: Cyan
	'#78350f', // 8: Brown
	'#84cc16', // 9: Lime
	'#1e3a8a', // 10: Navy
	'#64748b', // 11: Slate Gray
	'#be185d', // 12: Magenta
	'#0d9488', // 13: Teal
]; // 14 colors (for master)

export interface DifficultyConfig {
	scrambleMoves: number;   // 역방향 스크램블 횟수 (시드 생성 스크립트용)
	numColorsRange: [number, number]; // 색상 수 랜덤 범위
	emptyTubesRange: [number, number]; // 빈 시험관 수 랜덤 범위
}

// moveLimit은 시드(seeds.ts)에 BFS 최적해로 포함됨
export const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
	easy:   { scrambleMoves: 30,  numColorsRange: [4, 6],  emptyTubesRange: [2, 3] },
	medium: { scrambleMoves: 60,  numColorsRange: [6, 9],  emptyTubesRange: [2, 2] },
	hard:   { scrambleMoves: 100, numColorsRange: [8, 12], emptyTubesRange: [1, 2] },
	expert: { scrambleMoves: 150, numColorsRange: [10, 14], emptyTubesRange: [1, 2] },
	master: { scrambleMoves: 200, numColorsRange: [12, 14], emptyTubesRange: [1, 2] },
};

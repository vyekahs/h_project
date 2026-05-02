import { TileType } from './types';

export function calculateMatchScore(matchLength: number, cascadeLevel: number): number {
	let base = 0;
	if (matchLength === 3) base = 30;
	else if (matchLength === 4) base = 60;
	else if (matchLength >= 5) base = 100;

	const multiplier = Math.min(1 + (cascadeLevel - 1) * 0.5, 5);
	return Math.round(base * multiplier);
}

export function calculateSpecialBonus(type: TileType): number {
	switch (type) {
		case TileType.BOMB: return 50;
		case TileType.BLAST: return 80;
		case TileType.RAINBOW: return 150;
		default: return 0;
	}
}

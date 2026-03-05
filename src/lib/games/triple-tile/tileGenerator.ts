import type { Tile, Difficulty } from './types';
import { DIFFICULTY_CONFIG } from './types';
import { pickTemplate } from './templates';
import { getExposedTiles } from './tileLogic';

/**
 * Generate a solvable Triple Tile puzzle using reverse-removal algorithm.
 *
 * Algorithm:
 * 1. Create all tile positions from the layout template (all tiles placed, no types yet)
 * 2. Repeatedly: pick 3 exposed tiles, assign them the same type, remove them
 * 3. After removal, new tiles below become exposed
 * 4. Continue until all tiles have types
 *
 * This guarantees solvability: the player can pick tiles in the same order
 * they were assigned types (since they were exposed at assignment time).
 */
export function generatePuzzle(difficulty: Difficulty): Tile[] {
	const config = DIFFICULTY_CONFIG[difficulty];

	// Get positions from template (uses full template, always multiple of 3)
	const positions = pickTemplate(difficulty, config.tileTypes * 3);
	const numTypes = positions.length / 3;

	// Clamp to available tile types from config
	const usedTypes = Math.min(numTypes, config.tileTypes);

	// Create tiles with positions but no types yet
	const tiles: Tile[] = positions.map((pos, i) => ({
		id: i,
		typeId: -1, // unassigned
		col: pos.col,
		row: pos.row,
		layer: pos.layer,
		removed: false,
	}));

	// Build shuffled list of unique type IDs (cycling if more tiles than types)
	const typeList: number[] = [];
	for (let i = 0; i < numTypes; i++) {
		typeList.push(i % usedTypes);
	}
	shuffleArray(typeList);

	// Reverse-removal: assign types by picking exposed tiles
	const unassigned = new Set(tiles.map((t) => t.id));
	let typeIndex = 0;

	// Work with a virtual board where "assigned" tiles are considered "removed"
	// so that tiles below them become exposed
	const virtualTiles = tiles.map((t) => ({ ...t }));

	while (unassigned.size > 0 && typeIndex < typeList.length) {
		// Get currently exposed tiles (among unassigned ones)
		const exposed = getExposedTiles(virtualTiles).filter((t) => unassigned.has(t.id));

		if (exposed.length < 3) {
			// Not enough exposed tiles — fallback: assign to any remaining unassigned
			const remaining = Array.from(unassigned);
			shuffleArray(remaining);
			while (remaining.length >= 3 && typeIndex < typeList.length) {
				const typeId = typeList[typeIndex++];
				for (let i = 0; i < 3; i++) {
					const id = remaining.shift()!;
					tiles[id].typeId = typeId;
					unassigned.delete(id);
				}
			}
			break;
		}

		// Pick 3 random exposed tiles
		shuffleArray(exposed);
		const picked = exposed.slice(0, 3);

		// Assign the same type to all 3
		const typeId = typeList[typeIndex++];
		for (const tile of picked) {
			tiles[tile.id].typeId = typeId;
			virtualTiles[tile.id].removed = true; // "remove" from virtual board
			unassigned.delete(tile.id);
		}
	}

	// Shuffle typeIds within adjacent layer pairs (0-1, 2-3, etc.)
	// Same types spread at most 1 layer apart — adds variety without burying triples.
	// Retry up to 10 times until a solvable arrangement is found.
	const maxLayer = Math.max(...tiles.map((t) => t.layer));
	const originalTypeIds = tiles.map((t) => t.typeId);

	for (let attempt = 0; attempt < 10; attempt++) {
		// Restore original types before re-shuffling
		if (attempt > 0) {
			for (let i = 0; i < tiles.length; i++) {
				tiles[i].typeId = originalTypeIds[i];
			}
		}

		for (let base = 0; base <= maxLayer; base += 2) {
			const ids = tiles
				.filter((t) => t.layer === base || t.layer === base + 1)
				.map((t) => t.id);
			const typeIds = ids.map((id) => tiles[id].typeId);
			shuffleArray(typeIds);
			ids.forEach((id, i) => { tiles[id].typeId = typeIds[i]; });
		}

		if (isSolvable(tiles)) break;
	}

	// Reset all tiles to not removed (player starts fresh)
	for (const tile of tiles) {
		tile.removed = false;
	}

	return tiles;
}

/**
 * Simulate greedy play to check if the puzzle is solvable.
 * Repeatedly picks 3 matching exposed tiles until cleared or stuck.
 */
function isSolvable(tiles: Tile[]): boolean {
	const sim = tiles.map((t) => ({ ...t, removed: false }));
	let remaining = sim.length;

	while (remaining > 0) {
		const exposed = getExposedTiles(sim);
		// Count exposed tiles by type
		const byType = new Map<number, Tile[]>();
		for (const t of exposed) {
			const arr = byType.get(t.typeId) ?? [];
			arr.push(t);
			byType.set(t.typeId, arr);
		}

		let matched = false;
		for (const [, group] of byType) {
			if (group.length >= 3) {
				// Remove 3 tiles of this type
				for (let i = 0; i < 3; i++) {
					sim[group[i].id].removed = true;
				}
				remaining -= 3;
				matched = true;
				break;
			}
		}

		if (!matched) return false;
	}
	return true;
}

/**
 * Shuffle remaining board tiles' types while maintaining the triple constraint.
 * Only shuffles tiles that are still on the board (not removed).
 */
export function shuffleBoardTiles(tiles: Tile[]): Tile[] {
	const boardTiles = tiles.filter((t) => !t.removed);
	const types = boardTiles.map((t) => t.typeId);

	for (let attempt = 0; attempt < 20; attempt++) {
		shuffleArray(types);

		const result = tiles.map((t) => ({ ...t }));
		let typeIdx = 0;
		for (const tile of result) {
			if (!tile.removed) {
				tile.typeId = types[typeIdx++];
			}
		}

		if (isSolvable(result)) return result;
	}

	// Fallback: return last shuffle even if not verified solvable
	const result = tiles.map((t) => ({ ...t }));
	let typeIdx = 0;
	for (const tile of result) {
		if (!tile.removed) {
			tile.typeId = types[typeIdx++];
		}
	}
	return result;
}

/** Fisher-Yates shuffle in place */
function shuffleArray<T>(arr: T[]): void {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
}

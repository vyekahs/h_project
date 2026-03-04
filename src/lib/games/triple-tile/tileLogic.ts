import type { Tile } from './types';

/**
 * Check if a tile is "exposed" (clickable).
 * A tile is exposed if:
 * 1. It is not removed
 * 2. No tile on a higher layer overlaps it (within 0.5-offset stacking)
 */
export function isExposed(tile: Tile, allTiles: Tile[]): boolean {
	if (tile.removed) return false;

	// Check if any higher-layer tile covers this tile
	return !allTiles.some(
		(other) =>
			!other.removed &&
			other.layer > tile.layer &&
			Math.abs(other.col - tile.col) < 1 &&
			Math.abs(other.row - tile.row) < 1
	);
}

/**
 * Get all currently exposed (clickable) tiles.
 */
export function getExposedTiles(tiles: Tile[]): Tile[] {
	return tiles.filter((t) => !t.removed && isExposed(t, tiles));
}

/**
 * Insert a tile into the staging area, grouping by type.
 * Returns the new staging array and the index where the tile was placed.
 * Returns null if staging is full (no room).
 */
export function insertIntoStaging(
	staging: (Tile | null)[],
	tile: Tile,
	capacity: number
): { newStaging: (Tile | null)[]; insertIndex: number } | null {
	const result = [...staging];

	// Find if there are already tiles of the same type in staging
	const sameTypeIndices = result
		.map((t, i) => (t && t.typeId === tile.typeId ? i : -1))
		.filter((i) => i !== -1);

	let insertIndex: number;

	if (sameTypeIndices.length > 0) {
		// Insert right after the last same-type tile
		insertIndex = sameTypeIndices[sameTypeIndices.length - 1] + 1;

		// If that spot is occupied by a different type, shift right to make room
		if (insertIndex < capacity && result[insertIndex] !== null) {
			// Find the rightmost empty slot
			let emptySlot = -1;
			for (let i = capacity - 1; i >= insertIndex; i--) {
				if (result[i] === null) {
					emptySlot = i;
					break;
				}
			}
			if (emptySlot === -1) {
				// No empty slot to the right, try left
				for (let i = 0; i < insertIndex; i++) {
					if (result[i] === null) {
						emptySlot = i;
						break;
					}
				}
				if (emptySlot === -1) return null; // staging full

				// Shift left to make room
				for (let i = emptySlot; i < insertIndex - 1; i++) {
					result[i] = result[i + 1];
				}
				insertIndex--;
			} else {
				// Shift right to make room
				for (let i = emptySlot; i > insertIndex; i--) {
					result[i] = result[i - 1];
				}
			}
		} else if (insertIndex >= capacity) {
			// Same type is at the end, find any empty slot
			const emptySlot = result.indexOf(null);
			if (emptySlot === -1) return null;
			insertIndex = emptySlot;
		}
	} else {
		// No same-type tile, find first empty slot
		insertIndex = result.indexOf(null);
		if (insertIndex === -1) return null; // staging full
	}

	result[insertIndex] = { ...tile };
	return { newStaging: result, insertIndex };
}

/**
 * Check if there are 3 matching tiles in the staging area.
 * Returns the typeId that matched, or -1 if no match.
 */
export function checkStagingMatch(staging: (Tile | null)[]): number {
	const counts = new Map<number, number>();
	for (const tile of staging) {
		if (tile) {
			const count = (counts.get(tile.typeId) ?? 0) + 1;
			counts.set(tile.typeId, count);
			if (count >= 3) return tile.typeId;
		}
	}
	return -1;
}

/**
 * Remove all tiles of a given type from staging.
 * Returns the new staging array.
 */
export function removeMatchedFromStaging(
	staging: (Tile | null)[],
	typeId: number,
	capacity: number
): (Tile | null)[] {
	const result = staging.map((t) => (t && t.typeId === typeId ? null : t));

	// Compact: shift all tiles left to fill gaps
	const compacted: (Tile | null)[] = Array(capacity).fill(null);
	let idx = 0;
	for (const t of result) {
		if (t !== null) {
			compacted[idx++] = t;
		}
	}
	return compacted;
}

/**
 * Count occupied slots in staging.
 */
export function stagingOccupied(staging: (Tile | null)[]): number {
	return staging.filter((t) => t !== null).length;
}

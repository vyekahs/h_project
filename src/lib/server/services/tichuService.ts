import { query } from '$lib/server/db';

// ===== Active Game Snapshots (legacy - kept for DB cleanup) =====

export async function removeTichuSnapshot(roomId: string): Promise<void> {
	await query('DELETE FROM tichu_active_games WHERE room_id = $1', [roomId]);
}

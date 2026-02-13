import { query, getClient } from '$lib/server/db';
import type { TichuRoom } from '$lib/server/tichu/TichuRoom';

// ===== Active Game Snapshots (UNLOGGED table) =====

export async function saveTichuSnapshot(
	roomId: string,
	gameState: string,
	playerIds: number[],
	phase: string
): Promise<void> {
	await query(
		`INSERT INTO tichu_active_games (room_id, game_state, player_ids, phase, updated_at)
		 VALUES ($1, $2::jsonb, $3, $4, NOW())
		 ON CONFLICT (room_id) DO UPDATE SET
		   game_state = $2::jsonb, player_ids = $3, phase = $4, updated_at = NOW()`,
		[roomId, gameState, playerIds, phase]
	);
}

export async function loadTichuSnapshots(): Promise<{
	room_id: string;
	game_state: string;
	player_ids: number[];
	phase: string;
}[]> {
	const result = await query(
		`SELECT room_id, game_state::text, player_ids, phase FROM tichu_active_games`
	);
	return result.rows;
}

export async function removeTichuSnapshot(roomId: string): Promise<void> {
	await query('DELETE FROM tichu_active_games WHERE room_id = $1', [roomId]);
}

// ===== Game Results (permanent storage) =====

export async function saveTichuResult(room: TichuRoom): Promise<void> {
	const state = room.state;
	if (!state.winner) return;

	const client = await getClient();
	try {
		await client.query('BEGIN');

		// Create game session
		const creatorId = state.players[0]?.userId || null;
		const sessionRes = await client.query(
			`INSERT INTO game_sessions (game_name, status, end_time, created_by)
			 VALUES ($1, $2, NOW(), $3) RETURNING id`,
			['티츄 (온라인)', 'finished', creatorId]
		);
		const sessionId = sessionRes.rows[0].id;

		// Add participants
		for (const player of state.players) {
			const isWinner = player.team === state.winner;
			const score = player.team === 'A' ? state.cumulativeScoreA : state.cumulativeScoreB;
			await client.query(
				`INSERT INTO session_participants (session_id, attendee_id, is_winner, score)
				 VALUES ($1, $2, $3, $4)`,
				[sessionId, player.userId, isWinner, score]
			);
		}

		// Save detailed result
		const resultRes = await client.query(
			`INSERT INTO tichu_game_results (session_id, team_a_score, team_b_score, total_rounds, winning_team)
			 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
			[sessionId, state.cumulativeScoreA, state.cumulativeScoreB, state.completedRounds.length, state.winner]
		);
		const resultId = resultRes.rows[0].id;

		// Save round details
		for (const round of state.completedRounds) {
			await client.query(
				`INSERT INTO tichu_round_details
				 (game_result_id, round_number, team_a_round_score, team_b_round_score, one_two, grand_tichu_declarations, small_tichu_declarations)
				 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
				[
					resultId,
					round.roundNumber,
					round.teamAScore,
					round.teamBScore,
					round.oneTwo !== null,
					JSON.stringify(round.grandTichuDeclarations),
					JSON.stringify(round.smallTichuDeclarations)
				]
			);
		}

		// Update player stats — aggregate from all completed rounds, not just last round
		for (const player of state.players) {
			const isWinner = player.team === state.winner;

			// Count across all rounds
			let grandAttempts = 0;
			let grandSuccesses = 0;
			let smallAttempts = 0;
			let smallSuccesses = 0;
			let firstOutCount = 0;

			for (const round of state.completedRounds) {
				for (const gd of round.grandTichuDeclarations) {
					if (gd.seat === player.seat) {
						grandAttempts++;
						if (gd.success) grandSuccesses++;
					}
				}
				for (const sd of round.smallTichuDeclarations) {
					if (sd.seat === player.seat) {
						smallAttempts++;
						if (sd.success) smallSuccesses++;
					}
				}
				if (round.finishOrder && round.finishOrder[0] === player.seat) {
					firstOutCount++;
				}
			}
			const oneTwoCount = state.completedRounds.filter(r => r.oneTwo === player.team).length;

			await client.query(
				`INSERT INTO tichu_player_stats (user_id, games_played, games_won, grand_tichu_attempts, grand_tichu_successes, small_tichu_attempts, small_tichu_successes, one_two_count, first_out_count, updated_at)
				 VALUES ($1, 1, $2::int, $3::int, $4::int, $5::int, $6::int, $7::int, $8::int, NOW())
				 ON CONFLICT (user_id) DO UPDATE SET
				   games_played = tichu_player_stats.games_played + 1,
				   games_won = tichu_player_stats.games_won + $2::int,
				   grand_tichu_attempts = tichu_player_stats.grand_tichu_attempts + $3::int,
				   grand_tichu_successes = tichu_player_stats.grand_tichu_successes + $4::int,
				   small_tichu_attempts = tichu_player_stats.small_tichu_attempts + $5::int,
				   small_tichu_successes = tichu_player_stats.small_tichu_successes + $6::int,
				   one_two_count = tichu_player_stats.one_two_count + $7::int,
				   first_out_count = tichu_player_stats.first_out_count + $8::int,
				   updated_at = NOW()`,
				[
					player.userId,
					isWinner ? 1 : 0,
					grandAttempts,
					grandSuccesses,
					smallAttempts,
					smallSuccesses,
					oneTwoCount,
					firstOutCount
				]
			);
		}

		await client.query('COMMIT');
	} catch (e) {
		await client.query('ROLLBACK');
		throw e;
	} finally {
		client.release();
	}
}

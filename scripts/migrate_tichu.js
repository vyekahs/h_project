import pg from 'pg';

const pool = new pg.Pool({
	connectionString: process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/boardgameclub'
});

async function migrate() {
	const client = await pool.connect();
	try {
		console.log('[Tichu Migration] Starting...');

		// Tichu game results (detailed records)
		await client.query(`
			CREATE TABLE IF NOT EXISTS tichu_game_results (
				id SERIAL PRIMARY KEY,
				session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE,
				team_a_score INTEGER NOT NULL,
				team_b_score INTEGER NOT NULL,
				total_rounds INTEGER NOT NULL,
				winning_team CHAR(1) CHECK (winning_team IN ('A', 'B')),
				created_at TIMESTAMPTZ DEFAULT NOW()
			)
		`);
		console.log('[Tichu Migration] tichu_game_results OK');

		// Round details
		await client.query(`
			CREATE TABLE IF NOT EXISTS tichu_round_details (
				id SERIAL PRIMARY KEY,
				game_result_id INTEGER REFERENCES tichu_game_results(id) ON DELETE CASCADE,
				round_number INTEGER NOT NULL,
				team_a_round_score INTEGER NOT NULL,
				team_b_round_score INTEGER NOT NULL,
				one_two BOOLEAN DEFAULT FALSE,
				grand_tichu_declarations JSONB,
				small_tichu_declarations JSONB
			)
		`);
		console.log('[Tichu Migration] tichu_round_details OK');

		// Active games snapshot (UNLOGGED for fast writes, survives normal restart)
		await client.query(`
			CREATE UNLOGGED TABLE IF NOT EXISTS tichu_active_games (
				room_id TEXT PRIMARY KEY,
				game_state JSONB NOT NULL,
				player_ids INTEGER[] NOT NULL,
				phase TEXT NOT NULL,
				updated_at TIMESTAMPTZ DEFAULT NOW()
			)
		`);
		console.log('[Tichu Migration] tichu_active_games (UNLOGGED) OK');

		// Player stats
		await client.query(`
			CREATE TABLE IF NOT EXISTS tichu_player_stats (
				user_id INTEGER PRIMARY KEY REFERENCES attendees(id) ON DELETE CASCADE,
				games_played INTEGER DEFAULT 0,
				games_won INTEGER DEFAULT 0,
				grand_tichu_attempts INTEGER DEFAULT 0,
				grand_tichu_successes INTEGER DEFAULT 0,
				small_tichu_attempts INTEGER DEFAULT 0,
				small_tichu_successes INTEGER DEFAULT 0,
				one_two_count INTEGER DEFAULT 0,
				first_out_count INTEGER DEFAULT 0,
				updated_at TIMESTAMPTZ DEFAULT NOW()
			)
		`);
		console.log('[Tichu Migration] tichu_player_stats OK');

		console.log('[Tichu Migration] All done!');
	} catch (err) {
		console.error('[Tichu Migration] Error:', err);
		throw err;
	} finally {
		client.release();
		await pool.end();
	}
}

migrate().catch(() => process.exit(1));

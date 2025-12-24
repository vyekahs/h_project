import { query } from '$lib/server/db';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
    // Auto-finish expired games
    await query("UPDATE game_sessions SET status = 'finished' WHERE status = 'playing' AND end_time < NOW()");

    const attendeesResult = await query(`
        SELECT a.id, a.name, a.arrival_time, a.status,
               MAX(g.id) as game_id,
               MAX(g.game_name) as game_name,
               BOOL_OR(g.id IS NOT NULL) as is_playing
        FROM attendees a
        LEFT JOIN session_participants sp ON a.id = sp.attendee_id
        LEFT JOIN game_sessions g ON sp.session_id = g.id AND g.status = 'playing'
        WHERE a.status = 'present'
        GROUP BY a.id
        ORDER BY is_playing, a.arrival_time DESC
    `);
    const historyResult = await query(`
        SELECT DISTINCT ON (name) id, name
        FROM attendees
        ORDER BY name, id DESC
    `);
    const gamesResult = await query(`
        SELECT gs.*, g.image_url, json_agg(json_build_object('id', a.id, 'name', a.name)) as players
        FROM game_sessions gs
        LEFT JOIN session_participants sp ON gs.id = sp.session_id
        LEFT JOIN attendees a ON sp.attendee_id = a.id
        LEFT JOIN games g ON gs.game_id = g.id
        WHERE gs.status = $1
        GROUP BY gs.id, g.image_url
        ORDER BY gs.start_time DESC
    `, ['playing']);

    const gameNamesResult = await query(`
        SELECT DISTINCT ON (game_name) 
            game_name, 
            ROUND(EXTRACT(EPOCH FROM (end_time - start_time))/60) as duration 
        FROM game_sessions 
        ORDER BY game_name, start_time DESC
    `);

    const noticeResult = await query('SELECT content FROM notices WHERE is_active = true ORDER BY created_at DESC LIMIT 1');
    const presentNames = new Set(attendeesResult.rows.map((a: any) => a.name));
    const savedMembers = historyResult.rows
        .filter((r: any) => !presentNames.has(r.name))
        .map((r: any) => ({ id: r.id, name: r.name }));
    
    const allGamesResult = await query('SELECT id, name, playtime_min FROM games WHERE is_active = true ORDER BY name ASC');

    return {
        attendees: attendeesResult.rows,
        savedMembers,
        games: gamesResult.rows,
        savedGameNames: gameNamesResult.rows,
        allGames: allGamesResult.rows,
        notice: noticeResult.rows[0]?.content || null
    };
};

export const actions: Actions = {
    // ... (addAttendee, removeAttendee omitted for brevity, they are unchanged)
    addAttendee: async ({ request }) => {
        const data = await request.formData();
        const name = data.get('name')?.toString().trim();

        if (!name) {
            return fail(400, { error: '이름을 입력해주세요.' });
        }

        // Ensure is_open is true
        await query("INSERT INTO system_settings (key, value) VALUES ('is_open', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true'");

        // 1. Check if attendee exists (by name)
        const existing = await query('SELECT * FROM attendees WHERE name = $1', [name]);

        if (existing.rows.length > 0) {
            const attendee = existing.rows[0];
            
            // Check if already present
            if (attendee.status === 'present') {
                return fail(400, { error: '이미 참여 중인 인원입니다.' });
            }

            // Re-entry: Update status and Add new visit
            await query('BEGIN');
            try {
                await query('UPDATE attendees SET status = $1, arrival_time = NOW(), updated_at = NOW() WHERE id = $2', ['present', attendee.id]);
                await query('INSERT INTO visits (attendee_id, arrival_time) VALUES ($1, NOW())', [attendee.id]);
                await query('COMMIT');
            } catch (e) {
                await query('ROLLBACK');
                throw e;
            }
        } else {
            // New Entry: Create attendee and Add visit
            await query('BEGIN');
            try {
                const result = await query('INSERT INTO attendees (name, status, arrival_time) VALUES ($1, $2, NOW()) RETURNING id', [name, 'present']);
                const newId = result.rows[0].id;
                await query('INSERT INTO visits (attendee_id, arrival_time) VALUES ($1, NOW())', [newId]);
                await query('COMMIT');
            } catch (e) {
                await query('ROLLBACK');
                throw e;
            }
        }
    },

    removeAttendee: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id');
        const endGame = data.get('endGame') === 'true';
        const gameId = data.get('gameId');

        if (!id) return fail(400, { error: 'Invalid ID' });

        await query('BEGIN');
        try {
            // 1. Update Attendee Status
            await query('UPDATE attendees SET status = $1, updated_at = NOW() WHERE id = $2', ['left', id]);

            // 2. Close current visit
            await query('UPDATE visits SET departure_time = NOW() WHERE attendee_id = $1 AND departure_time IS NULL', [id]);

            // 3. End Game if requested
            if (endGame && gameId) {
                await query('UPDATE game_sessions SET status = $1, end_time = NOW() WHERE id = $2', ['finished', gameId]);
            }

            await query('COMMIT');
        } catch (e) {
            await query('ROLLBACK');
            return fail(500, { error: 'Failed to remove attendee' });
        }
    },

    createGame: async ({ request }) => {
        const data = await request.formData();
        const gameName = data.get('gameName')?.toString();
        const gameId = data.get('gameId') ? parseInt(data.get('gameId') as string) : null;
        const duration = parseInt(data.get('duration')?.toString() || '0');
        const playerIds = data.getAll('players').map(p => p.toString());

        if (!gameName || duration <= 0 || playerIds.length === 0) {
            return fail(400, { missing: true });
        }

        try {
            await query('BEGIN');
            
            // Check if any player is already playing
            const playingCheck = await query(`
                SELECT a.name 
                FROM session_participants sp
                JOIN game_sessions gs ON sp.session_id = gs.id
                JOIN attendees a ON sp.attendee_id = a.id
                WHERE gs.status = 'playing' AND sp.attendee_id = ANY($1)
            `, [playerIds]);

            if (playingCheck.rows.length > 0) {
                await query('ROLLBACK');
                const busyPlayers = playingCheck.rows.map((r: any) => r.name).join(', ');
                return fail(400, { error: `다음 인원은 이미 게임 중입니다: ${busyPlayers}` });
            }

            const result = await query(
                'INSERT INTO game_sessions (game_name, game_id, start_time, end_time, status) VALUES ($1, $2, NOW(), NOW() + interval \'' + duration + ' minutes\', $3) RETURNING id',
                [gameName, gameId, 'playing']
            );
            const newGameId = result.rows[0].id;

            for (const playerId of playerIds) {
                await query('INSERT INTO session_participants (session_id, attendee_id) VALUES ($1, $2)', [newGameId, playerId]);
            }
            await query('COMMIT');
        } catch (error) {
            await query('ROLLBACK');
            return fail(500, { error: 'Failed to create game' });
        }
    },
    endGame: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id')?.toString();
        const winnerIds = data.getAll('winnerIds').map(id => id.toString());
        
        // Process scores: scores are sent as "score_{attendeeId}"
        const scores: Record<string, number> = {};
        for (const [key, value] of data.entries()) {
            if (key.startsWith('score_')) {
                const attendeeId = key.replace('score_', '');
                if (value.toString().trim() !== '') {
                    scores[attendeeId] = parseInt(value.toString());
                }
            }
        }

        if (!id) {
            return fail(400, { missing: true });
        }

        try {
            await query('BEGIN');
            await query('UPDATE game_sessions SET status = $1, end_time = NOW() WHERE id = $2', ['finished', id]);
            
            if (winnerIds.length > 0) {
                await query('UPDATE session_participants SET is_winner = true WHERE session_id = $1 AND attendee_id = ANY($2)', [id, winnerIds]);
            }

            // Update scores
            for (const [attendeeId, score] of Object.entries(scores)) {
                await query('UPDATE session_participants SET score = $1 WHERE session_id = $2 AND attendee_id = $3', [score, id, attendeeId]);
            }
            
            await query('COMMIT');
        } catch (error) {
            await query('ROLLBACK');
            return fail(500, { error: 'Failed to end game' });
        }
    },
    updateNotice: async ({ request }) => {
        const data = await request.formData();
        const content = data.get('content')?.toString();

        if (!content) {
            return fail(400, { missing: true });
        }

        try {
            await query('BEGIN');
            await query('UPDATE notices SET is_active = false');
            await query('INSERT INTO notices (content) VALUES ($1)', [content]);
            await query('COMMIT');
        } catch (error) {
            await query('ROLLBACK');
            return fail(500, { error: 'Failed to update notice' });
        }
    },
    clearNotice: async () => {
        try {
            await query('UPDATE notices SET is_active = false');
        } catch (error) {
            return fail(500, { error: 'Failed to clear notice' });
        }
    },
    extendGame: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id')?.toString();
        const minutes = parseInt(data.get('minutes')?.toString() || '0');

        if (!id || minutes <= 0) {
            return fail(400, { missing: true });
        }

        try {
            await query(
                'UPDATE game_sessions SET end_time = end_time + interval \'' + minutes + ' minutes\' WHERE id = $1',
                [id]
            );
        } catch (error) {
            return fail(500, { error: 'Failed to extend game' });
        }
    },
    updateSettings: async ({ request }) => {
        const data = await request.formData();
        const weekday = data.get('closing_time_weekday')?.toString();
        const weekend = data.get('closing_time_weekend')?.toString();
        const weekendDays = data.getAll('weekend_days').join(',');

        if (!weekday || !weekend) {
            return fail(400, { missing: true });
        }

        try {
            await query('BEGIN');
            await query('INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', ['closing_time_weekday', weekday]);
            await query('INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', ['closing_time_weekend', weekend]);
            await query('INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', ['weekend_days', weekendDays]);
            await query('COMMIT');
        } catch (error) {
            await query('ROLLBACK');
            return fail(500, { error: 'Failed to update settings' });
        }
    },
    closeDay: async () => {
        try {
            await query('BEGIN');
            // Checkout all active visits
            await query('UPDATE visits SET departure_time = NOW() WHERE departure_time IS NULL');
            // End all active games
            await query('UPDATE game_sessions SET end_time = NOW() WHERE end_time > NOW()');
            // Set is_open to false
            await query("INSERT INTO system_settings (key, value) VALUES ('is_open', 'false') ON CONFLICT (key) DO UPDATE SET value = 'false'");
            await query('COMMIT');
        } catch (error) {
            await query('ROLLBACK');
            return fail(500, { error: 'Failed to close day' });
        }
    },
    openDay: async () => {
        try {
            await query("INSERT INTO system_settings (key, value) VALUES ('is_open', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true'");
        } catch (error) {
            return fail(500, { error: 'Failed to open day' });
        }
    }
};

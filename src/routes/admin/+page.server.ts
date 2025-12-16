import { query } from '$lib/server/db';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
    // Auto-finish expired games
    await query("UPDATE game_sessions SET status = 'finished' WHERE status = 'playing' AND end_time < NOW()");

    const attendeesResult = await query(`
        SELECT a.id, a.name, a.arrival_time, a.status,
               MAX(gs.id) as game_id,
               MAX(gs.game_name) as game_name,
               BOOL_OR(gs.id IS NOT NULL) as is_playing
        FROM attendees a
        LEFT JOIN session_participants sp ON a.name = sp.player_name
        LEFT JOIN game_sessions gs ON sp.session_id = gs.id AND gs.status = 'playing'
        WHERE a.status = 'present'
        GROUP BY a.id
        ORDER BY is_playing ASC, a.arrival_time DESC
    `);
    const historyResult = await query(`
        SELECT name
        FROM attendees
        GROUP BY name
        ORDER BY
            COUNT(*) FILTER (WHERE arrival_time >= NOW() - INTERVAL '3 months') DESC,
            COUNT(*) DESC,
            name ASC
    `);
    const gamesResult = await query(`
        SELECT gs.*, json_agg(sp.player_name) as players
        FROM game_sessions gs
        LEFT JOIN session_participants sp ON gs.id = sp.session_id
        WHERE gs.status = $1
        GROUP BY gs.id
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
        .map((r: any) => r.name)
        .filter((name: string) => !presentNames.has(name));

    return {
        attendees: attendeesResult.rows,
        savedMembers,
        games: gamesResult.rows,
        savedGameNames: gameNamesResult.rows,
        notice: noticeResult.rows[0]?.content || null
    };
};

export const actions: Actions = {
    addAttendee: async ({ request }) => {
        const data = await request.formData();
        const name = data.get('name')?.toString();

        if (!name) {
            return fail(400, { missing: true });
        }

        try {
            await query('INSERT INTO attendees (name) VALUES ($1)', [name]);
        } catch (error) {
            return fail(500, { error: 'Failed to add attendee' });
        }
    },
    removeAttendee: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id')?.toString();
        const endGame = data.get('endGame') === 'true';
        const gameId = data.get('gameId')?.toString();

        if (!id) {
            return fail(400, { missing: true });
        }

        try {
            await query('BEGIN');
            await query('UPDATE attendees SET status = $1 WHERE id = $2', ['left', id]);
            
            if (endGame && gameId) {
                await query('UPDATE game_sessions SET status = $1 WHERE id = $2', ['finished', gameId]);
            }
            
            await query('COMMIT');
        } catch (error) {
            await query('ROLLBACK');
            return fail(500, { error: 'Failed to remove attendee' });
        }
    },
    createGame: async ({ request }) => {
        const data = await request.formData();
        const gameName = data.get('gameName')?.toString();
        const duration = parseInt(data.get('duration')?.toString() || '0');
        const players = data.getAll('players').map(p => p.toString());

        if (!gameName || duration <= 0 || players.length === 0) {
            return fail(400, { missing: true });
        }

        try {
            await query('BEGIN');
            
            // Check if any player is already playing
            const playingCheck = await query(`
                SELECT sp.player_name 
                FROM session_participants sp
                JOIN game_sessions gs ON sp.session_id = gs.id
                WHERE gs.status = 'playing' AND sp.player_name = ANY($1)
            `, [players]);

            if (playingCheck.rows.length > 0) {
                await query('ROLLBACK');
                const busyPlayers = playingCheck.rows.map((r: any) => r.player_name).join(', ');
                return fail(400, { error: `다음 인원은 이미 게임 중입니다: ${busyPlayers}` });
            }

            const result = await query(
                'INSERT INTO game_sessions (game_name, start_time, end_time, status) VALUES ($1, NOW(), NOW() + interval \'' + duration + ' minutes\', $2) RETURNING id',
                [gameName, 'playing']
            );
            const gameId = result.rows[0].id;

            for (const player of players) {
                await query('INSERT INTO session_participants (session_id, player_name) VALUES ($1, $2)', [gameId, player]);
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

        if (!id) {
            return fail(400, { missing: true });
        }

        try {
            await query('UPDATE game_sessions SET status = $1 WHERE id = $2', ['finished', id]);
        } catch (error) {
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
    }
};

import { query } from '$lib/server/db';

export const PartyService = {
    async getUserParties(userId: number) {
        try {
            const result = await query(`
                SELECT gp.id, gp.name, gp.game_id, gp.game_name, gp.duration, gp.guest_count,
                    g.image_url, g.name as resolved_game_name,
                    COALESCE(json_agg(json_build_object(
                        'id', a.id, 'name', a.name
                    ) ORDER BY a.name) FILTER (WHERE a.id IS NOT NULL), '[]') as members
                FROM game_parties gp
                LEFT JOIN game_party_members gpm ON gp.id = gpm.party_id
                LEFT JOIN attendees a ON gpm.attendee_id = a.id
                LEFT JOIN games g ON gp.game_id = g.id
                WHERE gp.owner_id = $1
                GROUP BY gp.id, gp.name, gp.game_id, gp.game_name, gp.duration, gp.guest_count, g.image_url, g.name
                ORDER BY gp.updated_at DESC
            `, [userId]);
            return result.rows;
        } catch (e: any) {
            if (e.code === '42P01') return []; // table does not exist
            throw e;
        }
    },

    async createParty(userId: number, data: {
        name: string;
        gameId: number | null;
        gameName: string | null;
        duration: number | null;
        guestCount: number;
        memberIds: number[];
    }) {
        await query('BEGIN');
        try {
            const result = await query(
                'INSERT INTO game_parties (name, owner_id, game_id, game_name, duration, guest_count) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
                [data.name, userId, data.gameId, data.gameName, data.duration, data.guestCount]
            );
            const partyId = result.rows[0].id;

            const allMemberIds = [...new Set([userId, ...data.memberIds])];
            for (const memberId of allMemberIds) {
                await query(
                    'INSERT INTO game_party_members (party_id, attendee_id) VALUES ($1, $2)',
                    [partyId, memberId]
                );
            }
            await query('COMMIT');
            return partyId;
        } catch (e) {
            await query('ROLLBACK');
            throw e;
        }
    },

    async updateParty(userId: number, partyId: number, data: {
        name: string;
        gameId: number | null;
        gameName: string | null;
        duration: number | null;
        guestCount: number;
        memberIds: number[];
    }) {
        const check = await query('SELECT 1 FROM game_parties WHERE id = $1 AND owner_id = $2', [partyId, userId]);
        if (check.rows.length === 0) throw new Error('Not authorized');

        await query('BEGIN');
        try {
            await query(
                'UPDATE game_parties SET name = $1, game_id = $2, game_name = $3, duration = $4, guest_count = $5, updated_at = NOW() WHERE id = $6',
                [data.name, data.gameId, data.gameName, data.duration, data.guestCount, partyId]
            );
            await query('DELETE FROM game_party_members WHERE party_id = $1', [partyId]);

            const allMemberIds = [...new Set([userId, ...data.memberIds])];
            for (const memberId of allMemberIds) {
                await query(
                    'INSERT INTO game_party_members (party_id, attendee_id) VALUES ($1, $2)',
                    [partyId, memberId]
                );
            }
            await query('COMMIT');
        } catch (e) {
            await query('ROLLBACK');
            throw e;
        }
    },

    async deleteParty(userId: number, partyId: number) {
        const result = await query('DELETE FROM game_parties WHERE id = $1 AND owner_id = $2', [partyId, userId]);
        return (result.rowCount ?? 0) > 0;
    }
};

import { db } from '$lib/server/db/index';
import { sql, eq, and } from 'drizzle-orm';
import { gameParties, gamePartyMembers } from '$lib/server/db/schema/parties';

export const PartyService = {
    async getUserParties(userId: number) {
        try {
            const result = await db.execute(sql`
                SELECT gp.id, gp.name, gp.game_id, gp.game_name, gp.duration, gp.guest_count,
                    g.image_url, g.name as resolved_game_name,
                    COALESCE(json_agg(json_build_object(
                        'id', a.id, 'name', a.name
                    ) ORDER BY a.name) FILTER (WHERE a.id IS NOT NULL), '[]') as members
                FROM game_parties gp
                LEFT JOIN game_party_members gpm ON gp.id = gpm.party_id
                LEFT JOIN attendees a ON gpm.attendee_id = a.id
                LEFT JOIN games g ON gp.game_id = g.id
                WHERE gp.owner_id = ${userId}
                GROUP BY gp.id, gp.name, gp.game_id, gp.game_name, gp.duration, gp.guest_count, g.image_url, g.name
                ORDER BY gp.updated_at DESC
            `);
            return result;
        } catch (e: any) {
            if (e.code === '42P01') return [];
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
        return await db.transaction(async (tx) => {
            const result = await tx.insert(gameParties)
                .values({
                    name: data.name,
                    ownerId: userId,
                    gameId: data.gameId,
                    gameName: data.gameName,
                    duration: data.duration,
                    guestCount: data.guestCount,
                })
                .returning({ id: gameParties.id });
            const partyId = result[0].id;

            const allMemberIds = [...new Set([userId, ...data.memberIds])];
            for (const memberId of allMemberIds) {
                await tx.insert(gamePartyMembers)
                    .values({ partyId, attendeeId: memberId });
            }
            return partyId;
        });
    },

    async updateParty(userId: number, partyId: number, data: {
        name: string;
        gameId: number | null;
        gameName: string | null;
        duration: number | null;
        guestCount: number;
        memberIds: number[];
    }) {
        const check = await db
            .select()
            .from(gameParties)
            .where(and(eq(gameParties.id, partyId), eq(gameParties.ownerId, userId)));
        if (check.length === 0) throw new Error('Not authorized');

        await db.transaction(async (tx) => {
            await tx.update(gameParties)
                .set({
                    name: data.name,
                    gameId: data.gameId,
                    gameName: data.gameName,
                    duration: data.duration,
                    guestCount: data.guestCount,
                    updatedAt: sql`NOW()`,
                })
                .where(eq(gameParties.id, partyId));

            await tx.delete(gamePartyMembers)
                .where(eq(gamePartyMembers.partyId, partyId));

            const allMemberIds = [...new Set([userId, ...data.memberIds])];
            for (const memberId of allMemberIds) {
                await tx.insert(gamePartyMembers)
                    .values({ partyId, attendeeId: memberId });
            }
        });
    },

    async deleteParty(userId: number, partyId: number) {
        const result = await db.delete(gameParties)
            .where(and(eq(gameParties.id, partyId), eq(gameParties.ownerId, userId)))
            .returning();
        return result.length > 0;
    },

    async isPartyMember(partyId: number, attendeeId: number): Promise<boolean> {
        const result = await db
            .select()
            .from(gamePartyMembers)
            .where(and(
                eq(gamePartyMembers.partyId, partyId),
                eq(gamePartyMembers.attendeeId, attendeeId)
            ));
        return result.length > 0;
    }
};

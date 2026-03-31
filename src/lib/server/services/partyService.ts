import { db } from '$lib/server/db/index';
import { sql, eq, and } from 'drizzle-orm';
import { gameParties, gamePartyMembers } from '$lib/server/db/schema/parties';

export const PartyService = {
    async getUserParties(userId: number) {
        try {
            const result = await db.execute(sql`
                SELECT gp.id, gp.name, gp.game_id, gp.game_name, gp.duration, gp.guest_count,
                    g.image_url, g.name as resolved_game_name,
                    (gp.owner_id = ${userId}) as is_owner,
                    gp.owner_id,
                    COALESCE(json_agg(json_build_object(
                        'id', a.id, 'name', a.name, 'status', gpm.status
                    ) ORDER BY a.name) FILTER (WHERE a.id IS NOT NULL), '[]') as members
                FROM game_parties gp
                LEFT JOIN game_party_members gpm ON gp.id = gpm.party_id
                LEFT JOIN attendees a ON gpm.attendee_id = a.id
                LEFT JOIN games g ON gp.game_id = g.id
                WHERE gp.owner_id = ${userId}
                   OR gp.id IN (SELECT party_id FROM game_party_members WHERE attendee_id = ${userId} AND status = 'accepted')
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
    }): Promise<{ partyId: number; inviteeIds: number[] }> {
        const inviteeIds = [...new Set(data.memberIds)].filter(id => id !== userId);

        const partyId = await db.transaction(async (tx) => {
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
            const id = result[0].id;

            // 방장은 자동 수락
            await tx.insert(gamePartyMembers)
                .values({ partyId: id, attendeeId: userId, status: 'accepted' });

            // 나머지는 초대 대기
            for (const memberId of inviteeIds) {
                await tx.insert(gamePartyMembers)
                    .values({ partyId: id, attendeeId: memberId, status: 'pending' });
            }
            return id;
        });

        return { partyId, inviteeIds };
    },

    async updateParty(userId: number, partyId: number, data: {
        name: string;
        gameId: number | null;
        gameName: string | null;
        duration: number | null;
        guestCount: number;
        memberIds: number[];
    }): Promise<{ newInviteeIds: number[] }> {
        const check = await db
            .select()
            .from(gameParties)
            .where(and(eq(gameParties.id, partyId), eq(gameParties.ownerId, userId)));
        if (check.length === 0) throw new Error('Not authorized');

        const newMemberIds = [...new Set([userId, ...data.memberIds])];
        const newInviteeIds: number[] = [];

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

            // 현재 멤버 목록 조회
            const currentMembers = await tx
                .select({ attendeeId: gamePartyMembers.attendeeId, status: gamePartyMembers.status })
                .from(gamePartyMembers)
                .where(eq(gamePartyMembers.partyId, partyId));

            const currentMap = new Map(currentMembers.map(m => [m.attendeeId!, m.status!]));

            // 삭제: 새 목록에 없는 멤버 (방장 제외)
            for (const member of currentMembers) {
                if (member.attendeeId === userId) continue;
                if (!newMemberIds.includes(member.attendeeId!)) {
                    await tx.delete(gamePartyMembers)
                        .where(and(
                            eq(gamePartyMembers.partyId, partyId),
                            eq(gamePartyMembers.attendeeId, member.attendeeId!)
                        ));
                }
            }

            // 추가/재초대: 새 목록에 있지만 현재 없거나 declined인 멤버
            for (const memberId of newMemberIds) {
                if (memberId === userId) continue;
                const currentStatus = currentMap.get(memberId);

                if (currentStatus === undefined) {
                    // 새 멤버 추가
                    await tx.insert(gamePartyMembers)
                        .values({ partyId, attendeeId: memberId, status: 'pending' });
                    newInviteeIds.push(memberId);
                } else if (currentStatus === 'declined') {
                    // 거절했던 멤버 재초대
                    await tx.update(gamePartyMembers)
                        .set({ status: 'pending' })
                        .where(and(
                            eq(gamePartyMembers.partyId, partyId),
                            eq(gamePartyMembers.attendeeId, memberId)
                        ));
                    newInviteeIds.push(memberId);
                }
                // accepted/pending 상태는 그대로 유지
            }
        });

        return { newInviteeIds };
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
                eq(gamePartyMembers.attendeeId, attendeeId),
                eq(gamePartyMembers.status, 'accepted')
            ));
        return result.length > 0;
    },

    async acceptInvite(partyId: number, attendeeId: number): Promise<boolean> {
        const result = await db.update(gamePartyMembers)
            .set({ status: 'accepted' })
            .where(and(
                eq(gamePartyMembers.partyId, partyId),
                eq(gamePartyMembers.attendeeId, attendeeId),
                eq(gamePartyMembers.status, 'pending')
            ))
            .returning();
        return result.length > 0;
    },

    async declineInvite(partyId: number, attendeeId: number): Promise<boolean> {
        const result = await db.update(gamePartyMembers)
            .set({ status: 'declined' })
            .where(and(
                eq(gamePartyMembers.partyId, partyId),
                eq(gamePartyMembers.attendeeId, attendeeId),
                eq(gamePartyMembers.status, 'pending')
            ))
            .returning();
        return result.length > 0;
    },

    async getPendingInvitations(attendeeId: number) {
        return await db.execute(sql`
            SELECT gpm.party_id, gp.name as party_name,
                gp.game_name, g.name as resolved_game_name,
                a.name as owner_name, gp.owner_id
            FROM game_party_members gpm
            JOIN game_parties gp ON gpm.party_id = gp.id
            LEFT JOIN games g ON gp.game_id = g.id
            JOIN attendees a ON gp.owner_id = a.id
            WHERE gpm.attendee_id = ${attendeeId} AND gpm.status = 'pending'
            ORDER BY gpm.id DESC
        `);
    }
};

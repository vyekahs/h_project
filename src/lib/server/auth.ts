import { db } from '$lib/server/db/index';
import { sql, eq } from 'drizzle-orm';
import { users } from '$lib/server/db/schema/core';
import { adminSessions, attendeeSessions } from '$lib/server/db/schema/auth';
import crypto from 'crypto';

export async function getOrCreateAdminUser(): Promise<number> {
    const res = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, 'admin'));
    if (res.length > 0) {
        return res[0].id;
    }

    const insertRes = await db.insert(users)
        .values({ username: 'admin', passwordHash: 'metadatasession' })
        .returning({ id: users.id });
    return insertRes[0].id;
}

export async function createAdminSession(userId: number): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

    await db.insert(adminSessions)
        .values({ userId, sessionToken: token, expiresAt });

    return token;
}

export async function verifyAdminSession(token: string): Promise<boolean> {
    const result = await db
        .select()
        .from(adminSessions)
        .where(sql`session_token = ${token} AND expires_at > NOW()`);
    return result.length > 0;
}

export async function deleteAdminSession(token: string): Promise<void> {
    await db.delete(adminSessions)
        .where(eq(adminSessions.sessionToken, token));
}

export async function createAttendeeSession(attendeeId: number): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365);

    await db.insert(attendeeSessions)
        .values({ attendeeId, sessionToken: token, expiresAt });

    return token;
}

export async function verifyAttendeeSession(token: string): Promise<any | null> {
    const result = await db.execute(sql`
        SELECT a.id, a.name, a.can_manage_games, a.is_admin, a.penalty_points, a.is_blacklisted, a.season_pass_expires_at,
               t.title_name, t.title_code
        FROM attendee_sessions s
        JOIN attendees a ON s.attendee_id = a.id
        LEFT JOIN minigame_user_points up ON a.id = up.user_id
        LEFT JOIN minigame_titles t ON up.equipped_title_id = t.id
        WHERE s.session_token = ${token} AND s.expires_at > NOW()
    `);

    if (result.length > 0) {
        const row = result[0] as any;
        const user: any = {
            id: row.id,
            name: row.name,
            can_manage_games: row.can_manage_games,
            is_admin: row.is_admin,
            penalty_points: row.penalty_points,
            is_blacklisted: row.is_blacklisted,
            season_pass_expires_at: row.season_pass_expires_at,
        };
        if (row.title_name) {
            user.title = { title_name: row.title_name, title_code: row.title_code };
        }
        return user;
    }
    return null;
}

export async function deleteAttendeeSession(token: string): Promise<void> {
    await db.delete(attendeeSessions)
        .where(eq(attendeeSessions.sessionToken, token));
}

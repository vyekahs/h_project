import { query } from '$lib/server/db';
import crypto from 'crypto';

export async function getOrCreateAdminUser(): Promise<number> {
    const res = await query('SELECT id FROM users WHERE username = $1', ['admin']);
    if (res.rows.length > 0) {
        return res.rows[0].id;
    }
    
    // Create default admin user
    // Note: Password hash is dummy here since we use ENV for now, but we need a row.
    const insertRes = await query(
        'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id',
        ['admin', 'metadatasession'] 
    );
    return insertRes.rows[0].id;
}

export async function createAdminSession(userId: number): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days

    await query(
        'INSERT INTO admin_sessions (user_id, session_token, expires_at) VALUES ($1, $2, $3)',
        [userId, token, expiresAt]
    );

    return token;
}

export async function verifyAdminSession(token: string): Promise<boolean> {
    const result = await query(
        'SELECT * FROM admin_sessions WHERE session_token = $1 AND expires_at > NOW()',
        [token]
    );
    return result.rows.length > 0;
}

export async function deleteAdminSession(token: string): Promise<void> {
    await query('DELETE FROM admin_sessions WHERE session_token = $1', [token]);
}

// Attendee Auth Helpers
export async function createAttendeeSession(attendeeId: number): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365); // 1 year (matching old cookie)

    await query(
        'INSERT INTO attendee_sessions (attendee_id, session_token, expires_at) VALUES ($1, $2, $3)',
        [attendeeId, token, expiresAt]
    );

    return token;
}

export async function verifyAttendeeSession(token: string): Promise<any | null> {
    // Join with attendees to get permissions
    const result = await query(`
        SELECT a.id, a.name, a.can_manage_games, a.penalty_points, a.is_blacklisted, a.season_pass_expires_at
        FROM attendee_sessions s
        JOIN attendees a ON s.attendee_id = a.id
        WHERE s.session_token = $1 AND s.expires_at > NOW()
    `, [token]);
    
    if (result.rows.length > 0) {
        return result.rows[0];
    }
    return null;
}

export async function deleteAttendeeSession(token: string): Promise<void> {
    await query('DELETE FROM attendee_sessions WHERE session_token = $1', [token]);
}

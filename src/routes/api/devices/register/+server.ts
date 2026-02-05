
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import bcrypt from 'bcryptjs';

// POST /api/devices/register
// Called by Captive Portal (ESP32-S3)
// Logic: If user exists -> Login (verify password). If not -> Signup (create). Then register device.
export const POST: RequestHandler = async ({ request }) => {
    // Note: This endpoint is called by the ESP32, which acts as a proxy for the user.
    // Security Note: We are allowing password transmission here. Ensure HTTPS in production if possible.
    // For local dev/ESP32 AP, it might be HTTP.

    try {
        const body = await request.json();
        const { username, password, confirmPassword, irk, name: deviceName, mode } = body;

        // Default to 'login' if not specified, but UI should send it
        const action = mode || 'login';

        if (!username || !password || !irk || !deviceName) {
            return json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Validate IRK
        if (!/^[0-9a-fA-F]{32}$/.test(irk)) {
            return json({ error: 'Invalid IRK format' }, { status: 400 });
        }

        let userId: number;

        if (action === 'signup') {
            // --- SIGNUP FLOW ---
            if (!confirmPassword) {
                return json({ error: 'Confirm Password is required' }, { status: 400 });
            }
            if (password !== confirmPassword) {
                return json({ error: 'Passwords do not match' }, { status: 400 });
            }

            // Check if user exists
            const existing = await query('SELECT id FROM attendees WHERE name = $1', [username]);
            if (existing.rows.length > 0) {
                return json({ error: 'Username already exists' }, { status: 409 });
            }

            // Create User
            const hashedPassword = await bcrypt.hash(password, 10);
            const createRes = await query(
                'INSERT INTO attendees (name, password, status) VALUES ($1, $2, $3) RETURNING id',
                [username, hashedPassword, 'left']
            );
            userId = createRes.rows[0].id;

        } else {
            // --- LOGIN FLOW ---
            const userRes = await query('SELECT id, password FROM attendees WHERE name = $1', [username]);
            
            if (userRes.rows.length === 0) {
                 return json({ error: 'User not found' }, { status: 404 });
            }
            
            const user = userRes.rows[0];
            if (!user.password) {
                 return json({ error: 'Account has no password set' }, { status: 401 });
            }
            
            const match = await bcrypt.compare(password, user.password);
            if (!match) {
                return json({ error: 'Incorrect password' }, { status: 401 });
            }
            userId = user.id;
        }

        // 2. Register Device
        await query(
            'INSERT INTO user_devices (attendee_id, name, irk) VALUES ($1, $2, $3) ON CONFLICT (irk) DO UPDATE SET name = $2, attendee_id = $1', 
            [userId, deviceName, irk]
        );

        return json({ success: true, userId });

    } catch (e: any) {
        console.error('[API] Device Register Error', e);
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};

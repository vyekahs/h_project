
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query } from '$lib/server/db';
import { verifyAttendeeSession } from '$lib/server/auth';

// POST /api/devices/register
// Called by Captive Portal to register a user's device
export const POST: RequestHandler = async ({ request, cookies }) => {
    // 1. Auth Check (User must be logged in via session cookie on the captive portal, 
    //    or the captive portal passes a token. For now, assuming standard session cookie works if on same domain,
    //    OR if Captive Portal is external, it might need a different auth mechanism. 
    //    Standard assumption: Captive Portal is part of this app or bridges auth.)
    
    // If the User is using the Captive Portal on their phone, they are 'browsing' this web app?
    // User said: "Captive Portal login/signup page... click connect button... send ID and IRK to server".
    // This implies the user is authenticated on the "Captive Portal Web Page".
    
    const userSessionToken = cookies.get('user_session');
    if (!userSessionToken) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const user = await verifyAttendeeSession(userSessionToken);
    if (!user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { irk, name } = body;

        if (!irk || !name) {
            return json({ error: 'Missing irk or name' }, { status: 400 });
        }

        // Validate IRK
        if (!/^[0-9a-fA-F]{32}$/.test(irk)) {
            return json({ error: 'Invalid IRK format' }, { status: 400 });
        }

        await query(
            'INSERT INTO user_devices (attendee_id, name, irk) VALUES ($1, $2, $3)', 
            [user.id, name, irk]
        );

        return json({ success: true });
    } catch (e: any) {
        console.error('[API] Device Register Error', e);
        if (e.code === '23505') {
             return json({ error: 'Already registered IRK' }, { status: 409 });
        }
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
};

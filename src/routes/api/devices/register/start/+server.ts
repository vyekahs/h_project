
import { json } from '@sveltejs/kit';
import { DeviceRegistrationService } from '$lib/server/deviceRegistration';
import { query } from '$lib/server/db'; // Assuming access to verify user

// POST /api/devices/register/start
// User starts the flow.
export async function POST({ request, locals }) {
    // NOTE: In a real app we check locals.user or similar. 
    // For now assuming the client sends attendee_id or we use session.
    // Let's require body: { deviceId, attendeeId }
    
    try {
        const { deviceId, attendeeId } = await request.json();

        if (!deviceId || !attendeeId) {
            return json({ error: 'Missing deviceId or attendeeId' }, { status: 400 });
        }
        
        // Check if attendee exists
        const userCheck = await query('SELECT id FROM attendees WHERE id = $1', [attendeeId]);
        if (userCheck.rows.length === 0) {
            return json({ error: 'Invalid user' }, { status: 404 });
        }

        const result = await DeviceRegistrationService.startRegistration(deviceId, attendeeId);
        
        return json({ 
            success: true, 
            pin: result.pin, 
            expiresAt: result.expiresAt,
            regId: result.regId // Updated to match service change
        });

    } catch (e: any) {
        console.error('Registration Start Error Detail:', e);
        return json({ error: 'Server Error: ' + e.message }, { status: 500 });
    }
}

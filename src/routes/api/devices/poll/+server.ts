
import { json } from '@sveltejs/kit';
import { DeviceRegistrationService } from '$lib/server/deviceRegistration';

// GET /api/devices/poll?deviceId=XXXX
// ESP32 calls this to check if it should switch mode
export async function GET({ url }) {
    // For single device mode, deviceId might be irrelevant, but ESP32 sends it.
    // If missing, we can assume 'unknown' or just proceed since service handles wildcard.
    const deviceId = url.searchParams.get('deviceId') || 'unknown';
    
    try {
        const command = await DeviceRegistrationService.pollForDevice(deviceId);
        
        if (command) {
            return json({
                found: true,
                pin: command.pin,
                name: command.targetName,
                regId: command.regId // Added this
            });
        } else {
            return json({ found: false });
        }
    } catch (e) {
        return json({ error: 'Poll Error' }, { status: 500 });
    }
}

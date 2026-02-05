
import { json } from '@sveltejs/kit';
import { verifyAttendeeSession } from '$lib/server/auth';
import { TitleService } from '$lib/server/services/titleService';

export async function GET({ cookies }) {
    const sessionToken = cookies.get('session_id') || cookies.get('user_session');
    
    if (!sessionToken) {
        return json({ error: 'No session token found', cookies: cookies.getAll() });
    }

    const user = await verifyAttendeeSession(sessionToken);
    
    if (!user) {
        return json({ error: 'Session invalid or user not found', sessionToken });
    }

    try {
        const titles = await TitleService.getOwnedTitles(user.id);
        return json({ 
            success: true, 
            user: { id: user.id, name: user.name }, 
            titles 
        });
    } catch (e: any) {
        return json({ error: e.message, stack: e.stack });
    }
}

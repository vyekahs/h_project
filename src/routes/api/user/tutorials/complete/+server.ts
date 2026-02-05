import { json } from '@sveltejs/kit';
import { TutorialService } from '$lib/server/services/tutorialService';
import { verifyAttendeeSession } from '$lib/server/auth';

export async function POST({ request, cookies }) {
    const sessionToken = cookies.get('user_session');
    
    // Auth check
    let userId = 1; // Fallback
    if (sessionToken) {
        const user = await verifyAttendeeSession(sessionToken);
        if (user) userId = user.id;
        else return json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { tutorialId } = await request.json();
        
        if (!tutorialId) {
            return json({ error: 'Missing tutorialId' }, { status: 400 });
        }

        const success = await TutorialService.completeTutorial(userId, tutorialId);
        
        if (success) {
            return json({ success: true, tutorialId });
        } else {
            return json({ error: 'Failed to update progress' }, { status: 500 });
        }
    } catch (e) {
        console.error('Tutorial complete error', e);
        return json({ error: 'Internal Error' }, { status: 500 });
    }
}

import { json } from '@sveltejs/kit';
import { ShopService } from '$lib/server/services/shopService';
import { verifyAttendeeSession } from '$lib/server/auth';

export async function POST({ request, cookies }) {
    const sessionToken = cookies.get('user_session');
    let userId = 1; // Fallback

    if (sessionToken) {
        const user = await verifyAttendeeSession(sessionToken);
        if (user) {
            userId = user.id;
        } else {
             return json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }
    } else {
         // Should we allow guest? Ideally no for shopping/using items.
         // fallback to 1 for dev or return 401
         // return json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    
    try {
        const { itemCode } = await request.json();
        
        if (!itemCode) {
            return json({ error: 'Item code required' }, { status: 400 });
        }
        
        const success = await ShopService.useItem(userId, itemCode);
        
        if (success) {
            return json({ success: true, message: 'Item used' });
        } else {
            return json({ success: false, message: 'Failed to use item (not in inventory or invalid)' }, { status: 400 });
        }
    } catch (e) {
        console.error('Use item failed', e);
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

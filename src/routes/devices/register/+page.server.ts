
import { redirect } from '@sveltejs/kit';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
    // In a real app we'd redirect if not logged in.
    // For now, pass a mock user if locals.user is missing, or relies on client fetch.
    
    // Assuming hooks handle auth and populate locals.user
    // If not, returns empty user object which client handles fallbacks for.
    return {
        user: locals.user || { id: 1, name: '홍길동(Demo)' } 
    };
}

import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ parent, url }) => {
    // 1. Get parent data (which comes from root layout)
    const data = await parent();

    // 2. Exception: Allow access to login page
    if (url.pathname.startsWith('/admin/login')) {
        return;
    }

    // 3. Check for valid permissions
    // Case A: Global Admin (via admin_session cookie)
    if (data.isAdmin) {
        return;
    }

    // Case B: User Admin (via user_session cookie + is_admin flag)
    if (data.user && data.user.is_admin) {
        return;
    }

    // 4. If neither, redirect
    if (!data.user) {
        // Not logged in at all -> Login page
        throw redirect(303, '/admin/login');
    } else {
        // Logged in as non-admin -> Home
        throw redirect(303, '/');
    }
};

import type { LayoutServerLoad } from './$types';
import { TitleService } from '$lib/server/services/titleService';

export const load: LayoutServerLoad = async ({ locals }) => {
    // hooks.server.ts에서 이미 verifyAttendeeSession으로 locals.user를 설정함
    let user = locals.user || null;

    if (user) {
        try {
            const title = await TitleService.getUserTitle(user.id);
            if (title) {
                user = { ...user, title };
            }
        } catch (e) {
            console.error('Layout title fetch error', e);
        }
    }

    return {
        user,
        isAdmin: locals.isAdmin || false
    };
};

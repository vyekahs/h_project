import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
    // hooks.server.ts의 verifyAttendeeSession에서 user + title 모두 조회 완료
    return {
        user: locals.user || null,
        isAdmin: locals.isAdmin || false
    };
};

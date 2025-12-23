import { startAutoCloseScheduler } from '$lib/server/autoClose';

// Start the scheduler when the server starts
startAutoCloseScheduler();

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
    if (event.url.pathname.startsWith('/admin')) {
        const auth = event.cookies.get('admin_auth');
        if (auth !== 'true') {
            return new Response('Redirect', {
                status: 303,
                headers: { Location: '/login' }
            });
        }
    }

	const response = await resolve(event);
	return response;
}

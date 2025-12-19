import { startAutoCloseScheduler } from '$lib/server/autoClose';

// Start the scheduler when the server starts
startAutoCloseScheduler();

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
	const response = await resolve(event);
	return response;
}

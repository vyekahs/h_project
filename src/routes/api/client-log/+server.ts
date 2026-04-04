import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const body = await request.json();
        const { context, error, meta } = body;
        console.error(`[CLIENT] ${context} | ${error}`, meta ? JSON.stringify(meta) : '');
    } catch {
        // sendBeacon sends text/plain, try parsing raw text
        try {
            const text = await request.text();
            const { context, error, meta } = JSON.parse(text);
            console.error(`[CLIENT] ${context} | ${error}`, meta ? JSON.stringify(meta) : '');
        } catch {
            // ignore malformed
        }
    }
    return json({ ok: true });
};

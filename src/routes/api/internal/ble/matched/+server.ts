import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import {
	ensureCachesLoaded,
	updateLastSeenBle,
	calculateAutoOpenWindow,
	processAutoCheckin,
	checkAutoCheckout
} from '$lib/server/ble';

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'ble_internal_secret_2026';

export const POST: RequestHandler = async ({ request }) => {
	const key = request.headers.get('x-internal-key');
	if (key !== INTERNAL_API_KEY) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { scanner_id, matched_attendee_ids, is_last_batch, source } = await request.json();

		const actualScannerId = scanner_id || 'unknown_scanner';

		// Scanner heartbeat (fire-and-forget)
		db.execute(sql`
			INSERT INTO scanners (id, last_seen_at, status)
			VALUES (${actualScannerId}, NOW(), 'active')
			ON CONFLICT (id) DO UPDATE
			SET last_seen_at = NOW(), status = 'active'
		`).catch((e) => {
			console.error('Failed to update scanner heartbeat', e);
		});

		// Update lastSeenBleMap
		const now = Date.now();
		const detectedAttendeeIds = new Set<number>();
		for (const id of matched_attendee_ids || []) {
			updateLastSeenBle(id, now);
			detectedAttendeeIds.add(id);
		}

		// Run auto-checkin
		await ensureCachesLoaded(source || 'BLE');
		const isWithinAutoOpenWindow = calculateAutoOpenWindow();
		await processAutoCheckin(detectedAttendeeIds, isWithinAutoOpenWindow, source || 'BLE');

		// Run auto-checkout on last batch
		if (is_last_batch) {
			await checkAutoCheckout();
		}

		return json({ success: true });
	} catch (e) {
		console.error('[Internal BLE] Error:', e);
		return json({ error: 'Internal Server Error' }, { status: 500 });
	}
};

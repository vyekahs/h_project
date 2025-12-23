import { query } from '$lib/server/db';
import { json } from '@sveltejs/kit';

export async function POST() {
    try {
        await query('BEGIN');

        // 1. Get all unique names
        const namesResult = await query('SELECT DISTINCT name FROM attendees');
        const names = namesResult.rows.map((r: any) => r.name);

        for (const name of names) {
            // Get all records for this name, ordered by arrival_time (earliest first)
            const recordsResult = await query('SELECT * FROM attendees WHERE name = $1 ORDER BY id ASC', [name]);
            const records = recordsResult.rows;

            if (records.length === 0) continue;

            // Master ID is the first one (earliest)
            const masterId = records[0].id;

            // Create visits for ALL records (including master)
            for (const record of records) {
                let departureTime = null;
                if (record.status === 'left') {
                    departureTime = record.updated_at || record.arrival_time;
                }
                
                await query(
                    'INSERT INTO visits (attendee_id, arrival_time, departure_time) VALUES ($1, $2, $3)',
                    [masterId, record.arrival_time, departureTime]
                );
            }

            // If there are duplicates to merge
            if (records.length > 1) {
                const duplicateIds = records.slice(1).map((r: any) => r.id);
                
                // Update game history to point to Master ID
                await query(
                    'UPDATE session_participants SET attendee_id = $1 WHERE attendee_id = ANY($2)',
                    [masterId, duplicateIds]
                );

                // Delete duplicates
                await query(
                    'DELETE FROM attendees WHERE id = ANY($1)',
                    [duplicateIds]
                );
            }
            
            // Ensure Master status reflects the LATEST record's status
            const latestRecord = records[records.length - 1];
            await query(
                'UPDATE attendees SET status = $1, updated_at = $2 WHERE id = $3',
                [latestRecord.status, latestRecord.updated_at, masterId]
            );
        }

        await query('COMMIT');
        return json({ success: true, message: 'Migration completed' });
    } catch (error) {
        await query('ROLLBACK');
        console.error(error);
        return json({ success: false, error: String(error) });
    }
}

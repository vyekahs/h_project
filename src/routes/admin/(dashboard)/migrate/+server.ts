import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { json } from '@sveltejs/kit';

export async function POST() {
    try {
        await db.transaction(async (tx) => {
            // 1. Get all unique names
            const namesResult = await tx.execute(sql`SELECT DISTINCT name FROM attendees`);
            const names = (namesResult as any[]).map((r: any) => r.name);

            for (const name of names) {
                // Get all records for this name, ordered by arrival_time (earliest first)
                const recordsResult = await tx.execute(sql`SELECT * FROM attendees WHERE name = ${name} ORDER BY id ASC`);
                const records = recordsResult as any[];

                if (records.length === 0) continue;

                // Master ID is the first one (earliest)
                const masterId = records[0].id;

                // Create visits for ALL records (including master)
                for (const record of records) {
                    let departureTime = null;
                    if (record.status === 'left') {
                        departureTime = record.updated_at || record.arrival_time;
                    }

                    await tx.execute(
                        sql`INSERT INTO visits (attendee_id, arrival_time, departure_time) VALUES (${masterId}, ${record.arrival_time instanceof Date ? record.arrival_time.toISOString() : record.arrival_time}, ${departureTime instanceof Date ? departureTime.toISOString() : departureTime})`
                    );
                }

                // If there are duplicates to merge
                if (records.length > 1) {
                    const duplicateIds = records.slice(1).map((r: any) => r.id);

                    // Update game history to point to Master ID
                    await tx.execute(
                        sql`UPDATE session_participants SET attendee_id = ${masterId} WHERE attendee_id = ANY(${'{' + duplicateIds.join(',') + '}'}::int[])`
                    );

                    // Delete duplicates
                    await tx.execute(
                        sql`DELETE FROM attendees WHERE id = ANY(${'{' + duplicateIds.join(',') + '}'}::int[])`
                    );
                }

                // Ensure Master status reflects the LATEST record's status
                const latestRecord = records[records.length - 1];
                await tx.execute(
                    sql`UPDATE attendees SET status = ${latestRecord.status}, updated_at = ${latestRecord.updated_at instanceof Date ? latestRecord.updated_at.toISOString() : latestRecord.updated_at} WHERE id = ${masterId}`
                );
            }
        });

        return json({ success: true, message: 'Migration completed' });
    } catch (error) {
        console.error(error);
        return json({ success: false, error: String(error) });
    }
}

import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { updateSettingsCache } from '$lib/server/ble';

export const load: PageServerLoad = async () => {
    const settingsResult = await db.execute(sql`SELECT key, value FROM system_settings`);
    const settings = (settingsResult as any[]).reduce((acc: any, row: any) => {
        acc[row.key] = row.value;
        return acc;
    }, {
        closing_time_weekday: '22:00',
        closing_time_weekend: '23:00',
        weekend_days: '5,6',
        is_open: 'true',
        opening_time: '09:00',
        no_show_limit_minutes: '10',
        auto_dissolve_limit_minutes: '10',
        penalty_threshold: '3'
    });

    return {
        settings
    };
};

export const actions: Actions = {
    updateSettings: async ({ request }) => {
        const data = await request.formData();
        const updates = [
            'closing_time_weekday',
            'closing_time_weekend',
            'opening_time',
            'weekend_days',
            'no_show_limit_minutes',
            'auto_dissolve_limit_minutes',
            'penalty_threshold'
        ];

        try {
            await db.transaction(async (tx) => {
                for (const key of updates) {
                    const value = data.get(key)?.toString();
                    if (value !== undefined) {
                        await tx.execute(
                            sql`INSERT INTO system_settings (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO UPDATE SET value = ${value}`
                        );
                    }
                }
            });
            // BLE 설정 캐시 동기화
            const openingTime = data.get('opening_time')?.toString();
            if (openingTime) updateSettingsCache(true, openingTime);
            return { success: true };
        } catch (e) {
            return fail(500, { error: '설정 저장 실패' });
        }
    }
};

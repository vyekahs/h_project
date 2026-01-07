import { query } from '$lib/server/db';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
    const settingsResult = await query('SELECT key, value FROM system_settings');
    const settings = settingsResult.rows.reduce((acc: any, row: any) => {
        acc[row.key] = row.value;
        return acc;
    }, {
        closing_time_weekday: '22:00',
        closing_time_weekend: '23:00',
        weekend_days: '5,6',
        is_open: 'true',
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
            'weekend_days',
            'no_show_limit_minutes',
            'auto_dissolve_limit_minutes',
            'penalty_threshold'
        ];

        try {
            await query('BEGIN');
            for (const key of updates) {
                const value = data.get(key)?.toString();
                if (value !== undefined) {
                    await query(
                        'INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
                        [key, value]
                    );
                }
            }
            await query('COMMIT');
            return { success: true };
        } catch (e) {
            await query('ROLLBACK');
            return fail(500, { error: '설정 저장 실패' });
        }
    }
};

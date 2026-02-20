import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { translate } from 'google-translate-api-x';
import * as cheerio from 'cheerio';
import { verifyAdminSession, verifyAttendeeSession } from '$lib/server/auth';

export const load: PageServerLoad = async ({ cookies, request }) => {
    const result = await db.execute(sql`SELECT * FROM games WHERE is_active = true ORDER BY name ASC`);

    // Auth Check for UI rendering
    const userSessionToken = cookies.get('user_session');
    let user = null;
    if (userSessionToken) {
        try {
            user = await verifyAttendeeSession(userSessionToken);
        } catch (e) {
            console.error('Failed to verify user session', e);
        }
    }

    // Admin Check
    // Admin Check
    const sessionToken = cookies.get('admin_session');
    const isAdmin = sessionToken ? await verifyAdminSession(sessionToken) : false;

    return {
        games: result as any[],
        user,
        isAdmin
    };
};

export const actions: Actions = {
    searchBgg: async ({ request, cookies }) => {
        const data = await request.formData();
        const queryStr = data.get('query')?.toString();

        // Permission Check
        // Permission Check
        const sessionToken = cookies.get('admin_session');
        const isAdmin = sessionToken ? await verifyAdminSession(sessionToken) : false;
        const userSessionToken = cookies.get('user_session');

        if (!isAdmin) {
             if (!userSessionToken) return fail(401, { error: 'Unauthorized' });
             const user = await verifyAttendeeSession(userSessionToken);
             if (!user || !user.can_manage_games) return fail(403, { error: '권한이 없습니다.' });
        }

        if (!queryStr) {
            return fail(400, { error: '검색어를 입력해주세요.' });
        }

        try {
            const response = await fetch(
                `https://api.geekdo.com/api/geekitems?nosession=1&objecttype=thing&subtype=boardgame&search=${encodeURIComponent(queryStr)}&pagesize=20`
            );
            if (!response.ok) {
                return fail(500, { error: `BGG API 오류 (${response.status})` });
            }
            const json = await response.json();
            const games = (json.items || []).map((item: any) => ({
                id: String(item.objectid),
                name: item.name,
                year: item.yearpublished || ''
            }));

            return { success: true, bggGames: games };
        } catch (err) {
            console.error('[BGG Search Error]', err);
            return fail(500, { error: 'BGG 검색 중 오류가 발생했습니다.' });
        }
    },

    importBgg: async ({ request, cookies }) => {
        const data = await request.formData();
        const bggId = data.get('bggId');

        // Permission Check
        // Permission Check
        const sessionToken = cookies.get('admin_session');
        const isAdmin = sessionToken ? await verifyAdminSession(sessionToken) : false;
        const userSessionToken = cookies.get('user_session');

        if (!isAdmin) {
             if (!userSessionToken) return fail(401, { error: 'Unauthorized' });
             const user = await verifyAttendeeSession(userSessionToken);
             if (!user || !user.can_manage_games) return fail(403, { error: '권한이 없습니다.' });
        }

        if (!bggId) {
            return fail(400, { error: 'BGG ID가 없습니다.' });
        }

        try {
            const [itemRes, dynamicRes] = await Promise.all([
                fetch(`https://api.geekdo.com/api/geekitems?nosession=1&objecttype=thing&objectid=${bggId}`),
                fetch(`https://api.geekdo.com/api/dynamicinfo?nosession=1&objecttype=thing&objectid=${bggId}`)
            ]);
            const itemJson = await itemRes.json();
            const dynamicJson = await dynamicRes.json();
            const item = itemJson.item;
            const dynamic = dynamicJson.item;

            if (!item) {
                throw new Error('Could not find game data on BGG');
            }

            let name = item.name;
            const minPlayers = parseInt(item.minplayers || '0');
            const maxPlayers = parseInt(item.maxplayers || '0');
            const playtimeMin = parseInt(item.minplaytime || '0');
            const playtimeMax = parseInt(item.maxplaytime || '0');
            const minAge = parseInt(item.minage || '0');

            // Clean Description
            let description = item.description || '';
            description = cheerio.load(description).text();

            const searchName = data.get('searchName')?.toString();
            const hasKorean = (str: string) => /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(str);

            // Translate
            try {
                if (searchName && hasKorean(searchName)) {
                    if (searchName.trim() !== name.trim()) {
                        name = `${searchName} (${name})`;
                    }
                    const descRes = await translate(description, { to: 'ko' });
                    // @ts-ignore
                    description = descRes.text;
                } else {
                    const [nameRes, descRes] = await Promise.all([
                        translate(name, { to: 'ko' }),
                        translate(description, { to: 'ko' })
                    ]);

                    // @ts-ignore
                    const translatedName = nameRes.text;
                    if (translatedName && translatedName.trim() !== name.trim()) {
                        name = `${translatedName} (${name})`;
                    }

                    // @ts-ignore
                    description = descRes.text;
                }
            } catch (tErr) {
                console.error('[Translation Error]', tErr);
            }

            const imageUrl = item.imageurl || item.images?.medium || '';

            let complexity = 0;
            if (dynamic?.stats?.avgweight) {
                complexity = parseFloat(dynamic.stats.avgweight);
            }

            let bestPlayers = "";
            if (dynamic?.polls?.userplayers?.best) {
                const best = dynamic.polls.userplayers.best;
                bestPlayers = best.map((b: any) => {
                    if (b.min === b.max) return b.min;
                    return `${b.min}-${b.max}`;
                }).join(', ');
            }

            await db.execute(sql`
                INSERT INTO games (name, min_players, max_players, playtime_min, max_playtime, min_age, complexity, best_players, description, image_url, bgg_id)
                VALUES (${name}, ${minPlayers}, ${maxPlayers}, ${playtimeMin}, ${playtimeMax}, ${minAge}, ${complexity.toFixed(2)}, ${bestPlayers}, ${description}, ${imageUrl}, ${bggId})
                ON CONFLICT (bgg_id) DO UPDATE SET
                name = EXCLUDED.name, min_players = EXCLUDED.min_players, max_players = EXCLUDED.max_players,
                playtime_min = EXCLUDED.playtime_min, max_playtime = EXCLUDED.max_playtime, min_age = EXCLUDED.min_age,
                complexity = EXCLUDED.complexity, best_players = EXCLUDED.best_players, description = EXCLUDED.description,
                image_url = EXCLUDED.image_url
            `);

            return { success: true, imported: true };
        } catch (err) {
            console.error('[BGG Import Error]', err);
            return fail(500, { error: 'BGG 가져오기 중 오류가 발생했습니다.' });
        }
    }
};

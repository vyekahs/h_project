import { query } from '$lib/server/db';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { translate } from 'google-translate-api-x';
import * as cheerio from 'cheerio';
import { verifyAdminSession, verifyAttendeeSession } from '$lib/server/auth';

const BGG_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
};

export const load: PageServerLoad = async ({ cookies, request }) => {
    const result = await query('SELECT * FROM games WHERE is_active = true ORDER BY name ASC');
    
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
        games: result.rows,
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
            const response = await fetch(`https://boardgamegeek.com/search/boardgame?q=${encodeURIComponent(queryStr)}`, {
                headers: BGG_HEADERS
            });
            const html = await response.text();
            const $ = cheerio.load(html);
            const games: any[] = [];

            $('#collectionitems tr').each((i, el) => {
                if (i === 0) return; // Skip header

                const nameLink = $(el).find('.collection_objectname a');
                if (nameLink.length === 0) return;

                const href = nameLink.attr('href');
                const idMatch = href?.match(/\/boardgame\/(\d+)\//);
                const id = idMatch ? idMatch[1] : null;
                const name = nameLink.text().trim();
                const year = $(el).find('.collection_objectname .smallerfont').text().trim().replace(/[()]/g, '');

                if (id && name) {
                    games.push({ id, name, year });
                }
            });

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
            const response = await fetch(`https://boardgamegeek.com/boardgame/${bggId}`, {
                headers: BGG_HEADERS
            });
            const html = await response.text();
            const $ = cheerio.load(html);
            
            // Extract data from GEEK.geekitemPreload
            const scripts = $('script').map((i, el) => $(el).html()).get();
            const preloadScript = scripts.find(s => s && s.includes('GEEK.geekitemPreload'));
            
            if (!preloadScript) {
                throw new Error('Could not find game data on BGG page');
            }

            // Extract JSON object
            const match = preloadScript.match(/GEEK\.geekitemPreload\s*=\s*({.*?});/s);
            if (!match) {
                throw new Error('Could not parse game data');
            }

            const gameData = JSON.parse(match[1]);
            const item = gameData.item;
            
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
            
            let imageUrl = $('meta[property="og:image"]').attr('content') || '';

            let complexity = 0;
            if (item.stats && item.stats.avgweight) {
                complexity = parseFloat(item.stats.avgweight);
            }

            let bestPlayers = "";
            if (item.polls && item.polls.userplayers && item.polls.userplayers.best) {
                const best = item.polls.userplayers.best;
                bestPlayers = best.map((b: any) => {
                    if (b.min === b.max) return b.min;
                    return `${b.min}-${b.max}`;
                }).join(', ');
            }

            await query(
                `INSERT INTO games (name, min_players, max_players, playtime_min, max_playtime, min_age, complexity, best_players, description, image_url, bgg_id) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                 ON CONFLICT (bgg_id) DO UPDATE SET
                 name = EXCLUDED.name, min_players = EXCLUDED.min_players, max_players = EXCLUDED.max_players,
                 playtime_min = EXCLUDED.playtime_min, max_playtime = EXCLUDED.max_playtime, min_age = EXCLUDED.min_age,
                 complexity = EXCLUDED.complexity, best_players = EXCLUDED.best_players, description = EXCLUDED.description,
                 image_url = EXCLUDED.image_url`,
                [name, minPlayers, maxPlayers, playtimeMin, playtimeMax, minAge, complexity.toFixed(2), bestPlayers, description, imageUrl, bggId]
            );

            return { success: true, imported: true };
        } catch (err) {
            console.error('[BGG Import Error]', err);
            return fail(500, { error: 'BGG 가져오기 중 오류가 발생했습니다.' });
        }
    }
};

import { query } from '$lib/server/db';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import * as cheerio from 'cheerio';
import { translate } from 'google-translate-api-x';

export const load: PageServerLoad = async () => {
    const result = await query('SELECT * FROM games ORDER BY name ASC');
    return {
        games: result.rows
    };
};

const BGG_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
};

export const actions: Actions = {
    create: async ({ request }) => {
        const data = await request.formData();
        const name = data.get('name');
        const minPlayers = data.get('min_players');
        const maxPlayers = data.get('max_players');
        const playtimeMin = data.get('playtime_min');
        const complexity = data.get('complexity');
        const description = data.get('description');
        const imageUrl = data.get('image_url');
        const includedDlcs = data.get('included_dlcs');

        try {
            await query(
                `INSERT INTO games (name, min_players, max_players, playtime_min, complexity, description, image_url, included_dlcs) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [name, minPlayers, maxPlayers, playtimeMin, complexity, description, imageUrl, includedDlcs]
            );
            return { success: true };
        } catch (err) {
            console.error(err);
            return fail(500, { error: '게임 추가 중 오류가 발생했습니다.' });
        }
    },

    update: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id');
        const name = data.get('name');
        const minPlayers = data.get('min_players');
        const maxPlayers = data.get('max_players');
        const playtimeMin = data.get('playtime_min');
        const complexity = data.get('complexity');
        const description = data.get('description');
        const imageUrl = data.get('image_url');
        const includedDlcs = data.get('included_dlcs');

        try {
            await query(
                `UPDATE games SET 
                 name = $1, min_players = $2, max_players = $3, playtime_min = $4, 
                 complexity = $5, description = $6, image_url = $7, included_dlcs = $8
                 WHERE id = $9`,
                [name, minPlayers, maxPlayers, playtimeMin, complexity, description, imageUrl, includedDlcs, id]
            );
            return { success: true };
        } catch (err) {
            console.error(err);
            return fail(500, { error: '게임 수정 중 오류가 발생했습니다.' });
        }
    },

    delete: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id');

        try {
            await query('DELETE FROM games WHERE id = $1', [id]);
            return { success: true };
        } catch (err) {
            console.error(err);
            return fail(500, { error: '게임 삭제 중 오류가 발생했습니다.' });
        }
    },

    searchBgg: async ({ request }) => {
        const data = await request.formData();
        const queryStr = data.get('query')?.toString();

        console.log(`[BGG Search] Query: ${queryStr}`);

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

            console.log(`[BGG Search] Found ${games.length} items`);
            return { success: true, bggGames: games };
        } catch (err) {
            console.error('[BGG Search Error]', err);
            return fail(500, { error: 'BGG 검색 중 오류가 발생했습니다.' });
        }
    },

    importBgg: async ({ request }) => {
        const data = await request.formData();
        const bggId = data.get('bggId');

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
            
            // Clean Description (remove HTML)
            let description = item.description || '';
            // Decode HTML entities and strip tags
            description = cheerio.load(description).text();

            // Translate Name and Description
            try {
                const [nameRes, descRes] = await Promise.all([
                    translate(name, { to: 'ko' }),
                    translate(description, { to: 'ko' })
                ]);
                
                // @ts-ignore
                const translatedName = nameRes.text;
                // Combine Korean and English name if they are different
                if (translatedName && translatedName.trim() !== name.trim()) {
                    name = `${translatedName} (${name})`;
                }
                
                // @ts-ignore
                description = descRes.text;
            } catch (tErr) {
                console.error('[Translation Error]', tErr);
                // Fallback to original if translation fails
            }
            
            // Image
            let imageUrl = $('meta[property="og:image"]').attr('content') || '';

            // Complexity (Average Weight)
            let complexity = 0;
            if (item.stats && item.stats.avgweight) {
                complexity = parseFloat(item.stats.avgweight);
            }

            // Best Players
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

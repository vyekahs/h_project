import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { searchBggGames, fetchAndTranslateBggGame } from '$lib/server/bgg';

/** 빈 문자열은 0이 아니라 "미입력"이다 — null로 넣어야 화면이 구분할 수 있다 */
function blankToNull(v: FormDataEntryValue | null) {
    const s = v?.toString().trim();
    return s ? s : null;
}

export const load: PageServerLoad = async () => {
    // has_history: 이 게임으로 진행된 세션이 하나라도 있는지.
    // 삭제 버튼이 "삭제인지 비활성화인지"를 서버만 알던 것을 화면도 알게 한다.
    const result = await db.execute(sql`
        SELECT g.*,
               EXISTS(SELECT 1 FROM game_sessions gs WHERE gs.game_id = g.id) AS has_history
        FROM games g
        ORDER BY g.name ASC
    `);
    return {
        games: result as any[]
    };
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
        // 상세 모달이 표시하던 세 필드 — 지금까지 폼에도 SQL에도 없어서
        // 손으로 넣은 게임은 영구히 "분~분 / 연령 -" 상태였다
        const maxPlaytime = blankToNull(data.get('max_playtime'));
        const minAge = blankToNull(data.get('min_age'));
        const bestPlayers = blankToNull(data.get('best_players'));

        if (!name?.toString().trim()) return fail(400, { error: '게임 이름을 입력해주세요.' });

        try {
            await db.execute(sql`
                INSERT INTO games (name, min_players, max_players, playtime_min, max_playtime, min_age, best_players, complexity, description, image_url, included_dlcs)
                VALUES (${name}, ${minPlayers}, ${maxPlayers}, ${playtimeMin}, ${maxPlaytime}, ${minAge}, ${bestPlayers}, ${complexity}, ${description}, ${imageUrl}, ${includedDlcs})
            `);
            return { success: true, savedName: name.toString() };
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
        const maxPlaytime = blankToNull(data.get('max_playtime'));
        const minAge = blankToNull(data.get('min_age'));
        const bestPlayers = blankToNull(data.get('best_players'));

        if (!name?.toString().trim()) return fail(400, { error: '게임 이름을 입력해주세요.' });

        try {
            await db.execute(sql`
                UPDATE games SET
                name = ${name}, min_players = ${minPlayers}, max_players = ${maxPlayers}, playtime_min = ${playtimeMin},
                max_playtime = ${maxPlaytime}, min_age = ${minAge}, best_players = ${bestPlayers},
                complexity = ${complexity}, description = ${description}, image_url = ${imageUrl}, included_dlcs = ${includedDlcs}
                WHERE id = ${id}
            `);
            return { success: true, savedName: name?.toString() ?? '' };
        } catch (err) {
            console.error(err);
            return fail(500, { error: '게임 수정 중 오류가 발생했습니다.' });
        }
    },

    /**
     * 비활성화 — 항상 가능하고 되돌릴 수 있다. 목록에서 내리되 기록은 남긴다.
     * 이전에는 "삭제" 버튼 하나가 기록 유무에 따라 삭제 또는 비활성화로 갈렸고,
     * 운영자는 무엇이 일어났는지 알 수 없었다. 이제 결과가 버튼 이름과 같다.
     */
    deactivate: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id');
        if (!id) return fail(400, { error: '잘못된 요청입니다.' });

        try {
            const rows = await db.execute(sql`UPDATE games SET is_active = false WHERE id = ${id} RETURNING name`);
            const name = (rows as any[])[0]?.name ?? '';
            if (!name) return fail(404, { error: '게임을 찾을 수 없습니다.' });
            return { success: true, deactivatedName: name };
        } catch (err) {
            console.error(err);
            return fail(500, { error: '비활성화 중 오류가 발생했습니다.' });
        }
    },

    /** 완전 삭제 — 플레이 기록이 없을 때만. 기록이 있으면 거절하고 이유를 말한다. */
    delete: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id');
        if (!id) return fail(400, { error: '잘못된 요청입니다.' });

        try {
            const info = await db.execute(sql`SELECT name FROM games WHERE id = ${id}`);
            const name = (info as any[])[0]?.name;
            if (!name) return fail(404, { error: '게임을 찾을 수 없습니다.' });

            const sessions = await db.execute(sql`SELECT id FROM game_sessions WHERE game_id = ${id} LIMIT 1`);
            if (sessions.length > 0) {
                return fail(409, {
                    error: `"${name}"은(는) 플레이 기록이 있어 완전 삭제할 수 없습니다. 비활성화로 목록에서 내릴 수 있습니다.`
                });
            }

            await db.execute(sql`DELETE FROM games WHERE id = ${id}`);
            return { success: true, deletedName: name };
        } catch (err) {
            console.error(err);
            return fail(500, { error: '삭제 중 오류가 발생했습니다.' });
        }
    },

    reactivate: async ({ request }) => {
        const data = await request.formData();
        const id = data.get('id');

        try {
            const rows = await db.execute(sql`UPDATE games SET is_active = true WHERE id = ${id} RETURNING name`);
            return { success: true, reactivatedName: (rows as any[])[0]?.name ?? '' };
        } catch (err) {
            console.error(err);
            return fail(500, { error: '게임 복구 중 오류가 발생했습니다.' });
        }
    },

    searchBgg: async ({ request }) => {
        const data = await request.formData();
        const queryStr = data.get('query')?.toString();

        if (!queryStr) {
            return fail(400, { error: '검색어를 입력해주세요.' });
        }

        try {
            const games = await searchBggGames(queryStr);
            return { success: true, bggGames: games };
        } catch (err) {
            console.error('[BGG Search Error]', err);
            return fail(500, { error: err instanceof Error ? err.message : 'BGG 검색 중 오류가 발생했습니다.' });
        }
    },

    /**
     * BGG 가져오기.
     *
     * 이미 등록된 게임이면 곧바로 덮어쓰지 않는다. 무엇이 어떻게 바뀌는지
     * 필드 단위로 돌려주고, 운영자가 고른 필드만 확정 단계에서 반영한다.
     * 이전에는 커버를 고치려고 재수입하면 손으로 쓴 한글 설명이 조용히 사라졌다.
     */
    importBgg: async ({ request }) => {
        const data = await request.formData();
        const bggId = data.get('bggId')?.toString();
        const confirmed = data.get('confirmed') === 'true';

        if (!bggId) {
            return fail(400, { error: 'BGG ID가 없습니다.' });
        }

        try {
            const searchName = data.get('searchName')?.toString();
            const game = await fetchAndTranslateBggGame(bggId, searchName);

            const existingRows = await db.execute(sql`SELECT * FROM games WHERE bgg_id = ${bggId}`);
            const existing = (existingRows as any[])[0];

            if (existing && !confirmed) {
                const FIELDS: { key: string; label: string; next: any }[] = [
                    { key: 'name', label: '이름', next: game.name },
                    { key: 'description', label: '설명', next: game.description },
                    { key: 'image_url', label: '이미지', next: game.imageUrl },
                    { key: 'min_players', label: '최소 인원', next: game.minPlayers },
                    { key: 'max_players', label: '최대 인원', next: game.maxPlayers },
                    { key: 'playtime_min', label: '플레이 시간', next: game.playtimeMin },
                    { key: 'max_playtime', label: '최대 시간', next: game.playtimeMax },
                    { key: 'min_age', label: '연령', next: game.minAge },
                    { key: 'best_players', label: '베스트 인원', next: game.bestPlayers },
                    { key: 'complexity', label: '난이도', next: Number(game.complexity.toFixed(2)) }
                ];
                const changes = FIELDS.filter(
                    (f) => String(existing[f.key] ?? '') !== String(f.next ?? '')
                ).map((f) => ({
                    key: f.key,
                    label: f.label,
                    before: existing[f.key] ?? null,
                    after: f.next ?? null
                }));

                return {
                    success: true,
                    needsConfirm: true,
                    bggId,
                    existingName: existing.name as string,
                    changes
                };
            }

            const keepKeys = data.getAll('keep').map(String);
            const keep = (key: string, incoming: any) =>
                existing && keepKeys.includes(key) ? existing[key] : incoming;

            await db.execute(sql`
                INSERT INTO games (name, min_players, max_players, playtime_min, max_playtime, min_age, complexity, best_players, description, image_url, bgg_id)
                VALUES (${keep('name', game.name)}, ${keep('min_players', game.minPlayers)}, ${keep('max_players', game.maxPlayers)},
                        ${keep('playtime_min', game.playtimeMin)}, ${keep('max_playtime', game.playtimeMax)}, ${keep('min_age', game.minAge)},
                        ${keep('complexity', game.complexity.toFixed(2))}, ${keep('best_players', game.bestPlayers)},
                        ${keep('description', game.description)}, ${keep('image_url', game.imageUrl)}, ${bggId})
                ON CONFLICT (bgg_id) DO UPDATE SET
                name = EXCLUDED.name, min_players = EXCLUDED.min_players, max_players = EXCLUDED.max_players,
                playtime_min = EXCLUDED.playtime_min, max_playtime = EXCLUDED.max_playtime, min_age = EXCLUDED.min_age,
                complexity = EXCLUDED.complexity, best_players = EXCLUDED.best_players, description = EXCLUDED.description,
                image_url = EXCLUDED.image_url
            `);

            return { success: true, imported: true, importedName: game.name, wasUpdate: !!existing };
        } catch (err) {
            console.error('[BGG Import Error]', err);
            return fail(500, { error: 'BGG 가져오기 중 오류가 발생했습니다.' });
        }
    }
};

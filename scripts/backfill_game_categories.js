/**
 * 이미 등록된 게임 중 bgg_id는 있지만 categories/mechanics가 비어있는 것들을
 * BGG에서 채운다. bgg.ts의 fetchAndTranslateBggGame은 이름/설명 번역까지
 *같이 하는데, 백필은 카테고리·메카닉만 필요해서 그 호출을 그대로 쓰면
 * 손으로 고친 설명이 재번역으로 덮일 위험이 있다. 그래서 geekitems를
 * 직접 불러 카테고리/메카닉만 뽑는다 — 다른 필드는 건드리지 않는다.
 *
 * 사용법:
 *   node scripts/backfill_game_categories.js            # 비어있는 것만 채움
 *   node scripts/backfill_game_categories.js --force     # 있어도 다시 채움
 *   node scripts/backfill_game_categories.js --dry-run    # DB에 쓰지 않고 결과만 출력
 */
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgres://user:password@localhost:5432/boardgameclub';
const pool = new pg.Pool({ connectionString: DATABASE_URL });

const FORCE = process.argv.includes('--force');
const DRY_RUN = process.argv.includes('--dry-run');
// objectid 직접 조회는 빠르지만(실측 0.2~0.5초), 347개를 연달아 부르면 BGG
// 서버에 부담이 된다 — 검색 없이도 요청 사이를 조금 띄운다.
const DELAY_MS = 500;
const FETCH_TIMEOUT = 10000;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchCategoriesAndMechanics(bggId) {
    const res = await fetch(
        `https://api.geekdo.com/api/geekitems?nosession=1&objecttype=thing&objectid=${bggId}`,
        { signal: AbortSignal.timeout(FETCH_TIMEOUT) }
    );
    if (!res.ok) throw new Error(`BGG API 오류 (${res.status})`);
    const json = await res.json();
    const item = json.item;
    if (!item) throw new Error('BGG에서 게임을 찾을 수 없습니다');

    const categories = (item.links?.boardgamecategory ?? []).map((l) => l.name).join(', ');
    const mechanics = (item.links?.boardgamemechanic ?? []).map((l) => l.name).join(', ');
    return { categories, mechanics };
}

async function main() {
    const where = FORCE
        ? 'bgg_id IS NOT NULL'
        : "bgg_id IS NOT NULL AND (categories IS NULL OR mechanics IS NULL)";
    const { rows } = await pool.query(`SELECT id, bgg_id, name FROM games WHERE ${where} ORDER BY id`);

    console.log(`대상 ${rows.length}건${FORCE ? ' (--force: 기존 값도 다시 채움)' : ''}${DRY_RUN ? ' (--dry-run: DB에 쓰지 않음)' : ''}`);

    // BGG 호출은 한 곳에 부담을 주지 않으려고 delay를 두고 순서대로 부르지만,
    // DB에는 그때그때 쓰지 않고 다 모았다가 한 번의 UPDATE로 반영한다 —
    // 347번 왕복할 이유가 없다.
    const results = [];
    let failed = 0;
    for (let i = 0; i < rows.length; i++) {
        const g = rows[i];
        const prefix = `[${i + 1}/${rows.length}] ${g.name} (bgg_id=${g.bgg_id})`;
        try {
            const { categories, mechanics } = await fetchCategoriesAndMechanics(g.bgg_id);
            results.push({ id: g.id, categories: categories || null, mechanics: mechanics || null });
            console.log(`${prefix} -> 카테고리: ${categories || '(없음)'} | 메카닉: ${mechanics || '(없음)'}`);
        } catch (e) {
            console.error(`${prefix} -> 실패: ${e.message}`);
            failed++;
        }
        if (i < rows.length - 1) await sleep(DELAY_MS);
    }

    if (!DRY_RUN && results.length > 0) {
        const values = results.map((_, i) => `($${i * 3 + 1}::int, $${i * 3 + 2}::text, $${i * 3 + 3}::text)`).join(', ');
        const params = results.flatMap((r) => [r.id, r.categories, r.mechanics]);
        await pool.query(
            `UPDATE games AS g SET categories = v.categories, mechanics = v.mechanics
             FROM (VALUES ${values}) AS v(id, categories, mechanics)
             WHERE g.id = v.id`,
            params
        );
    }

    console.log(`완료 — 성공 ${results.length}건, 실패 ${failed}건${DRY_RUN ? ' (DB에 쓰지 않음)' : ''}`);
    await pool.end();
    if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
    console.error('스크립트 오류:', e);
    process.exit(1);
});

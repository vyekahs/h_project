import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { reopenAutoClosedVisit } from './visitMerge';

/**
 * 방문 병합 규칙의 통합 테스트.
 *
 * 규칙이 전부 SQL 안에 있어서 DB를 목으로 바꾸면 검증되는 것이 없다. 기본적으로는
 * 건너뛴다 — 아무 DB에나 붙어서 visits를 고치면 안 되기 때문이다:
 *
 *   docker run -d --name hp-qr-test -e POSTGRES_PASSWORD=test \
 *     -e POSTGRES_DB=t -p 15436:5432 postgres:16-alpine
 *   VISIT_MERGE_TEST_DB=1 DATABASE_URL='postgres://postgres:test@localhost:15436/t' \
 *     npx vitest run src/lib/server/visitMerge.test.ts
 */
const on = process.env.VISIT_MERGE_TEST_DB === '1';

async function seed() {
  await db.execute(sql`
    DROP TABLE IF EXISTS auto_checkout_logs, visits, system_settings CASCADE;
    CREATE TABLE system_settings (key varchar(50) PRIMARY KEY, value text NOT NULL);
    CREATE TABLE visits (id serial PRIMARY KEY, attendee_id int, arrival_time timestamptz, departure_time timestamptz);
    CREATE TABLE auto_checkout_logs (id serial PRIMARY KEY, attendee_id int, checked_out_at timestamptz);
    -- 7: 오늘 자동 체크아웃됨 (마감 후)  8: 수동 퇴장  9: 마감 전 자동 체크아웃
    -- 쿼리는 KST 날짜로 "오늘"을 판단하므로 픽스처도 KST 자정 기준으로 만든다.
    -- UTC 기준으로 만들었다가 KST 자정 직후에 돌리면 날짜가 하루 어긋난다.
    INSERT INTO system_settings VALUES ('last_close_at',
      (((NOW() AT TIME ZONE 'Asia/Seoul')::date)::timestamp AT TIME ZONE 'Asia/Seoul' + interval '5 hours')::text);
    INSERT INTO visits (attendee_id, arrival_time, departure_time)
    SELECT x.aid, k.base + x.arr, k.base + x.dep
    FROM (SELECT ((NOW() AT TIME ZONE 'Asia/Seoul')::date)::timestamp AT TIME ZONE 'Asia/Seoul' AS base) k,
         (VALUES (7, interval '14 hours', interval '20 hours'),
                 (8, interval '14 hours', interval '20 hours'),
                 (9, interval '1 hours',  interval '2 hours')) x(aid, arr, dep);
    INSERT INTO auto_checkout_logs (attendee_id, checked_out_at)
    SELECT x.aid, k.base + x.dep
    FROM (SELECT ((NOW() AT TIME ZONE 'Asia/Seoul')::date)::timestamp AT TIME ZONE 'Asia/Seoul' AS base) k,
         (VALUES (7, interval '20 hours'), (9, interval '2 hours')) x(aid, dep);
  `);
}

describe.skipIf(!on)('방문 병합 규칙', () => {
  beforeEach(async () => {
    const r = (await db.execute(sql`SELECT current_database() AS db`)) as any[];
    if (r[0].db !== 't') throw new Error(`검증용 DB가 아니다: ${r[0].db}`);
    await seed();
  });

  it('db로 호출: 자동 퇴장만 잇고, 수동·마감전은 거른다', async () => {
    expect(await reopenAutoClosedVisit(db, 7)).not.toBeNull();  // 자동 + 마감 후
    expect(await reopenAutoClosedVisit(db, 8)).toBeNull();      // 수동 퇴장
    expect(await reopenAutoClosedVisit(db, 9)).toBeNull();      // 마감 전
  });

  it('트랜잭션(tx)으로 호출해도 같고, 커밋된다 — QR 경로', async () => {
    const merged = await db.transaction(async (tx) => {
      const id = await reopenAutoClosedVisit(tx, 7);
      if (id === null) {
        await tx.execute(sql`INSERT INTO visits (attendee_id, arrival_time) VALUES (7, NOW())`);
      }
      return id;
    });
    expect(merged).not.toBeNull();
    const rows = (await db.execute(sql`SELECT id, departure_time FROM visits WHERE attendee_id = 7`)) as any[];
    expect(rows).toHaveLength(1);                 // 새 방문이 생기지 않았다
    expect(rows[0].departure_time).toBeNull();    // 다시 열렸다
  });
});

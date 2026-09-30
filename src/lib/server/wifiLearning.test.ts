import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { getMacCandidates, promoteConfidentMacs } from './wifiLearning';

/**
 * WiFi MAC 학습 판정의 통합 테스트.
 *
 * 이 판정은 전부 SQL 안에 있어서 DB를 목으로 바꾸면 검증되는 것이 없다. 실제로
 * 첫 구현에서 `date - $1`이 파라미터 타입 추론 때문에 `date - date`로 해석되는
 * 버그가 있었고, 목으로는 절대 잡히지 않았다.
 *
 * 그래서 진짜 Postgres를 쓴다. 기본적으로는 건너뛴다 — 아무 DB에나 붙어서
 * user_devices를 쓰면 안 되기 때문이다. 쓰고 버릴 DB를 직접 지정해야 돈다:
 *
 *   docker run -d --name hp-wifi-test -e POSTGRES_PASSWORD=test \
 *     -e POSTGRES_DB=t -p 15434:5432 postgres:16-alpine
 *   WIFI_LEARN_TEST_DB=1 DATABASE_URL='postgres://postgres:test@localhost:15434/t' \
 *     npx vitest run src/lib/server/wifiLearning.test.ts
 */
const enabled = process.env.WIFI_LEARN_TEST_DB === '1';

/**
 * 시나리오 — 관측 10일(2026-09-01 ~ 09-10).
 *
 * 영업일은 UTC 날짜이고 KST 14:00 = UTC 05:00이라, 아래 시각은 모두 같은
 * 영업일 안에 들어간다.
 *
 * - GEAR:A    매장 장비. 매일 종일. 상시 목록에는 없다(밤에 전원을 내려서).
 * - 이리      1~8일 방문, 폰 PHONE:IRI
 * - 동동      1,3,5,7,9일 방문, 폰 PHONE:DD
 * - 트윈A/B   똑같이 2,4,6일 같은 시간에 방문, 각자 폰 → 구분 불가
 * - 매일이    10일 전부 방문 → 비방문일이 없어 부정 증거를 세울 수 없다
 * - 늦둥이    1~3일이지만 시간대가 다르다(KST 18~21시), 폰 PHONE:LATE
 */
async function seed() {
	await db.execute(sql`
		DROP TABLE IF EXISTS wifi_day_macs, wifi_infra_macs, user_devices, visits, attendees CASCADE;

		CREATE TABLE attendees (id serial PRIMARY KEY, name varchar(50));
		CREATE TABLE visits (
			id serial PRIMARY KEY,
			attendee_id int REFERENCES attendees(id),
			arrival_time timestamptz,
			departure_time timestamptz
		);
		CREATE TABLE user_devices (
			id serial PRIMARY KEY,
			attendee_id int REFERENCES attendees(id),
			wifi_mac varchar(17)
		);
		CREATE TABLE wifi_day_macs (
			day date NOT NULL,
			mac varchar(17) NOT NULL,
			first_seen_at timestamptz NOT NULL DEFAULT NOW(),
			last_seen_at timestamptz NOT NULL DEFAULT NOW(),
			samples int NOT NULL DEFAULT 1,
			PRIMARY KEY (day, mac)
		);
		CREATE TABLE wifi_infra_macs (
			mac varchar(17) PRIMARY KEY,
			first_seen_at timestamptz NOT NULL DEFAULT NOW(),
			last_seen_at timestamptz NOT NULL DEFAULT NOW(),
			nights_seen int NOT NULL DEFAULT 1,
			last_night date
		);

		INSERT INTO attendees (id, name) VALUES
			(1,'이리'),(2,'동동'),(3,'트윈A'),(4,'트윈B'),(5,'매일이'),(6,'늦둥이');
		SELECT setval('attendees_id_seq', 6);
		INSERT INTO user_devices (attendee_id, wifi_mac) SELECT id, NULL FROM attendees;

		INSERT INTO wifi_day_macs (day, mac, first_seen_at, last_seen_at, samples)
		SELECT d::date, 'GEAR:A', d + interval '3 hours', d + interval '14 hours', 600
		FROM generate_series('2026-09-01'::date, '2026-09-10'::date, '1 day') d;

		INSERT INTO visits (attendee_id, arrival_time, departure_time)
		SELECT 1, d + interval '5 hours', d + interval '14 hours'
		FROM generate_series('2026-09-01'::date,'2026-09-08'::date,'1 day') d;
		INSERT INTO wifi_day_macs (day, mac, first_seen_at, last_seen_at)
		SELECT d::date, 'PHONE:IRI', d + interval '5 hours', d + interval '14 hours'
		FROM generate_series('2026-09-01'::date,'2026-09-08'::date,'1 day') d;

		INSERT INTO visits (attendee_id, arrival_time, departure_time)
		SELECT 2, d + interval '5 hours', d + interval '13 hours'
		FROM generate_series('2026-09-01'::date,'2026-09-09'::date,'2 days') d;
		INSERT INTO wifi_day_macs (day, mac, first_seen_at, last_seen_at)
		SELECT d::date, 'PHONE:DD', d + interval '5 hours', d + interval '13 hours'
		FROM generate_series('2026-09-01'::date,'2026-09-09'::date,'2 days') d;

		INSERT INTO visits (attendee_id, arrival_time, departure_time)
		SELECT id, d + interval '6 hours', d + interval '12 hours'
		FROM generate_series('2026-09-02'::date,'2026-09-06'::date,'2 days') d, (VALUES (3),(4)) t(id);
		INSERT INTO wifi_day_macs (day, mac, first_seen_at, last_seen_at)
		SELECT d::date, m, d + interval '6 hours', d + interval '12 hours'
		FROM generate_series('2026-09-02'::date,'2026-09-06'::date,'2 days') d,
		     (VALUES ('PHONE:TA'),('PHONE:TB')) x(m);

		INSERT INTO visits (attendee_id, arrival_time, departure_time)
		SELECT 5, d + interval '5 hours', d + interval '14 hours'
		FROM generate_series('2026-09-01'::date,'2026-09-10'::date,'1 day') d;

		INSERT INTO visits (attendee_id, arrival_time, departure_time)
		SELECT 6, d + interval '9 hours', d + interval '12 hours'
		FROM generate_series('2026-09-01'::date,'2026-09-03'::date,'1 day') d;
		INSERT INTO wifi_day_macs (day, mac, first_seen_at, last_seen_at)
		SELECT d::date, 'PHONE:LATE', d + interval '9 hours', d + interval '12 hours'
		FROM generate_series('2026-09-01'::date,'2026-09-03'::date,'1 day') d;
	`);
}

describe.skipIf(!enabled)('WiFi MAC 학습 판정', () => {
	// 매 테스트마다 다시 심는다. 승격은 user_devices를 바꾸고, 등록된 MAC은 다른
	// 회원의 후보에서 제외되므로 테스트끼리 결과가 달라진다.
	beforeEach(async () => {
		// 실수로 운영/개발 DB에 붙어 테이블을 지우는 일은 없어야 한다.
		const rows = (await db.execute(sql`SELECT current_database() AS db`)) as any[];
		if (rows[0].db !== 't') {
			throw new Error(`검증용 DB(t)가 아니다: ${rows[0].db}. DATABASE_URL을 확인하라.`);
		}
		await seed();
	});

	it('주인이 온 날에만 있던 MAC을 등록한다', async () => {
		await promoteConfidentMacs();
		const rows = (await db.execute(sql`
			SELECT a.name, ud.wifi_mac FROM user_devices ud
			JOIN attendees a ON a.id = ud.attendee_id ORDER BY a.id
		`)) as any[];
		const byName = new Map(rows.map((r) => [r.name as string, r.wifi_mac as string | null]));

		expect(byName.get('이리')).toBe('PHONE:IRI');
		expect(byName.get('동동')).toBe('PHONE:DD');
		// 시간대가 달라도 날짜 근거가 충분하면 등록된다.
		expect(byName.get('늦둥이')).toBe('PHONE:LATE');

		// 늘 같은 날·같은 시간에 오는 두 사람은 서로의 폰이 구분되지 않는다.
		expect(byName.get('트윈A')).toBeNull();
		expect(byName.get('트윈B')).toBeNull();
		// 매일 오는 사람은 비방문일이 없어 부정 증거를 세울 수 없다.
		expect(byName.get('매일이')).toBeNull();
		// 매장 장비는 누구에게도 붙지 않는다.
		expect(rows.every((r) => r.wifi_mac !== 'GEAR:A')).toBe(true);
	});

	it('매장 장비는 온 날에 100% 함께 있어도 비방문일 출현으로 탈락한다', async () => {
		const cands = await getMacCandidates(500);

		const iriGear = cands.find((c) => c.name === '이리' && c.mac === 'GEAR:A')!;
		expect(iriGear.daysWith).toBe(iriGear.daysVisited); // 온 날에는 늘 있었다
		expect(iriGear.daysWithout).toBeGreaterThan(0); // 안 온 날에도 있었다 → 탈락

		// 매일 오는 사람에게 매장 장비는 모든 조건을 만족해 보인다.
		// 이 한 행이 MIN_ABSENT_DAYS가 필요한 이유다.
		const dailyGear = cands.find((c) => c.name === '매일이' && c.mac === 'GEAR:A')!;
		expect(dailyGear.daysWith).toBe(dailyGear.daysVisited);
		expect(dailyGear.daysWithout).toBe(0);
		expect(dailyGear.daysAbsent).toBe(0); // 근거로 쓸 비방문일이 없다
	});

	it('다른 사람의 폰은 동행일이 충분해도 비방문일 출현으로 탈락한다', async () => {
		const cands = await getMacCandidates(500);
		// 늦둥이는 1~3일만 왔고 그 3일 모두 이리의 폰과 겹쳤다(이리도 그날 있었다).
		// 긍정 증거만 보면 100%지만, 이리 폰은 늦둥이가 안 온 날에도 있었다.
		const lateWithIri = cands.find((c) => c.name === '늦둥이' && c.mac === 'PHONE:IRI')!;
		expect(lateWithIri.daysWith).toBe(lateWithIri.daysVisited);
		expect(lateWithIri.daysWithout).toBeGreaterThan(0);
	});
});

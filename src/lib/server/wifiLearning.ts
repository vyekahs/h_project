import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';

/**
 * WiFi MAC 자동 학습.
 *
 * BLE 광고는 폰이 내킬 때만 한다. 어떤 회원은 33시간에 13번밖에 안 잡혀 자리에
 * 앉아 있는데도 자동 체크아웃됐다. WiFi는 접속해 있으면 항상 잡히지만 어느 MAC이
 * 누구 것인지 알아야 쓸 수 있고, 회원 32명에게 직접 등록시키는 것은 현실적이지 않다.
 *
 * ── 왜 방식을 바꿨는가 ────────────────────────────────────────────────
 *
 * 처음에는 체크인 순간의 랜 MAC 집합을 그 회원의 그날 후보로 적고, 회원별로
 * "며칠 왔는가 / 그중 며칠 함께 있었는가"만 카운터로 들고 있었다. 10일 돌린 결과
 * 자동 등록은 0명이었고, 원인이 둘이었다.
 *
 * 1. 매장 장비가 순위를 독점했다. 한 MAC이 전체 회원 방문일의 84%에 나타나
 *    18명 전원의 1순위였고, 다음 것이 67%로 2순위였다. 둘 다 영업이 끝나면
 *    전원이 내려가는 장비라 새벽 필터(markInfraMacs)에 한 번도 걸리지 않았다.
 * 2. 늘 같은 5~6명이 함께 오니 "함께 있었던 날 수"만으로는 서로의 폰이 갈리지
 *    않았다. 후보 17개 중 한 회원에게만 잡힌 MAC은 단 1개였다.
 *
 * 두 문제의 뿌리는 같다 — **긍정 증거만 셌다.** "그 사람이 온 날에 있었다"는
 * 사람 출입과 상관된 매장 장비도 똑같이 만족한다. 구분하는 것은 그 반대편이다:
 * 개인 폰은 **주인이 안 온 날에는 랜에 없다.** 매장 장비는 그날도 있다.
 *
 * 그래서 이제 회원별 카운터를 쌓지 않고 (영업일, MAC) 관측만 남긴다.
 * 방문일은 visits에서 직접 읽는다(자동·QR·관리자 모든 경로가 들어 있다).
 * 판정은 "온 날에는 거의 매번 있었고, 안 온 날에는 한 번도 없었다"다.
 *
 * 시각도 함께 남긴다(first_seen_at·last_seen_at). 날짜만으로는 같은 날 온
 * 사람들이 갈리지 않는데, 실제 방문 기록을 보면 도착·퇴장이 다르다
 * (같은 날 이리 14:01~23:20, 랜팜 18:49~21:19). 그래서 "그 회원이 그날
 * 자리에 있던 시간대와 이 MAC이 랜에 있던 시간대가 겹쳤는가"까지 따진다.
 */

/** 이만큼 방문한 뒤에야 판정한다. 하루 이틀로는 우연히 겹친 기기와 구분되지 않는다. */
const MIN_DAYS = 3;
/**
 * 놓친 날을 이만큼까지 허용한다.
 *
 * 엄격한 교집합("올 때마다 반드시")은 한 번만 놓쳐도 정답이 영구히 탈락한다.
 * WiFi를 꺼두고 오거나 배터리가 방전된 날이 있으면 그렇게 된다. 한 번은 봐준다.
 */
const MAX_MISSES = 1;
/**
 * 회원이 오지 않은 관측일이 이만큼은 있어야 판정한다.
 *
 * 부정 증거가 성립하려면 비교할 날이 있어야 한다. 관측된 날 전부에 그 회원이
 * 왔다면 "안 온 날에 없었다"를 확인할 방법이 없고, 그 상태로 판정하면 매장
 * 장비가 그대로 1등으로 통과한다(그게 직전 방식이 실패한 이유다).
 *
 * 매일 오는 사람은 이 조건 때문에 학습되지 않는다. 그건 의도한 것이다 —
 * 근거 없이 등록하는 것보다 등록되지 않는 편이 낫다. 그런 사람은 기기등록으로
 * 한 번에 끝낼 수 있다.
 */
const MIN_ABSENT_DAYS = 2;
/**
 * 회원이 오지 않은 날에 이 MAC이 나타난 횟수의 허용치.
 *
 * 0이다. 주인이 없는데 랜에 있었다면 그건 그 사람의 폰이 아니다. 여기를 느슨하게
 * 하면 정확히 매장 장비가 다시 통과한다.
 */
const MAX_FALSE_DAYS = 0;
/**
 * 이만큼의 밤에 반복해서 나타나야 상시 장비로 인정한다.
 *
 * 부정 증거만으로도 상시 장비는 걸러지지만, 새벽 관측은 며칠치 데이터가 쌓이기
 * 전에도 바로 걸러주므로 보조 필터로 남긴다.
 */
const INFRA_MIN_NIGHTS = 3;
/** 관측 기록 보관 기간. 몇 년 치를 들고 있을 이유가 없다(하루 15행 수준). */
const OBSERVATION_RETENTION_DAYS = 365;

/**
 * 영업일 — KST 09시에 바뀐다.
 *
 * 자정을 넘긴 모임은 시작한 날에 속해야 한다. 그러지 않으면 23시에 도착한 회원의
 * 방문일과 00:30의 MAC 관측일이 하루 어긋나 "온 날에 없었고 안 온 날에 있었다"가
 * 된다.
 *
 * KST는 UTC+9이므로 KST 09:00이 곧 UTC 00:00이고, 결과적으로 이 영업일은 UTC
 * 날짜와 정확히 같다. 양쪽(관측·방문)에서 같은 식을 쓰는 것이 중요하다.
 */
const BUSINESS_DAY_NOW = sql`(NOW() AT TIME ZONE 'UTC')::date`;
const VISIT_BUSINESS_DAY = sql`(v.arrival_time AT TIME ZONE 'UTC')::date`;

/**
 * 관측을 이 간격으로만 쓴다.
 *
 * WiFi 보고는 15초마다 온다. 그대로 쓰면 MAC 하나당 하루 5천 번 갱신인데, 남는
 * 정보는 last_seen_at 몇 초 차이뿐이다. 재실 판정에 1분 해상도면 충분하다.
 * 새 MAC이 나타난 경우는 기다리지 않고 바로 넣는다 — 처음 잡힌 시각이 곧
 * 도착 시각이고, 그게 사람을 가르는 정보다.
 */
const RECORD_INTERVAL_MS = 60 * 1000;

let lastRecordedAt = 0;
/** 이번 영업일에 이미 넣어본 MAC. 새 MAC이면 간격을 무시하고 바로 기록한다. */
let recordedDay = '';
let recordedMacs = new Set<string>();

/**
 * 이 영업일에 랜에서 본 MAC과 그 시각을 남긴다.
 *
 * 영업 중이든 새벽이든 보고가 오면 전부 기록한다. 사람이 없는 날·시간의 관측이
 * 바로 부정 증거가 되기 때문이다 — 아무도 없는데 있던 기기는 누구의 폰도 아니다.
 */
export async function recordDayMacs(macs: string[]) {
	const day = new Date().toISOString().slice(0, 10); // 영업일 = UTC 날짜 (위 설명 참고)
	if (day !== recordedDay) {
		recordedDay = day;
		recordedMacs = new Set();
		lastRecordedAt = 0;
	}

	const unique = [...new Set(macs.map((m) => m.toUpperCase()))];
	if (unique.length === 0) return;

	const hasNew = unique.some((m) => !recordedMacs.has(m));
	if (!hasNew && Date.now() - lastRecordedAt < RECORD_INTERVAL_MS) return;

	try {
		await db.execute(sql`
			INSERT INTO wifi_day_macs (day, mac, first_seen_at, last_seen_at, samples)
			SELECT ${BUSINESS_DAY_NOW}, m.mac, NOW(), NOW(), 1
			FROM (VALUES ${sql.join(
				unique.map((m) => sql`(${m})`),
				sql`, `
			)}) AS m(mac)
			ON CONFLICT (day, mac) DO UPDATE
			-- first_seen_at은 그날 처음 잡힌 시각으로 고정한다. 덮어쓰면 도착
			-- 시각이 사라지고 "언제부터 있었나"를 알 수 없게 된다.
			SET last_seen_at = NOW(),
			    samples = wifi_day_macs.samples + 1
		`);
		lastRecordedAt = Date.now();
		for (const m of unique) recordedMacs.add(m);
	} catch (e) {
		console.error('[WiFiLearn] 관측 기록 실패:', e);
	}
}

/**
 * 영업이 끝난 새벽에도 랜에 있던 기기를 상시 장비로 기록한다.
 *
 * 공유기·TV·스캐너·프린터 같은 것들이다. 회원 폰이 새벽 3시에 동아리방 WiFi에
 * 붙어 있을 수는 없다. 밤에 전원이 내려가는 장비는 여기 걸리지 않지만, 그쪽은
 * 부정 증거가 잡는다.
 */
export async function markInfraMacs(macs: string[]) {
	const unique = [...new Set(macs.map((m) => m.toUpperCase()))];
	if (unique.length === 0) return;
	try {
		await db.execute(sql`
			INSERT INTO wifi_infra_macs (mac, last_night)
			SELECT m.mac, (NOW() AT TIME ZONE 'Asia/Seoul')::date
			FROM (VALUES ${sql.join(
				unique.map((m) => sql`(${m})`),
				sql`, `
			)}) AS m(mac)
			ON CONFLICT (mac) DO UPDATE
			SET last_seen_at = NOW(),
			    -- 같은 밤에 여러 번 보고돼도 한 밤으로 센다. 안 그러면 5분마다
			    -- 올라가 하룻밤 만에 기준을 넘긴다.
			    nights_seen = wifi_infra_macs.nights_seen
			                + CASE WHEN wifi_infra_macs.last_night IS DISTINCT FROM
			                            (NOW() AT TIME ZONE 'Asia/Seoul')::date THEN 1 ELSE 0 END,
			    last_night  = (NOW() AT TIME ZONE 'Asia/Seoul')::date
		`);
	} catch (e) {
		console.error('[WiFiLearn] 상시 장비 기록 실패:', e);
	}
}

export interface MacCandidate {
	attendeeId: number;
	name: string;
	mac: string;
	/** 관측이 있는 날 중 이 회원이 온 날 수 */
	daysVisited: number;
	/** 그중 이 MAC이 함께 있던 날 수 */
	daysWith: number;
	/** 관측이 있는 날 중 이 회원이 오지 않은 날 수 */
	daysAbsent: number;
	/** 그중 이 MAC이 있던 날 수 — 0이어야 그 사람의 폰이다 */
	daysWithout: number;
}

/**
 * 관측이 있는 영업일만 놓고, (회원 × MAC)마다 네 값을 센다.
 *
 * 관측이 없는 날을 섞으면 안 된다. 스캐너가 꺼져 있던 날은 "MAC이 없었다"가
 * 아니라 "모른다"이고, 그걸 부재로 세면 정답이 탈락한다.
 *
 * days_with는 날짜가 같은 것만으로는 세지 않는다. 그 회원이 그날 자리에 있던
 * 시간대와 MAC이 랜에 있던 시간대가 겹쳐야 한다. 이게 같은 날 시간을 달리해
 * 오는 사람들을 가른다.
 */
const PAIR_STATS = sql`
	WITH obs AS (
		SELECT DISTINCT day FROM wifi_day_macs
		-- ::int 캐스트가 필요하다. db.execute는 파라미터 타입을 추론하지 않아서,
		-- 캐스트가 없으면 PG가 date - date(→ integer) 쪽으로 해석해 비교가 깨진다.
		WHERE day >= (NOW() AT TIME ZONE 'UTC')::date - ${OBSERVATION_RETENTION_DAYS}::int
	),
	obs_total AS (SELECT count(*)::int AS n FROM obs),
	visit_span AS (
		-- 방문 기록을 직접 읽는다. 학습용 카운터를 따로 쌓으면 체크인 경로가
		-- 하나 늘 때마다 누락되고, 실제로 그렇게 어긋난 적이 있다.
		--
		-- 같은 날 여러 번 드나든 경우는 하나의 구간으로 합친다. 자동 체크아웃이
		-- 자리에 있는 사람을 내보내 방문이 쪼개지는 일이 실제로 있어서, 조각마다
		-- 따로 맞추면 멀쩡한 MAC이 "겹치지 않음"으로 떨어진다.
		SELECT v.attendee_id,
		       ${VISIT_BUSINESS_DAY} AS day,
		       min(v.arrival_time) AS started_at,
		       max(COALESCE(v.departure_time, NOW())) AS ended_at
		FROM visits v
		JOIN obs o ON o.day = ${VISIT_BUSINESS_DAY}
		WHERE v.attendee_id IS NOT NULL
		GROUP BY v.attendee_id, ${VISIT_BUSINESS_DAY}
	),
	per AS (
		SELECT attendee_id, count(*)::int AS days_visited,
		       (SELECT n FROM obs_total) - count(*)::int AS days_absent
		FROM visit_span GROUP BY attendee_id
	),
	pair AS (
		SELECT p.attendee_id, p.days_visited, p.days_absent, w.mac,
		       -- 온 날 + 시간대 겹침
		       count(*) FILTER (
		           WHERE s.day IS NOT NULL
		             AND w.last_seen_at >= s.started_at
		             AND w.first_seen_at <= s.ended_at
		       )::int AS days_with,
		       -- 안 온 날에 나타난 횟수 — 이게 0이어야 그 사람 폰이다
		       count(*) FILTER (WHERE s.day IS NULL)::int AS days_without
		FROM per p
		JOIN wifi_day_macs w ON w.day IN (SELECT day FROM obs)
		LEFT JOIN visit_span s ON s.attendee_id = p.attendee_id AND s.day = w.day
		-- 새벽 관측으로 이미 상시 장비로 밝혀진 것은 아예 후보에서 뺀다.
		WHERE NOT EXISTS (
		          SELECT 1 FROM wifi_infra_macs i
		          WHERE i.mac = w.mac AND i.nights_seen >= ${INFRA_MIN_NIGHTS}
		      )
		  -- 다른 회원에게 이미 등록된 MAC은 후보가 아니다.
		  AND NOT EXISTS (
		          SELECT 1 FROM user_devices ud
		          WHERE ud.wifi_mac = w.mac AND ud.attendee_id <> p.attendee_id
		      )
		GROUP BY p.attendee_id, p.days_visited, p.days_absent, w.mac
	)
`;

/**
 * 회원별 상위 후보. 판정에도 쓰고 눈으로 확인하는 데도 쓴다.
 *
 * 자동으로 정하는 기능은 근거를 볼 수 없으면 신뢰하기 어렵다. 왜 승격했는지,
 * 왜 못 했는지가 네 숫자로 설명되어야 한다.
 */
export async function getMacCandidates(limit = 30): Promise<MacCandidate[]> {
	try {
		const rows = (await db.execute(sql`
			${PAIR_STATS}
			SELECT p.attendee_id, a.name, p.mac,
			       p.days_visited, p.days_with, p.days_absent, p.days_without
			FROM pair p
			JOIN attendees a ON a.id = p.attendee_id
			WHERE p.days_visited >= ${MIN_DAYS}
			ORDER BY p.days_without ASC, p.days_with DESC, p.days_visited DESC, p.mac
			LIMIT ${limit}
		`)) as any[];

		return rows.map((r) => ({
			attendeeId: Number(r.attendee_id),
			name: r.name as string,
			mac: r.mac as string,
			daysVisited: Number(r.days_visited),
			daysWith: Number(r.days_with),
			daysAbsent: Number(r.days_absent),
			daysWithout: Number(r.days_without)
		}));
	} catch (e) {
		console.error('[WiFiLearn] 후보 조회 실패:', e);
		return [];
	}
}

/** 등록된 MAC이 최근 이만큼의 방문일 동안 한 번도 안 잡히면 낡은 값으로 본다. */
const STALE_AFTER_MISSED_DAYS = 3;

/**
 * 더 이상 나타나지 않는 등록 MAC을 지워 다시 배우게 한다.
 *
 * 폰의 WiFi MAC은 네트워크별로 고정이지만 영구하지는 않다. 회원이 네트워크를
 * 지웠다 다시 붙거나, OS를 업데이트하거나, 설정을 초기화하면 바뀐다. 승격 조건에
 * wifi_mac IS NULL이 있어서, 한 번 등록되면 값이 낡아도 갱신되지 않는다 —
 * 그 회원은 영영 WiFi로 안 잡히는데 아무도 눈치채지 못한다.
 *
 * "최근 방문일 N일 연속으로 안 보였다"로 판단한다. 누적 불일치 횟수로 보면
 * 초기에 몇 번 놓친 뒤 줄곧 정상인 MAC까지 해제된다.
 */
async function clearStaleMacs(): Promise<{ name: string; mac: string }[]> {
	try {
		const rows = (await db.execute(sql`
			WITH obs AS (SELECT DISTINCT day FROM wifi_day_macs),
			visit_day AS (
				SELECT DISTINCT v.attendee_id, ${VISIT_BUSINESS_DAY} AS day
				FROM visits v
				JOIN obs o ON o.day = ${VISIT_BUSINESS_DAY}
				WHERE v.attendee_id IS NOT NULL
			),
			recent AS (
				SELECT attendee_id, day,
				       row_number() OVER (PARTITION BY attendee_id ORDER BY day DESC) AS rn
				FROM visit_day
			),
			stale AS (
				SELECT ud.attendee_id, ud.wifi_mac AS mac
				FROM user_devices ud
				JOIN recent r ON r.attendee_id = ud.attendee_id AND r.rn <= ${STALE_AFTER_MISSED_DAYS}
				WHERE ud.wifi_mac IS NOT NULL
				GROUP BY ud.attendee_id, ud.wifi_mac
				-- 최근 방문일이 N일 이상 관측됐고, 그 N일 전부에서 안 보였을 때만
				HAVING count(*) = ${STALE_AFTER_MISSED_DAYS}
				   AND count(*) FILTER (
				           WHERE EXISTS (
				               SELECT 1 FROM wifi_day_macs w
				               WHERE w.day = r.day AND w.mac = ud.wifi_mac
				           )
				       ) = 0
			),
			cleared AS (
				UPDATE user_devices ud SET wifi_mac = NULL
				FROM stale s
				WHERE ud.attendee_id = s.attendee_id AND ud.wifi_mac = s.mac
				RETURNING ud.attendee_id, s.mac
			)
			SELECT a.name, cl.mac FROM cleared cl JOIN attendees a ON a.id = cl.attendee_id
		`)) as any[];

		for (const r of rows) {
			console.log(`[WiFiLearn] ${r.name}의 등록 MAC ${r.mac} 해제 — 최근 방문에서 계속 안 잡힘`);
		}
		return rows.map((r) => ({ name: r.name as string, mac: r.mac as string }));
	} catch (e) {
		console.error('[WiFiLearn] 낡은 MAC 정리 실패:', e);
		return [];
	}
}

/**
 * 충분히 확실해진 후보를 실제 등록으로 승격한다.
 *
 * 이미 wifi_mac이 있는 회원은 건드리지 않는다. 손으로 등록한 값이 자동 추정으로
 * 덮이면 틀렸을 때 왜 그렇게 됐는지 추적할 수 없다.
 */
export async function promoteConfidentMacs(): Promise<
	{ attendeeId: number; name: string; mac: string }[]
> {
	// 낡은 등록부터 정리한다. 먼저 지워야 그 회원이 이번 판정에서 다시 배울 수 있다.
	await clearStaleMacs();
	await pruneOldObservations();

	const candidates = await getMacCandidates(500);
	const ready = candidates.filter(
		(c) =>
			c.daysVisited >= MIN_DAYS &&
			c.daysWith >= c.daysVisited - MAX_MISSES &&
			// 부정 증거 — 이 두 줄이 매장 장비를 걸러낸다.
			c.daysAbsent >= MIN_ABSENT_DAYS &&
			c.daysWithout <= MAX_FALSE_DAYS
	);

	// 한 기기가 두 사람의 폰일 수는 없다.
	//
	// 늘 정확히 같은 날에만 오는 두 사람이 있으면 서로의 폰이 양쪽 조건을 모두
	// 만족한다. 그때는 어느 쪽인지 알 수 없으므로 출석이 갈릴 때까지 미룬다.
	const claims = new Map<string, number>();
	for (const c of ready) claims.set(c.mac, (claims.get(c.mac) ?? 0) + 1);

	const promoted: { attendeeId: number; name: string; mac: string }[] = [];
	const done = new Set<number>();

	for (const c of ready) {
		if ((claims.get(c.mac) ?? 0) > 1) {
			console.log(`[WiFiLearn] ${c.name} → ${c.mac} 보류 — 다른 회원도 같은 조건을 만족한다`);
			continue;
		}
		// 한 회원에게 여러 기기(폰·워치)가 다 통과할 수 있다. 어느 쪽이든 재실
		// 판정에는 똑같이 쓸 수 있으므로 정렬 1등 하나만 쓰고 나머지는 넘어간다.
		if (done.has(c.attendeeId)) continue;

		try {
			const rows = (await db.execute(sql`
				UPDATE user_devices ud
				SET wifi_mac = ${c.mac}
				WHERE ud.attendee_id = ${c.attendeeId}
				  AND ud.wifi_mac IS NULL
				  AND NOT EXISTS (SELECT 1 FROM user_devices o WHERE o.wifi_mac = ${c.mac})
				RETURNING ud.id
			`)) as any[];
			if (rows.length > 0) {
				done.add(c.attendeeId);
				promoted.push({ attendeeId: c.attendeeId, name: c.name, mac: c.mac });
				console.log(
					`[WiFiLearn] ${c.name} → ${c.mac} 자동 등록 ` +
						`(방문 ${c.daysVisited}일 중 ${c.daysWith}일 동행, ` +
						`비방문 ${c.daysAbsent}일 중 ${c.daysWithout}일 출현)`
				);
			}
		} catch (e) {
			console.error(`[WiFiLearn] ${c.name} 승격 실패:`, e);
		}
	}
	return promoted;
}

/** 오래된 관측을 지운다. 판정은 최근 기록만 쓰므로 무한히 쌓아둘 이유가 없다. */
async function pruneOldObservations() {
	try {
		await db.execute(sql`
			DELETE FROM wifi_day_macs
			WHERE day < (NOW() AT TIME ZONE 'UTC')::date - ${OBSERVATION_RETENTION_DAYS}::int
		`);
	} catch (e) {
		console.error('[WiFiLearn] 오래된 관측 정리 실패:', e);
	}
}

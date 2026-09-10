import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';

/**
 * WiFi MAC 자동 학습.
 *
 * BLE 광고는 폰이 내킬 때만 한다. 어떤 회원은 33시간에 13번밖에 안 잡혀 자리에
 * 앉아 있는데도 자동 체크아웃됐다. WiFi는 접속해 있으면 항상 잡히지만 어느 MAC이
 * 누구 것인지 알아야 쓸 수 있고, 회원 32명에게 직접 등록시키는 것은 현실적이지 않다.
 *
 * 그래서 BLE 체크인 순간에 랜에 있던 MAC 집합을 그날의 후보로 잡고, 날짜별로
 * 교차시킨다. 그 사람이 올 때마다 늘 함께 있던 MAC 하나가 남는다.
 *
 * 관측을 체크인 순간으로 한정하는 이유는 그때가 확신이 가장 높기 때문이다 —
 * BLE로 방금 잡혔으니 그 사람은 확실히 거기 있다. 상시로 표본을 세면 자리를
 * 비운 시간까지 섞여 후보가 흐려진다.
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
 * 2등과 이만큼(일) 벌어져야 승격한다.
 *
 * 늘 함께 오는 두 사람은 서로의 MAC이 후보에 계속 남는다. 며칠 더 쌓여 출석이
 * 갈릴 때까지 기다리게 하는 장치다.
 */
const MIN_DAY_MARGIN = 2;
/** 이보다 오래된 WiFi 보고는 현재 상태로 믿지 않는다. */
const LAN_FRESHNESS_MS = 10 * 60 * 1000;

/**
 * 가장 최근 WiFi 보고의 MAC 집합.
 *
 * 체크인은 아무 때나 일어나고 WiFi 보고는 몇 분에 한 번이라, 체크인 시점에
 * 스캐너를 다시 부를 수 없다. 마지막 보고를 들고 있다가 그때 쓴다.
 */
let latestLanMacs: string[] = [];
let latestLanAt = 0;

export function setLatestLanMacs(macs: string[]) {
	latestLanMacs = [...new Set(macs.map((m) => m.toUpperCase()))];
	latestLanAt = Date.now();
}

/**
 * 영업이 끝난 새벽에도 랜에 있던 기기를 상시 장비로 기록한다.
 *
 * 공유기·TV·스캐너·프린터 같은 것들이다. 회원 폰이 새벽 3시에 동아리방 WiFi에
 * 붙어 있을 수는 없다. 이런 기기는 모든 회원의 후보에 계속 남아 교집합이
 * 좁혀지지 않게 만들므로 아예 빼야 한다.
 */
export async function markInfraMacs(macs: string[]) {
	const unique = [...new Set(macs.map((m) => m.toUpperCase()))];
	if (unique.length === 0) return;
	try {
		await db.execute(sql`
			INSERT INTO wifi_infra_macs (mac)
			SELECT m.mac FROM (VALUES ${sql.join(unique.map((m) => sql`(${m})`), sql`, `)}) AS m(mac)
			ON CONFLICT (mac) DO UPDATE SET last_seen_at = NOW()
		`);
	} catch (e) {
		console.error('[WiFiLearn] 상시 장비 기록 실패:', e);
	}
}

/**
 * BLE 체크인 순간의 랜 상태를 그 회원의 오늘 관측으로 기록한다.
 *
 * 하루에 한 번만 센다(last_day). 같은 날 여러 번 체크인해도 날짜 수가 부풀지
 * 않아야 "며칠 왔는가"와 "그중 며칠 함께 있었는가"의 비교가 성립한다.
 */
export async function recordCheckinObservation(attendeeId: number) {
	if (Date.now() - latestLanAt > LAN_FRESHNESS_MS) return; // 오래된 보고는 안 쓴다
	if (latestLanMacs.length === 0) return;

	try {
		const bumped = (await db.execute(sql`
			INSERT INTO wifi_learn_attendee_days (attendee_id, days_seen, last_day)
			VALUES (${attendeeId}, 1, (NOW() AT TIME ZONE 'Asia/Seoul')::date)
			ON CONFLICT (attendee_id) DO UPDATE
			SET days_seen = wifi_learn_attendee_days.days_seen + 1,
			    last_day  = (NOW() AT TIME ZONE 'Asia/Seoul')::date
			WHERE wifi_learn_attendee_days.last_day IS DISTINCT FROM (NOW() AT TIME ZONE 'Asia/Seoul')::date
			RETURNING days_seen
		`)) as any[];

		// 오늘 이미 관측했으면 MAC도 다시 세지 않는다. 둘이 어긋나면
		// "5일 중 7일 함께 있었다" 같은 값이 나온다.
		if (bumped.length === 0) return;

		const values = sql.join(latestLanMacs.map((m) => sql`(${m})`), sql`, `);
		await db.execute(sql`
			INSERT INTO wifi_mac_candidates (attendee_id, mac, days_seen, last_day)
			SELECT ${attendeeId}, c.mac, 1, (NOW() AT TIME ZONE 'Asia/Seoul')::date
			FROM (VALUES ${values}) AS c(mac)
			WHERE NOT EXISTS (SELECT 1 FROM wifi_infra_macs i WHERE i.mac = c.mac)
			  AND NOT EXISTS (
			      SELECT 1 FROM user_devices ud
			      WHERE ud.wifi_mac = c.mac AND ud.attendee_id <> ${attendeeId}
			  )
			ON CONFLICT (attendee_id, mac) DO UPDATE
			SET days_seen = wifi_mac_candidates.days_seen + 1,
			    last_day  = (NOW() AT TIME ZONE 'Asia/Seoul')::date
			WHERE wifi_mac_candidates.last_day IS DISTINCT FROM (NOW() AT TIME ZONE 'Asia/Seoul')::date
		`);

		console.log(
			`[WiFiLearn] ${attendeeId}번 회원 관측 (방문 ${bumped[0].days_seen}일째, 랜 ${latestLanMacs.length}대)`
		);
	} catch (e) {
		console.error('[WiFiLearn] 관측 기록 실패:', e);
	}
}

export interface MacCandidate {
	attendeeId: number;
	name: string;
	mac: string;
	daysWith: number;
	daysVisited: number;
	runnerUpDays: number;
}

/**
 * 회원별 1등 후보. 판정에도 쓰고 어드민에서 들여다보는 데도 쓴다.
 *
 * 자동으로 정하는 기능은 근거를 볼 수 없으면 신뢰하기 어렵다. 잘못 짝지어졌을 때
 * 2등이 무엇이었는지 알아야 손으로 고칠 수 있다.
 */
export async function getMacCandidates(limit = 30): Promise<MacCandidate[]> {
	try {
		const rows = (await db.execute(sql`
			WITH ranked AS (
				SELECT c.attendee_id, c.mac, c.days_seen,
				       d.days_seen AS days_visited,
				       row_number() OVER (PARTITION BY c.attendee_id ORDER BY c.days_seen DESC) AS rnk,
				       COALESCE(
				           lead(c.days_seen) OVER (PARTITION BY c.attendee_id ORDER BY c.days_seen DESC), 0
				       ) AS runner_up
				FROM wifi_mac_candidates c
				JOIN wifi_learn_attendee_days d ON d.attendee_id = c.attendee_id
			)
			SELECT r.attendee_id, a.name, r.mac, r.days_seen, r.days_visited, r.runner_up
			FROM ranked r JOIN attendees a ON a.id = r.attendee_id
			WHERE r.rnk = 1
			ORDER BY r.days_visited DESC, r.days_seen DESC
			LIMIT ${limit}
		`)) as any[];

		return rows.map((r) => ({
			attendeeId: Number(r.attendee_id),
			name: r.name as string,
			mac: r.mac as string,
			daysWith: Number(r.days_seen),
			daysVisited: Number(r.days_visited),
			runnerUpDays: Number(r.runner_up)
		}));
	} catch (e) {
		console.error('[WiFiLearn] 후보 조회 실패:', e);
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
	const candidates = await getMacCandidates(100);
	const ready = candidates.filter(
		(c) =>
			c.daysVisited >= MIN_DAYS &&
			c.daysWith >= c.daysVisited - MAX_MISSES &&
			c.daysWith - c.runnerUpDays >= MIN_DAY_MARGIN
	);

	const promoted: { attendeeId: number; name: string; mac: string }[] = [];
	for (const c of ready) {
		try {
			// 같은 MAC이 다른 회원에게 이미 붙어 있으면 건너뛴다. 한 기기가 두 사람의
			// 것일 수는 없고, 그런 상황은 학습이 헷갈린 신호다.
			const rows = (await db.execute(sql`
				UPDATE user_devices ud
				SET wifi_mac = ${c.mac}
				WHERE ud.attendee_id = ${c.attendeeId}
				  AND ud.wifi_mac IS NULL
				  AND NOT EXISTS (SELECT 1 FROM user_devices o WHERE o.wifi_mac = ${c.mac})
				RETURNING ud.id
			`)) as any[];
			if (rows.length > 0) {
				promoted.push({ attendeeId: c.attendeeId, name: c.name, mac: c.mac });
				console.log(
					`[WiFiLearn] ${c.name} → ${c.mac} 자동 등록 ` +
						`(방문 ${c.daysVisited}일 중 ${c.daysWith}일 동행, 2등 ${c.runnerUpDays}일)`
				);
			}
		} catch (e) {
			console.error(`[WiFiLearn] ${c.name} 승격 실패:`, e);
		}
	}
	return promoted;
}

import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';

/**
 * WiFi MAC 자동 학습.
 *
 * BLE 광고는 폰이 내킬 때만 한다. 어떤 회원은 33시간에 13번밖에 안 잡혀서, 자리에
 * 앉아 있는데도 자동 체크아웃됐다. WiFi는 접속해 있으면 항상 잡히지만, 어느 MAC이
 * 누구 것인지 알아야 쓸 수 있다. 회원 32명에게 직접 등록시키는 것은 현실적이지 않다.
 *
 * 그래서 BLE로 확실히 잡힌 순간을 정답지로 삼아 동시 출현을 센다. 회원이 있을 때만
 * 랜에 있고 없을 때 없는 MAC이 그 사람 폰이다.
 *
 *   점수 = P(이 MAC이 랜에 있다 | 이 회원이 BLE로 확인됨) − P(이 MAC이 랜에 있다)
 *
 * 뒤의 항이 핵심이다. 공유기·TV·스캐너처럼 항상 켜져 있는 기기는 앞의 항이 1에
 * 가깝지만 뒤의 항도 1에 가까워 점수가 0이 된다. 이걸 빼지 않으면 상시 기기가
 * 모든 회원의 폰으로 뽑힌다.
 */

/** 이 회원의 표본이 이만큼 쌓이기 전에는 판정하지 않는다. */
const MIN_SAMPLES = 30;
/** 점수가 이보다 낮으면 근거가 약하다고 본다. */
const MIN_SCORE = 0.6;
/** 2등과 이만큼 벌어져야 한다. 늘 함께 오는 두 사람이 서로 뒤바뀌는 것을 막는다. */
const MIN_MARGIN = 0.25;

function counterName(kind: 'a' | 'm', key: string | number) {
	return `${kind}:${key}`;
}

/**
 * 영업이 끝난 새벽에도 랜에 있던 기기를 상시 장비로 기록한다.
 *
 * 공유기·TV·스캐너·프린터 같은 것들이다. 회원 폰이 새벽 3시에 동아리방 WiFi에
 * 붙어 있을 수는 없다. 이런 기기는 모든 회원과 동시에 나타나므로, 걸러내지 않으면
 * 아무하고나 짝지어진다.
 *
 * 점수 계산의 전체 출현율 항으로도 어느 정도 걸러지지만, 그건 표본이 쌓여야
 * 효과가 나고 경계도 흐리다. 새벽에 있었다는 사실은 그 자체로 확실한 증거라
 * 1차 필터로 쓴다.
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
 * 표본 하나를 기록한다. 표본 = WiFi 보고 한 번.
 *
 * @param macs             이번 보고에 잡힌 MAC 전체 (등록 여부 무관)
 * @param bleConfirmedIds  같은 시각에 BLE로 확인된 회원들
 *
 * bleConfirmedIds는 반드시 BLE 근거만 써야 한다. WiFi 판정 결과를 넣으면 스스로
 * 학습한 결과로 다시 학습하는 되먹임이 생겨, 한 번 잘못 짝지어진 MAC이 영원히
 * 굳어진다.
 */
export async function recordWifiSample(macs: string[], bleConfirmedIds: number[]) {
	const uniqueMacs = [...new Set(macs.map((m) => m.toUpperCase()))];
	if (uniqueMacs.length === 0) return;

	const ids = [...new Set(bleConfirmedIds)].filter((n) => Number.isInteger(n));

	try {
		// 카운터는 한 번의 UPSERT로 모두 올린다. 종류별로 나눠 쿼리를 던지면
		// 표본마다 커넥션을 여러 개 잡는다 — 이 프로젝트에서 풀이 바닥난 원인이었다.
		const names = [
			sql`('global')`,
			...uniqueMacs.map((m) => sql`(${counterName('m', m)})`),
			...ids.map((id) => sql`(${counterName('a', id)})`)
		];

		await db.execute(sql`
			INSERT INTO wifi_learn_counters (name, count)
			SELECT n.name, 1 FROM (VALUES ${sql.join(names, sql`, `)}) AS n(name)
			ON CONFLICT (name) DO UPDATE SET count = wifi_learn_counters.count + 1
		`);

		if (ids.length === 0) return;

		const pairs = ids.flatMap((id) => uniqueMacs.map((m) => sql`(${id}::int, ${m})`));
		await db.execute(sql`
			INSERT INTO wifi_mac_learning (attendee_id, mac, hits)
			SELECT p.attendee_id, p.mac, 1
			FROM (VALUES ${sql.join(pairs, sql`, `)}) AS p(attendee_id, mac)
			ON CONFLICT (attendee_id, mac) DO UPDATE SET hits = wifi_mac_learning.hits + 1
		`);
	} catch (e) {
		console.error('[WiFiLearn] 표본 기록 실패:', e);
	}
}

export interface MacCandidate {
	attendeeId: number;
	name: string;
	mac: string;
	score: number;
	margin: number;
	samples: number;
}

/**
 * 현재 후보 순위. 판정에도 쓰고 어드민에서 들여다보는 데도 쓴다.
 *
 * 자동으로 무언가를 정하는 기능은 왜 그렇게 정했는지 볼 수 없으면 신뢰하기 어렵다.
 * 잘못 짝지어졌을 때 무엇이 2등이었는지 알아야 손으로 고칠 수 있다.
 */
export async function getMacCandidates(limit = 20): Promise<MacCandidate[]> {
	try {
		const rows = (await db.execute(sql`
			WITH g AS (SELECT count FROM wifi_learn_counters WHERE name = 'global'),
			scored AS (
				SELECT l.attendee_id,
				       l.mac,
				       a.count AS samples,
				       (l.hits::float / NULLIF(a.count, 0))
				         - (m.count::float / NULLIF((SELECT count FROM g), 0)) AS score
				FROM wifi_mac_learning l
				JOIN wifi_learn_counters a ON a.name = 'a:' || l.attendee_id
				JOIN wifi_learn_counters m ON m.name = 'm:' || l.mac
				-- 새벽에도 켜져 있던 상시 장비는 후보에서 뺀다
				WHERE NOT EXISTS (SELECT 1 FROM wifi_infra_macs i WHERE i.mac = l.mac)
			),
			ranked AS (
				SELECT s.*,
				       row_number() OVER (PARTITION BY attendee_id ORDER BY score DESC) AS rnk,
				       score - COALESCE(
				           lead(score) OVER (PARTITION BY attendee_id ORDER BY score DESC), 0
				       ) AS margin
				FROM scored s
			)
			SELECT r.attendee_id, at.name, r.mac, r.score, r.margin, r.samples
			FROM ranked r JOIN attendees at ON at.id = r.attendee_id
			WHERE r.rnk = 1
			ORDER BY r.score DESC
			LIMIT ${limit}
		`)) as any[];

		return rows.map((r) => ({
			attendeeId: Number(r.attendee_id),
			name: r.name as string,
			mac: r.mac as string,
			score: Number(r.score),
			margin: Number(r.margin),
			samples: Number(r.samples)
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
 * 덮이면, 틀렸을 때 왜 그렇게 됐는지 추적할 수 없다.
 *
 * @returns 승격된 (회원, MAC) 목록
 */
export async function promoteConfidentMacs(): Promise<{ attendeeId: number; name: string; mac: string }[]> {
	const candidates = await getMacCandidates(50);
	const ready = candidates.filter(
		(c) =>
			c.samples >= MIN_SAMPLES &&
			Number.isFinite(c.score) &&
			c.score >= MIN_SCORE &&
			c.margin >= MIN_MARGIN
	);
	if (ready.length === 0) return [];

	const promoted: { attendeeId: number; name: string; mac: string }[] = [];
	for (const c of ready) {
		try {
			// 같은 MAC이 다른 회원에게 이미 붙어 있으면 건너뛴다. 한 기기가 두 사람의
			// 것일 수는 없고, 그런 상황은 학습이 헷갈린 신호이므로 자동으로 정하지 않는다.
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
						`(점수 ${c.score.toFixed(2)}, 2등과 ${c.margin.toFixed(2)} 차, 표본 ${c.samples})`
				);
			}
		} catch (e) {
			console.error(`[WiFiLearn] ${c.name} 승격 실패:`, e);
		}
	}
	return promoted;
}

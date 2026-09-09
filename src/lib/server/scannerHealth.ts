import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { sendMail } from '$lib/server/mail';

/**
 * BLE 스캐너 무응답 감시.
 *
 * 스캐너 한 대가 나흘 동안 조용히 죽어 있는 것을 아무도 몰랐고, 다른 한 대는
 * 운영 도중(19:50)에 멈췄는데 그날 저녁 내내 모르고 지나갔다. 그 결과 회원들이
 * 자리에 있는데도 자동 체크아웃됐다. 스캐너는 전원 LED가 켜져 있어도 서버에
 * 보고하지 못할 수 있어서, 눈으로 봐서는 죽은 걸 알 수 없다.
 *
 * 정상일 때 스캐너는 30~50초마다 보고한다. 10분을 넘겼다면 확실히 문제다.
 */
const SILENT_THRESHOLD = "INTERVAL '10 minutes'";

/**
 * 무응답 알림은 영업 중일 때만 보낸다.
 *
 * 영업이 끝나면 스캐너 전원을 내리므로, 이 조건이 없으면 매일 밤 "스캐너가
 * 죽었다"는 알림이 온다. 그런 알림은 며칠 만에 무시하게 되고, 정작 진짜 고장이
 * 났을 때도 함께 묻힌다.
 */
async function isVenueOpen(): Promise<boolean> {
	try {
		const rows = (await db.execute(sql`
			SELECT value FROM system_settings WHERE key = 'is_open'
		`)) as any[];
		return rows[0]?.value === 'true';
	} catch (e) {
		// 확인할 수 없으면 보내지 않는다. 잘못된 알림보다 놓친 알림이 낫다 —
		// 잘못된 알림이 쌓이면 진짜 알림까지 무시하게 된다.
		console.error('[SCANNER] 영업 상태 확인 실패 — 이번 점검은 건너뛴다:', e);
		return false;
	}
}

async function alert(subject: string, body: string) {
	console.warn(`[SCANNER] ${subject}\n${body}`);
	const to = env.SMTP_TO;
	if (!to) {
		console.warn('[SCANNER] SMTP_TO가 없어 메일은 보내지 않는다 (로그만 남김)');
		return;
	}
	try {
		await sendMail(to, subject, body);
	} catch (e) {
		console.error('[SCANNER] 알림 메일 발송 실패:', e);
	}
}

/**
 * 무응답 스캐너를 찾아 알리고, 돌아온 스캐너는 복구를 알린다.
 *
 * 상태 전이를 DB에서 원자적으로 잡는다(UPDATE ... RETURNING). 조회 후 갱신으로
 * 나누면 블루/그린 두 인스턴스가 같은 스캐너를 각각 발견해 알림이 두 번 간다.
 * 갱신에 성공한 쪽만 행을 받으므로 정확히 한 번만 보낸다.
 *
 * scanners.status는 보고를 받을 때마다 'active'로 덮이므로 상태 추적에 쓸 수 없다.
 * 알림 여부는 alerted_down_at으로 따로 들고 있는다.
 */
export async function checkScannerHealth(): Promise<void> {
	try {
		// 복구는 영업 여부와 무관하게 처리한다. 알림 표시를 지워두지 않으면
		// 다음에 정말 죽었을 때 "이미 알린 상태"로 보여 알림이 안 나간다.
		const recovered = (await db.execute(sql`
			UPDATE scanners
			SET alerted_down_at = NULL
			WHERE alerted_down_at IS NOT NULL
			  AND last_seen_at >= NOW() - ${sql.raw(SILENT_THRESHOLD)}
			RETURNING id, alerted_down_at
		`)) as any[];

		for (const row of recovered) {
			await alert(
				`[혼놀] 스캐너 복구: ${row.id}`,
				`${row.id} 스캐너가 다시 보고하기 시작했습니다.\n` +
					`무응답 알림 시각: ${row.alerted_down_at}`
			);
		}

		if (!(await isVenueOpen())) return;

		const down = (await db.execute(sql`
			UPDATE scanners
			SET alerted_down_at = NOW()
			WHERE alerted_down_at IS NULL
			  AND last_seen_at < NOW() - ${sql.raw(SILENT_THRESHOLD)}
			  -- 오래 꺼둔 기기는 알리지 않는다. 등록용 단말처럼 평소에 꺼두는 것이
			  -- 있어서, 이 조건이 없으면 영업을 열 때마다 같은 알림이 반복된다.
			  -- 며칠씩 조용한 기기는 고장이 아니라 치워둔 것으로 본다.
			  AND last_seen_at > NOW() - INTERVAL '7 days'
			RETURNING id,
			          last_seen_at,
			          round(EXTRACT(EPOCH FROM (NOW() - last_seen_at)) / 60)::int AS silent_minutes
		`)) as any[];

		for (const row of down) {
			await alert(
				`[혼놀] 스캐너 무응답: ${row.id}`,
				`${row.id} 스캐너가 ${row.silent_minutes}분째 보고하지 않습니다.\n` +
					`마지막 보고: ${row.last_seen_at}\n\n` +
					`전원 LED가 켜져 있어도 WiFi가 끊기면 보고하지 못합니다.\n` +
					`이 상태로 두면 회원이 자리에 있어도 자동 체크아웃됩니다.`
			);
		}
	} catch (e) {
		console.error('[SCANNER] 무응답 점검 실패:', e);
	}
}

/**
 * 어드민 화면용 스캐너 상태 목록.
 *
 * 죽은 스캐너를 사람이 알아채려면 어딘가에 보여야 한다. 모니터 화면에서
 * 5초마다 읽으므로 가볍게 유지한다(스캐너는 많아야 열 대 남짓).
 */
export async function getScannerHealth() {
	try {
		const rows = (await db.execute(sql`
			SELECT id,
			       round(EXTRACT(EPOCH FROM (NOW() - last_seen_at)))::int AS silent_seconds,
			       (last_seen_at < NOW() - ${sql.raw(SILENT_THRESHOLD)}) AS is_down,
			       (metadata->>'device_total')::int AS device_total,
			       (metadata->>'free_heap')::int   AS free_heap
			FROM scanners
			ORDER BY last_seen_at DESC NULLS LAST
		`)) as any[];

		return rows.map((r) => ({
			id: r.id as string,
			silentSeconds: Number(r.silent_seconds ?? 0),
			isDown: r.is_down === true,
			deviceTotal: r.device_total === null ? null : Number(r.device_total),
			freeHeap: r.free_heap === null ? null : Number(r.free_heap)
		}));
	} catch (e) {
		console.error('[SCANNER] 상태 조회 실패:', e);
		return [];
	}
}

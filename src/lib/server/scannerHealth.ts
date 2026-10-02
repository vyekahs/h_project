import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';
import { NotificationService } from '$lib/server/services/notificationService';

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
 * 알림에 쓸 이름. scanners.name이 있으면 그걸, 없으면 id를 쓴다.
 *
 * id는 'scanner_sub_hall'처럼 기계적이라 현장에서 한 번 더 해석해야 한다.
 * name에 '서브홀'처럼 넣어두면 알림이 바로 읽힌다(지금은 전부 비어 있어 id로 나간다):
 *   UPDATE scanners SET name = '서브홀' WHERE id = 'scanner_sub_hall';
 */
const DISPLAY_NAME = "COALESCE(NULLIF(name, ''), id)";

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

/**
 * 알림을 받을 사람: 지금 혼놀에 있는 관리자 전원. 아무도 없으면 폴백 한 명.
 *
 * 현장에 있는 사람에게 보내야 의미가 있다 — 스캐너는 전원을 다시 꽂거나 위치를
 * 옮겨야 살아나는 경우가 대부분이라, 집에 있는 사람이 알림을 받아봐야 할 수 있는 게
 * 없다. 다만 아무도 없을 때 아무에게도 안 보내면 며칠씩 죽어 있는 지금 상황이
 * 그대로 반복되므로, 폴백 수신자를 둔다.
 *
 * 폴백은 system_settings의 scanner_alert_fallback_user_id로 바꿀 수 있다
 * (코드에 사람 이름을 박아두면 담당이 바뀔 때마다 배포해야 한다).
 */
async function resolveRecipients(): Promise<number[]> {
	try {
		const rows = (await db.execute(sql`
			WITH present_admins AS (
				SELECT id FROM attendees WHERE is_admin = true AND status = 'present'
			),
			fallback AS (
				SELECT value::int AS id
				FROM system_settings
				WHERE key = 'scanner_alert_fallback_user_id'
				  AND value ~ '^[0-9]+$'
			)
			SELECT id FROM present_admins
			UNION
			SELECT id FROM fallback WHERE NOT EXISTS (SELECT 1 FROM present_admins)
		`)) as any[];
		return rows.map((r) => Number(r.id)).filter((n) => Number.isInteger(n));
	} catch (e) {
		console.error('[SCANNER] 알림 수신자 조회 실패:', e);
		return [];
	}
}

/**
 * 알림 한 건.
 *
 * body는 제목 없이도 이해되어야 한다. notifications 테이블에는 message(본문)만
 * 저장되고 제목은 버려지기 때문에, 인앱 알림 목록에서는 본문만 보인다. 기기
 * 이름을 제목에만 넣었더니 "푸시를 받은 사람 말고는 어느 기기인지 모르겠다"는
 * 상황이 됐다.
 */
/**
 * 스캐너 알림 한 건.
 *
 * body는 제목 없이도 이해되어야 한다. notifications 테이블에는 message(본문)만
 * 저장되고 제목은 버려지므로, 인앱 알림 목록에서는 본문만 보인다. 기기 이름을
 * 제목에만 넣었더니 "푸시를 받은 사람 말고는 어느 기기인지 모르겠다"가 됐다.
 *
 * 이건 이 파일의 알림에만 적용한다. 다른 알림들은 지금 문구가 이미 자체적으로
 * 이해되므로 건드리지 않는다.
 */
async function alert(title: string, body: string) {
	console.warn(`[SCANNER] ${title}\n${body}`);

	const userIds = await resolveRecipients();
	if (userIds.length === 0) {
		console.warn('[SCANNER] 알림 수신자가 없어 로그만 남긴다');
		return;
	}

	try {
		await NotificationService.notifyMany(userIds, {
			type: 'scanner_down',
			title,
			body,
			url: '/admin/monitor'
		});
	} catch (e) {
		console.error('[SCANNER] 알림 전송 실패:', e);
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
		// RETURNING은 '갱신된 뒤'의 값을 돌려준다. alerted_down_at을 방금 NULL로
		// 바꿔놓고 그걸로 경과를 계산하면 NULL이 나와 알림에 "null분"이 찍힌다.
		// 자기 자신을 FROM으로 조인하면 그쪽은 갱신 전 스냅샷이라 옛 값을 읽을 수 있다.
		const recovered = (await db.execute(sql`
			UPDATE scanners s
			SET alerted_down_at = NULL
			FROM scanners old
			WHERE old.id = s.id
			  AND s.alerted_down_at IS NOT NULL
			  AND s.last_seen_at >= NOW() - ${sql.raw(SILENT_THRESHOLD)}
			RETURNING s.alert_enabled,
			          COALESCE(NULLIF(s.name, ''), s.id) AS label,
			          round(EXTRACT(EPOCH FROM (NOW() - old.alerted_down_at)) / 60)::int AS down_minutes
		`)) as any[];

		for (const row of recovered) {
			// 알림을 꺼둔 사이 복구된 경우: 표시(alerted_down_at)는 위에서 이미
			// 지웠으니 상태는 맞고, 알림만 보내지 않는다.
			if (row.alert_enabled !== true) continue;
			// 값이 비어도 문장이 깨지지 않게 한다. 알림 문구에 "null"이 찍히면
			// 받는 사람은 시스템이 고장난 줄 안다.
			const mins = Number(row.down_minutes);
			await alert(
				`스캐너 복구: ${row.label}`,
				Number.isFinite(mins)
					? `${row.label} — ${mins}분 만에 다시 보고를 시작했습니다.`
					: `${row.label} — 다시 보고를 시작했습니다.`
			);
		}

		if (!(await isVenueOpen())) return;

		const down = (await db.execute(sql`
			UPDATE scanners
			SET alerted_down_at = NOW()
			WHERE alerted_down_at IS NULL
			  AND last_seen_at < NOW() - ${sql.raw(SILENT_THRESHOLD)}
			  -- 일부러 꺼둔 기기(예비 스캐너, 등록용 단말)는 알리지 않는다.
			  -- 예전에는 "7일 넘게 조용하면 치워둔 것"이라고 추측했는데, 그건
			  -- 오늘 꺼둔 기기를 걸러내지 못하고 오래 고장 난 기기는 영영 무시한다.
			  -- 의도는 사람이 정하는 것이므로 스위치로 받는다(어드민 모니터에서 토글).
			  AND alert_enabled = true
			RETURNING ${sql.raw(DISPLAY_NAME)} AS label,
			          to_char(last_seen_at AT TIME ZONE 'Asia/Seoul', 'MM-DD HH24:MI') AS last_seen_kst,
			          round(EXTRACT(EPOCH FROM (NOW() - last_seen_at)) / 60)::int AS silent_minutes
		`)) as any[];

		for (const row of down) {
			await alert(
				`스캐너 무응답: ${row.label}`,
				`${row.label} — ${row.silent_minutes}분째 보고 없음 (마지막 ${row.last_seen_kst})\n` +
					`이대로 두면 회원이 자리에 있어도 자동 체크아웃됩니다.`
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
			       (metadata->>'free_heap')::int   AS free_heap,
			       alert_enabled
			FROM scanners
			ORDER BY last_seen_at DESC NULLS LAST
		`)) as any[];

		return rows.map((r) => ({
			id: r.id as string,
			silentSeconds: Number(r.silent_seconds ?? 0),
			isDown: r.is_down === true,
			deviceTotal: r.device_total === null ? null : Number(r.device_total),
			freeHeap: r.free_heap === null ? null : Number(r.free_heap),
			alertEnabled: r.alert_enabled === true
		}));
	} catch (e) {
		console.error('[SCANNER] 상태 조회 실패:', e);
		return [];
	}
}

/**
 * 스캐너별 무응답 알림 on/off.
 *
 * 예비 스캐너를 치워두거나 등록용 단말을 꺼두는 일이 실제로 있는데, 그때마다
 * 알림이 오면 알림 자체를 무시하게 된다. 끄고 켜는 판단은 사람이 한다.
 *
 * 끌 때 alerted_down_at도 함께 지운다. 남겨두면 나중에 다시 켰을 때 "이미 알린
 * 상태"로 보여 정작 죽었을 때 알림이 안 나간다.
 */
export async function setScannerAlertEnabled(id: string, enabled: boolean): Promise<boolean> {
	try {
		const rows = (await db.execute(sql`
			UPDATE scanners
			SET alert_enabled = ${enabled},
			    alerted_down_at = CASE WHEN ${enabled} THEN alerted_down_at ELSE NULL END
			WHERE id = ${id}
			RETURNING id
		`)) as any[];
		return rows.length > 0;
	} catch (e) {
		console.error('[SCANNER] 알림 설정 변경 실패:', e);
		return false;
	}
}

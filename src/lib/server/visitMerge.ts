import { sql } from 'drizzle-orm';

/**
 * db와 트랜잭션(tx) 모두 받기 위한 최소 인터페이스.
 *
 * BLE 자동 체크인은 트랜잭션 밖에서, QR 체크인은 트랜잭션 안에서 부른다.
 * 둘이 같은 규칙을 쓰는 것이 중요하므로 실행기만 주입받는다.
 */
type Executor = { execute(query: any): Promise<unknown> };

/**
 * 오늘 자동 체크아웃된 방문이 있으면 새 방문을 만들지 않고 그것을 다시 연다.
 * 되살린 방문의 id를 돌려주고, 없으면 null을 돌려준다.
 *
 * 시간 제한을 두지 않는다. 이 기록으로 알고 싶은 것은 "오늘 왔는가"와 "얼마나
 * 있었는가"이지 중간에 편의점을 다녀왔는지가 아니다. 사람당 하루 한 방문으로
 * 두면 방문 횟수·체류 시간·자주 만난 친구가 모두 탐지 품질에 흔들리지 않는다.
 * 실제로 어떤 회원은 자리에 앉아 있었는데도 하루가 네 조각으로 남았다
 * (19:17~21:15, 21:26~21:47, 22:21~22:54, 22:57~23:08).
 *
 * 다만 수동 체크아웃은 병합하지 않는다. 관리자가 손으로 내보낸 것은 "나갔다"는
 * 사람의 판단이라 되돌리면 안 된다. auto_checkout_logs의 checked_out_at과
 * visits.departure_time이 같은 트랜잭션의 NOW()라 정확히 일치하는 점으로 구분한다.
 *
 * 그리고 마감 이후에는 그 전의 방문을 잇지 않는다.
 *
 * "수동 체크아웃만 거르면 마감도 걸러진다"고 봤는데 아니었다. 자동 체크아웃으로
 * 닫힌 방문이 마감을 거쳐 다음 영업에 다시 열리는 경로가 남아 있었다. 실제로
 * 사루비아의 방문이 10-03 00:08에 시작해 00:28에 자동 체크아웃됐고, 05:32 마감을
 * 지나 그날 저녁에 다시 와서 그 방문이 되살아났다 — 하나의 방문이 마감을 넘어
 * 20시간으로 남았다.
 *
 * 날짜 비교로는 막을 수 없다. 자정을 넘겨 운영하는 날이 있어서 "같은 달력 날짜"가
 * 같은 영업을 뜻하지 않는다(00:08 도착과 그날 저녁 도착은 날짜가 같지만 다른
 * 영업이다). 마감한 시각을 직접 보고 가른다.
 *
 * 이 함수는 BLE 자동 체크인과 QR 체크인이 함께 쓴다. 예전에는 BLE 쪽에만 있어서,
 * 자동 체크아웃된 뒤 **QR로** 다시 들어오면 하루가 쪼개졌다(동동 10-05
 * 14:16~20:23 + 20:39~23:12, 이번 10-09 17:26~20:53 + 21:23~06:00). 체크인 경로가
 * 늘 때 한쪽만 고치면 또 어긋나므로 규칙을 한 곳에 둔다.
 */
export async function reopenAutoClosedVisit(
	exec: Executor,
	attendeeId: number
): Promise<number | null> {
	const rows = (await exec.execute(sql`
        UPDATE visits v
        SET departure_time = NULL
        WHERE v.id = (
            SELECT v2.id FROM visits v2
            JOIN auto_checkout_logs l
              ON l.attendee_id = v2.attendee_id
             AND l.checked_out_at = v2.departure_time
            WHERE v2.attendee_id = ${attendeeId}
              AND v2.departure_time IS NOT NULL
              AND (v2.arrival_time AT TIME ZONE 'Asia/Seoul')::date
                  = (NOW() AT TIME ZONE 'Asia/Seoul')::date
              -- 마감 뒤에 끝난 방문만 잇는다. 형식이 깨진 값으로 체크인 전체가
              -- 막히지 않게 패턴을 확인하고 읽는다.
              AND v2.departure_time > COALESCE((
                      SELECT value::timestamptz FROM system_settings
                      WHERE key = 'last_close_at'
                        AND value ~ '^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}'
                  ), '-infinity'::timestamptz)
            ORDER BY v2.departure_time DESC
            LIMIT 1
        )
        RETURNING v.id
    `)) as any[];

	return rows.length > 0 ? Number(rows[0].id) : null;
}

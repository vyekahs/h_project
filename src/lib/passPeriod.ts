/**
 * 정기권 기간 계산.
 *
 * 이 규칙은 서버(발급 액션)와 화면(발급 전 미리보기) 양쪽이 쓴다. 예전에는
 * 액션 안에 박혀 있어서 화면은 「30일간 유효」라고만 말할 수 있었고, 실제로는
 * 최대 32일이 되는데 발급 전에 만료일을 알 방법이 없었다.
 *
 * 밀어내는 이유가 요일마다 다르다는 점이 중요하다 — 월요일은 휴무, 화요일은
 * 정기권을 적용하지 않는 날이다. 한 문장으로 뭉뚱그리면 나중에 규칙이 바뀔 때
 * 어느 쪽이 바뀐 건지 알 수 없다.
 */

/** 정기권 기본 일수(시작일 당일 포함). */
export const PASS_DAYS = 30;

/** 요일 상수 — getDay() 기준 */
const MON = 1;
const TUE = 2;

export type PassShift = {
	/** 밀리기 전의 만료 날짜 'YYYY-MM-DD' */
	from: string;
	/** 그 날의 요일 라벨 */
	dow: string;
	/** 왜 그 날이 만료일이 될 수 없는가 */
	reason: string;
	/** 이 사유로 밀린 일수 — 언제나 1이다 */
	days: 1;
};

export type PassPeriod = {
	/** 만료 시각 (해당 날짜의 23:59:59.999 KST) */
	expiresAt: Date;
	/** 만료 날짜 'YYYY-MM-DD' (KST) */
	expiresDate: string;
	/** 시작일 당일을 포함한 총 유효 일수 */
	totalDays: number;
	/** 밀린 총 일수 */
	shiftDays: number;
	/**
	 * 밀린 이유들. 하루씩, 각각 다른 이유로 밀린다 — 월요일은 휴무라서,
	 * 화요일은 정기권을 적용하지 않는 날이라서. 「이틀 밀었다」로 뭉치면
	 * 나중에 한쪽 규칙만 바뀔 때 어느 쪽이 바뀐 건지 알 수 없다.
	 */
	shifts: PassShift[];
	/** 사유들을 줄로 이은 문장. 로그 메모와 발급 미리보기가 같은 것을 쓴다. */
	explanation: string | null;
};

function kstEndOfDay(y: number, m: number, d: number): Date {
	// KST(UTC+9)의 23:59:59.999 = UTC 14:59:59.999. 한국은 서머타임이 없다.
	return new Date(Date.UTC(y, m, d, 14, 59, 59, 999));
}

/** 그 요일이 만료일이 될 수 없는 이유. 될 수 있으면 null. */
function blockedReason(dow: number): string | null {
	if (dow === MON) return '휴무';
	if (dow === TUE) return '정기권을 적용하지 않는 날';
	return null;
}

/**
 * 시작일(YYYY-MM-DD)로부터 정기권 기간을 계산한다.
 *
 * 날짜 산술은 전부 UTC 컴포넌트로 한다. 예전 구현은 `new Date('YYYY-MM-DD')`가
 * UTC 자정을 가리키는데 `getDate()`/`getDay()`(로컬)로 더하고 요일을 봤다.
 * 서버 TZ가 KST면 우연히 맞지만, TZ가 다르면 하루 어긋난 요일을 보고 보정한다.
 */
export function computePassPeriod(startDate: string, days: number = PASS_DAYS): PassPeriod | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
	if (!m) return null;
	const [, ys, ms, ds] = m;
	const start = new Date(Date.UTC(Number(ys), Number(ms) - 1, Number(ds)));
	if (Number.isNaN(start.getTime())) return null;

	// 시작일 당일을 포함해 days 일 → +(days - 1)
	const end = new Date(start);
	end.setUTCDate(end.getUTCDate() + (days - 1));

	/*
		막힌 날을 하루씩 넘긴다. 월요일에 걸리면 화요일로 가고, 화요일도 막혀
		있으니 한 번 더 넘어가 수요일이 된다 — 결과는 이틀이지만 이유는 둘이다.
	*/
	const shifts: PassShift[] = [];
	for (let guard = 0; guard < 7; guard++) {
		const reason = blockedReason(end.getUTCDay());
		if (!reason) break;
		shifts.push({
			from: isoOf(end),
			dow: DOW_LABEL[end.getUTCDay()],
			reason,
			days: 1
		});
		end.setUTCDate(end.getUTCDate() + 1);
	}

	return {
		expiresAt: kstEndOfDay(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()),
		expiresDate: isoOf(end),
		totalDays: days + shifts.length,
		shiftDays: shifts.length,
		shifts,
		explanation: shifts.length
			? shifts.map((s) => `만료일 ${mdOf(s.from)}(${s.dow})은 ${s.reason} +${s.days}일`).join(' · ')
			: null
	};
}

function isoOf(d: Date): string {
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function mdOf(iso: string): string {
	const [, mo, d] = iso.split('-');
	return `${Number(mo)}/${Number(d)}`;
}

const DOW_LABEL = ['일', '월', '화', '수', '목', '금', '토'];

/** 'YYYY-MM-DD' → '10/14(수)'. KST 날짜 문자열을 그대로 읽으므로 시간대 변환이 없다. */
export function formatKstDate(iso: string): string {
	const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
	if (!m) return iso;
	const [, y, mo, d] = m;
	const dow = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).getUTCDay();
	return `${Number(mo)}/${Number(d)}(${DOW_LABEL[dow]})`;
}

/**
 * 오늘의 퍼즐 — 하루에 하나, 모두에게 같은 문제.
 *
 * 혼자 하는 퍼즐을 "같이 하는" 게임으로 만들기 위한 것이다. 같은 문제를 푼 기록끼리만
 * 비교하므로 그날 순위가 의미를 갖고, 매일 새 문제라 들어올 이유가 생긴다.
 * 클라이언트(문제 생성)와 서버(날짜 검증)가 같은 날짜 키를 써야 하므로 여기 둔다.
 */

/** 오늘의 퍼즐을 내는 게임 */
export const DAILY_PUZZLE_GAMES = ['water-sort'] as const;
export type DailyPuzzleGame = (typeof DAILY_PUZZLE_GAMES)[number];

export interface DailyEntry {
	userId: number;
	name: string;
	clearTime: number;
	moves: number;
	rank: number;
}

export interface DailyBoard {
	date: string;
	gameId: DailyPuzzleGame;
	/** 빠른 순 상위 기록 */
	top: DailyEntry[];
	/** 오늘 참여한 사람 수 */
	total: number;
	/** 내 오늘 기록 (아직 안 풀었으면 null) */
	mine: DailyEntry | null;
	/** 연속 참여 일수 */
	streak: number;
}

export function isDailyPuzzleGame(id: string): id is DailyPuzzleGame {
	return (DAILY_PUZZLE_GAMES as readonly string[]).includes(id);
}

const KST_DATE = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Asia/Seoul',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
});

/** 한국 시간 기준 날짜 키 (YYYY-MM-DD). 서버 시간대와 무관하다 */
export function kstDateKey(at: Date = new Date()): string {
	return KST_DATE.format(at);
}

/** 날짜 키 하루 전/후 (YYYY-MM-DD 문자열 연산, 시간대 영향 없음) */
export function shiftDateKey(dateKey: string, days: number): string {
	const d = new Date(`${dateKey}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

/** 날짜 키 + 게임 → 32비트 시드 (FNV-1a) */
export function dailySeed(dateKey: string, gameId: string): number {
	let h = 2166136261;
	for (const ch of `${gameId}:${dateKey}`) {
		h ^= ch.charCodeAt(0);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

/** 시드 고정 난수 (mulberry32). Math.random 대신 넣어 같은 문제를 다시 만든다 */
export function seededRandom(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * 연속 참여 일수. 오늘 참여했으면 오늘부터, 아직이면 어제부터 거꾸로 센다
 * (오늘 아직 안 풀었다고 연속 기록이 0으로 보이면 안 되므로).
 */
export function dailyStreak(playedDateKeys: Iterable<string>, today: string): number {
	const played = new Set(playedDateKeys);
	let day = played.has(today) ? today : shiftDateKey(today, -1);
	let streak = 0;
	while (played.has(day)) {
		streak++;
		day = shiftDateKey(day, -1);
	}
	return streak;
}

import { db } from '$lib/server/db/index';
import { sql } from 'drizzle-orm';

export interface RecGame {
	id: number;
	name: string;
	imageUrl: string | null;
	complexity: number | null;
	playtimeMin: number | null;
	reason: string;
}

interface GameAttrs {
	id: number;
	name: string;
	imageUrl: string | null;
	complexity: number | null;
	playtimeMin: number | null;
	categories: string | null;
	mechanics: string | null;
}

const MAX_PER_SECTION = 5;

/** 제외 설정 화면에서 "난이도"로 고를 수 있는 세 구간. complexity(BGG weight) 기준. */
export const DIFFICULTY_BUCKETS = [
	{ value: 'light', label: '가벼움', max: 2 },
	{ value: 'medium', label: '보통', max: 3.5 },
	{ value: 'heavy', label: '무거움', max: Infinity }
] as const;

function difficultyBucket(complexity: number | null): string | null {
	if (complexity == null) return null;
	for (const b of DIFFICULTY_BUCKETS) {
		if (complexity <= b.max) return b.value;
	}
	return null;
}

function tagSet(text: string | null): Set<string> {
	if (!text) return new Set();
	return new Set(text.split(',').map((s) => s.trim()).filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
	if (a.size === 0 || b.size === 0) return 0;
	let shared = 0;
	for (const x of a) if (b.has(x)) shared++;
	const union = a.size + b.size - shared;
	return union === 0 ? 0 : shared / union;
}

function closeness(a: number | null, b: number | null, scale: number): number {
	// 둘 중 하나라도 값이 없으면(수동 등록 게임 등) 벌점도 가점도 주지 않는다 — 중립.
	if (a == null || b == null) return 0.5;
	return Math.max(0, 1 - Math.abs(a - b) / scale);
}

/**
 * 게임 두 개가 얼마나 비슷한 "유형"인지 0~1로 잰다.
 * 난이도(BGG weight, 1~5 스케일이라 분모 4) · 플레이 시간(분, 분모 90) ·
 * 카테고리·메카닉(자카드 유사도)을 같은 비중으로 섞는다.
 */
function gameSimilarity(a: GameAttrs, b: GameAttrs): number {
	const complexityScore = closeness(a.complexity, b.complexity, 4);
	const playtimeScore = closeness(a.playtimeMin, b.playtimeMin, 90);
	const catScore = jaccard(tagSet(a.categories), tagSet(b.categories));
	const mechScore = jaccard(tagSet(a.mechanics), tagSet(b.mechanics));
	return complexityScore * 0.25 + playtimeScore * 0.25 + catScore * 0.25 + mechScore * 0.25;
}

function isExcluded(g: GameAttrs, excludedCategories: Set<string>, excludedDifficulties: Set<string>): boolean {
	const bucket = difficultyBucket(g.complexity);
	if (bucket && excludedDifficulties.has(bucket)) return true;
	if (excludedCategories.size === 0) return false;
	for (const cat of tagSet(g.categories)) {
		if (excludedCategories.has(cat)) return true;
	}
	return false;
}

/**
 * 로그인한 사람에게 안 해본 게임 셋을 추천한다. 세 기준을 각각 따로 계산해서
 * 보여준다(하나로 섞지 않는다) — "왜 추천됐는지"가 점수 하나로 뭉치면
 * 설명할 수 없어지고, 신뢰하기도 어려워진다.
 *
 * 평점(game_ratings)은 이제 막 생긴 기능이라 데이터가 거의 없다. 취향 유사
 * 추천은 자연히 비어 보일 수 있다 — 콜드 스타트라 정상이고, 화면에서 빈 섹션은
 * 숨긴다.
 */
export async function getRecommendations(userId: number): Promise<{
	friendsPlay: RecGame[];
	similarStyle: RecGame[];
	similarTaste: RecGame[];
}> {
	const [playedRows, catalogRows, friendWeightRows, myRatingRows, otherRatingRows, exclusionRows] = await Promise.all([
		db.execute(sql`
			SELECT DISTINCT g.id
			FROM session_participants sp
			JOIN game_sessions gs ON sp.session_id = gs.id
			JOIN games g ON (gs.game_id = g.id) OR (gs.game_id IS NULL AND gs.game_name = g.name)
			WHERE sp.attendee_id = ${userId} AND gs.status = 'finished'
		`),
		db.execute(sql`
			SELECT id, name, image_url, complexity, playtime_min, categories, mechanics
			FROM games WHERE is_active = true
		`),
		// 같이 어울린 정도 = 함께 플레이한 "날짜 수"(하루 여러 판은 1회 — /collection의
		// "자주 만난 친구"와 같은 기준).
		db.execute(sql`
			WITH my_days AS (
				SELECT gs.id AS session_id, (gs.end_time AT TIME ZONE 'Asia/Seoul')::date AS play_date
				FROM session_participants sp
				JOIN game_sessions gs ON sp.session_id = gs.id
				WHERE sp.attendee_id = ${userId} AND gs.status = 'finished' AND gs.end_time IS NOT NULL
			)
			SELECT sp2.attendee_id AS friend_id, COUNT(DISTINCT md.play_date)::int AS weight
			FROM my_days md
			JOIN session_participants sp2 ON sp2.session_id = md.session_id
			WHERE sp2.attendee_id IS NOT NULL AND sp2.attendee_id != ${userId}
			GROUP BY sp2.attendee_id
		`),
		db.execute(sql`SELECT game_id, rating FROM game_ratings WHERE attendee_id = ${userId}`),
		db.execute(sql`SELECT attendee_id, game_id, rating FROM game_ratings WHERE attendee_id != ${userId}`),
		db.execute(sql`SELECT kind, value FROM game_rec_exclusions WHERE attendee_id = ${userId}`)
	]);

	const excludedCategories = new Set<string>();
	const excludedDifficulties = new Set<string>();
	for (const r of exclusionRows as any[]) {
		if (r.kind === 'category') excludedCategories.add(r.value);
		else if (r.kind === 'difficulty') excludedDifficulties.add(r.value);
	}

	const playedIds = new Set((playedRows as any[]).map((r) => Number(r.id)));
	const catalog: GameAttrs[] = (catalogRows as any[]).map((g) => ({
		id: Number(g.id),
		name: g.name,
		imageUrl: g.image_url,
		complexity: g.complexity != null ? Number(g.complexity) : null,
		playtimeMin: g.playtime_min != null ? Number(g.playtime_min) : null,
		categories: g.categories,
		mechanics: g.mechanics
	}));
	const catalogById = new Map(catalog.map((g) => [g.id, g]));
	// 안 해본 게임 중에서도 제외 설정(난이도·카테고리)에 걸리면 세 신호 전부에서 뺀다.
	const candidates = catalog.filter(
		(g) => !playedIds.has(g.id) && !isExcluded(g, excludedCategories, excludedDifficulties)
	);
	const eligibleIds = new Set(candidates.map((g) => g.id));

	const toRecGame = (g: GameAttrs, reason: string): RecGame => ({
		id: g.id,
		name: g.name,
		imageUrl: g.imageUrl,
		complexity: g.complexity,
		playtimeMin: g.playtimeMin,
		reason
	});

	// ── 1) 같이 자주 하는 사람들이 한 게임 ──
	const friendWeight = new Map<number, number>();
	for (const r of friendWeightRows as any[]) friendWeight.set(Number(r.friend_id), Number(r.weight));

	let friendsPlay: RecGame[] = [];
	if (friendWeight.size > 0) {
		const friendIds = '{' + [...friendWeight.keys()].join(',') + '}';
		const friendGameRows = await db.execute(sql`
			SELECT DISTINCT sp.attendee_id AS friend_id, g.id AS game_id
			FROM session_participants sp
			JOIN game_sessions gs ON sp.session_id = gs.id AND gs.status = 'finished'
			JOIN games g ON (gs.game_id = g.id) OR (gs.game_id IS NULL AND gs.game_name = g.name)
			WHERE sp.attendee_id = ANY(${friendIds}::int[]) AND g.is_active = true
		`);
		const scoreByGame = new Map<number, { score: number; friends: number }>();
		for (const r of friendGameRows as any[]) {
			const gameId = Number(r.game_id);
			if (!eligibleIds.has(gameId)) continue;
			const weight = friendWeight.get(Number(r.friend_id)) ?? 0;
			const cur = scoreByGame.get(gameId) ?? { score: 0, friends: 0 };
			cur.score += weight;
			cur.friends += 1;
			scoreByGame.set(gameId, cur);
		}
		friendsPlay = [...scoreByGame.entries()]
			.sort((a, b) => b[1].score - a[1].score)
			.slice(0, MAX_PER_SECTION)
			.map(([gameId, v]) => {
				const g = catalogById.get(gameId)!;
				const reason = v.friends === 1 ? '함께 자주 하는 사람이 플레이했어요' : `함께 자주 하는 사람 ${v.friends}명이 플레이했어요`;
				return toRecGame(g, reason);
			});
	}

	// ── 2) 높게 평가한 게임과 비슷한 유형 ──
	const likedGames = (myRatingRows as any[])
		.filter((r) => Number(r.rating) >= 7)
		.map((r) => ({ game: catalogById.get(Number(r.game_id)), rating: Number(r.rating) }))
		.filter((x): x is { game: GameAttrs; rating: number } => !!x.game);

	let similarStyle: RecGame[] = [];
	if (likedGames.length > 0) {
		const scored = candidates
			.map((cand) => {
				let best = 0;
				for (const { game, rating } of likedGames) {
					const sim = gameSimilarity(cand, game) * (rating / 10);
					if (sim > best) best = sim;
				}
				return { game: cand, score: best };
			})
			.filter((x) => x.score > 0)
			.sort((a, b) => b.score - a.score)
			.slice(0, MAX_PER_SECTION);
		similarStyle = scored.map((x) => toRecGame(x.game, '높게 평가한 게임과 비슷한 유형이에요'));
	}

	// ── 3) 취향 비슷한 사람이 좋아한 게임 ──
	const myRatings = new Map<number, number>();
	for (const r of myRatingRows as any[]) myRatings.set(Number(r.game_id), Number(r.rating));

	const otherRatingsByUser = new Map<number, Map<number, number>>();
	for (const r of otherRatingRows as any[]) {
		const aid = Number(r.attendee_id);
		if (!otherRatingsByUser.has(aid)) otherRatingsByUser.set(aid, new Map());
		otherRatingsByUser.get(aid)!.set(Number(r.game_id), Number(r.rating));
	}

	let similarTaste: RecGame[] = [];
	if (myRatings.size > 0 && otherRatingsByUser.size > 0) {
		// 취향 유사도 = 같이 평가한 게임 중 둘 다 7점 이상 준 개수. 아주 단순한
		// 근사치지만, 평점 데이터가 아직 적은 시점에는 정교한 계산이 의미가 없다.
		const taste = new Map<number, number>();
		for (const [otherId, ratings] of otherRatingsByUser) {
			let coLiked = 0;
			for (const [gameId, myRating] of myRatings) {
				if (myRating >= 7 && (ratings.get(gameId) ?? 0) >= 7) coLiked++;
			}
			if (coLiked > 0) taste.set(otherId, coLiked);
		}

		if (taste.size > 0) {
			const scoreByGame = new Map<number, number>();
			for (const [otherId, similarity] of taste) {
				const ratings = otherRatingsByUser.get(otherId)!;
				for (const [gameId, rating] of ratings) {
					if (rating < 7 || !eligibleIds.has(gameId) || myRatings.has(gameId)) continue;
					scoreByGame.set(gameId, (scoreByGame.get(gameId) ?? 0) + similarity);
				}
			}
			similarTaste = [...scoreByGame.entries()]
				.sort((a, b) => b[1] - a[1])
				// 남이 평가한 게임이 그 사이 비활성화됐을 수 있다 — catalogById에 없으면 건너뛴다.
				.filter(([gameId]) => catalogById.has(gameId))
				.slice(0, MAX_PER_SECTION)
				.map(([gameId]) => toRecGame(catalogById.get(gameId)!, '취향이 비슷한 사람이 좋아했어요'));
		}
	}

	return { friendsPlay, similarStyle, similarTaste };
}

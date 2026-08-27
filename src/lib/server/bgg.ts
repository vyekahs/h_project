/**
 * BoardGameGeek 검색 — 외부 API 호출이라 응답이 느릴 수 있어
 * 짧은 캐시 + 타임아웃을 둔다.
 *
 * 실측 결과 search= 파라미터가 들어간 BGG geekitems API는 매번 6.5~7초가
 * 걸린다(코드/네트워크 문제가 아니라 BGG 서버 자체가 느림 — objectid로 직접
 * 조회하는 importBgg 쪽은 0.2~0.5초로 정상). 그래서 첫 검색은 이 시간이
 * 그대로 걸릴 수밖에 없고, 캐시로 "같은 검색어 재조회"만 없앨 수 있다.
 * 타임아웃은 정상 응답(~7초)을 잘못 끊지 않도록 여유 있게 잡는다.
 */

export interface BggSearchResult {
	id: string;
	name: string;
	year: string;
}

const CACHE_TTL = 10 * 60 * 1000; // 10분: 같은 검색어 반복 시 외부 호출 생략
const FETCH_TIMEOUT = 15000; // 15초: 정상 응답도 7초 가까이 걸리므로 여유를 둠
const MAX_CACHE_ENTRIES = 200;

const searchCache = new Map<string, { data: BggSearchResult[]; timestamp: number }>();

export async function searchBggGames(queryStr: string): Promise<BggSearchResult[]> {
	const key = queryStr.trim().toLowerCase();

	const cached = searchCache.get(key);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
		return cached.data;
	}

	const url = `https://api.geekdo.com/api/geekitems?nosession=1&objecttype=thing&subtype=boardgame&search=${encodeURIComponent(queryStr)}&pagesize=20`;
	const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
	if (!response.ok) {
		throw new Error(`BGG API 오류 (${response.status})`);
	}

	const json = await response.json();
	const games: BggSearchResult[] = (json.items || []).map((item: any) => ({
		id: String(item.objectid),
		name: item.name,
		year: item.yearpublished || ''
	}));

	searchCache.set(key, { data: games, timestamp: Date.now() });
	if (searchCache.size > MAX_CACHE_ENTRIES) {
		const oldestKey = searchCache.keys().next().value;
		if (oldestKey !== undefined) searchCache.delete(oldestKey);
	}

	return games;
}

/**
 * BoardGameGeek 검색/가져오기 — 외부 API(+번역) 호출이라 응답이 느릴 수 있어
 * 캐시 + 타임아웃을 둔다.
 *
 * 실측 결과 search= 파라미터가 들어간 BGG geekitems API는 매번 6.5~7초가
 * 걸린다(코드/네트워크 문제가 아니라 BGG 서버 자체가 느림 — objectid로 직접
 * 조회하는 importBgg 쪽은 0.2~0.5초로 정상). 그래서 첫 검색은 이 시간이
 * 그대로 걸릴 수밖에 없고, 캐시로 "같은 검색어 재조회"만 없앨 수 있다.
 * 타임아웃은 정상 응답(~7초)을 잘못 끊지 않도록 여유 있게 잡는다.
 */

import * as cheerio from 'cheerio';
import { translate } from 'google-translate-api-x';

export interface BggSearchResult {
	id: string;
	name: string;
	year: string;
}

export interface BggImportedGame {
	name: string;
	minPlayers: number;
	maxPlayers: number;
	playtimeMin: number;
	playtimeMax: number;
	minAge: number;
	complexity: number;
	bestPlayers: string;
	description: string;
	imageUrl: string;
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

	// 이 엔드포인트는 pagesize를 무시하고 200건까지 돌려주며, 항목에는
	// name / objectid / objecttype 뿐이다 — 연도도 썸네일도 없다(실측 확인).
	// 게다가 정렬이 알파벳순이라 "catan"에 카드 슬리브가 실제 게임보다 위에 온다.
	// 질의와의 근접도로 다시 정렬해 운영자가 첫 화면에서 진짜 게임을 보게 한다.
	const q = queryStr.trim().toLowerCase();
	const rank = (name: string) => {
		const n = name.toLowerCase();
		if (n === q) return 0;
		if (n.startsWith(q + ' ') || n.startsWith(q + ':')) return 1;
		if (n.startsWith(q)) return 2;
		return 3;
	};

	// 같은 objectid가 이름만 달리해 여러 번 온다(실측: agricola 180건 중 고유 116건).
	// 중복을 남기면 화면의 keyed each가 깨지고, 운영자에게도 같은 게임이 여러 번 보인다.
	const seen = new Set<string>();
	const games: BggSearchResult[] = (json.items || [])
		.filter((item: any) => {
			const id = String(item.objectid);
			if (seen.has(id)) return false;
			seen.add(id);
			return true;
		})
		.map((item: any) => ({
			id: String(item.objectid),
			name: item.name,
			// 이 API는 연도를 주지 않는다. 없는 값을 빈 문자열로 흘려보내면
			// 화면에 "()"만 찍히므로, 없으면 없는 대로 두고 UI가 판단하게 한다.
			year: item.yearpublished ? String(item.yearpublished) : ''
		}))
		.sort((a: BggSearchResult, b: BggSearchResult) => {
			const ra = rank(a.name);
			const rb = rank(b.name);
			if (ra !== rb) return ra - rb;
			// 같은 등급이면 짧은 이름이 먼저 — 확장/슬리브류가 아래로 내려간다
			if (a.name.length !== b.name.length) return a.name.length - b.name.length;
			return a.name.localeCompare(b.name);
		});

	searchCache.set(key, { data: games, timestamp: Date.now() });
	if (searchCache.size > MAX_CACHE_ENTRIES) {
		const oldestKey = searchCache.keys().next().value;
		if (oldestKey !== undefined) searchCache.delete(oldestKey);
	}

	return games;
}

// objectid 직접 조회는 실측 0.2~0.5초로 빠르므로 넉넉히 잡아도 부담 없음
const IMPORT_FETCH_TIMEOUT = 10000;
// 번역(google-translate-api-x)은 실측 1~1.5초 내외
const TRANSLATE_TIMEOUT = 8000;

const hasKorean = (str: string) => /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(str);

/**
 * BGG에서 게임 정보를 가져와 필요하면 한국어로 번역까지 마친 데이터를 반환한다.
 * BGG fetch → 번역 순서로 의존관계가 있어 두 단계를 합칠 수는 없지만,
 * 각 단계 내부(item/dynamicinfo, 이름/설명 번역)는 이미 병렬로 처리한다.
 */
export async function fetchAndTranslateBggGame(bggId: string, searchName?: string): Promise<BggImportedGame> {
	const [itemRes, dynamicRes] = await Promise.all([
		fetch(`https://api.geekdo.com/api/geekitems?nosession=1&objecttype=thing&objectid=${bggId}`, {
			signal: AbortSignal.timeout(IMPORT_FETCH_TIMEOUT)
		}),
		fetch(`https://api.geekdo.com/api/dynamicinfo?nosession=1&objecttype=thing&objectid=${bggId}`, {
			signal: AbortSignal.timeout(IMPORT_FETCH_TIMEOUT)
		})
	]);
	const itemJson = await itemRes.json();
	const dynamicJson = await dynamicRes.json();
	const item = itemJson.item;
	const dynamic = dynamicJson.item;

	if (!item) {
		throw new Error('Could not find game data on BGG');
	}

	let name = item.name;
	const minPlayers = parseInt(item.minplayers || '0');
	const maxPlayers = parseInt(item.maxplayers || '0');
	const playtimeMin = parseInt(item.minplaytime || '0');
	const playtimeMax = parseInt(item.maxplaytime || '0');
	const minAge = parseInt(item.minage || '0');

	// Clean Description (remove HTML)
	let description = item.description || '';
	description = cheerio.load(description).text();

	// Translate Name and Description
	const translateOpts = { requestOptions: { signal: AbortSignal.timeout(TRANSLATE_TIMEOUT) } };
	try {
		if (searchName && hasKorean(searchName)) {
			if (searchName.trim() !== name.trim()) {
				name = `${searchName} (${name})`;
			}
			const descRes: any = await translate(description, { to: 'ko', ...translateOpts });
			description = descRes.text;
		} else {
			const [nameRes, descRes]: any = await Promise.all([
				translate(name, { to: 'ko', ...translateOpts }),
				translate(description, { to: 'ko', ...translateOpts })
			]);
			const translatedName = nameRes.text;
			if (translatedName && translatedName.trim() !== name.trim()) {
				name = `${translatedName} (${name})`;
			}
			description = descRes.text;
		}
	} catch (tErr) {
		console.error('[Translation Error]', tErr);
	}

	const imageUrl = item.imageurl || item.images?.medium || '';

	let complexity = 0;
	if (dynamic?.stats?.avgweight) {
		complexity = parseFloat(dynamic.stats.avgweight);
	}

	let bestPlayers = '';
	if (dynamic?.polls?.userplayers?.best) {
		const best = dynamic.polls.userplayers.best;
		bestPlayers = best
			.map((b: any) => (b.min === b.max ? b.min : `${b.min}-${b.max}`))
			.join(', ');
	}

	return { name, minPlayers, maxPlayers, playtimeMin, playtimeMax, minAge, complexity, bestPlayers, description, imageUrl };
}

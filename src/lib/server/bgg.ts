/**
 * BoardGameGeek 검색/가져오기 — 외부 API(+번역) 호출이라 응답이 느릴 수 있어
 * 캐시 + 타임아웃을 둔다.
 *
 * 검색·가져오기 모두 공식 XML API(앱 토큰 필요)를 쓴다.
 * 캐시는 "같은 검색어 재조회"만 없앤다.
 */

import * as cheerio from 'cheerio';
import { translate } from 'google-translate-api-x';
import { env } from '$env/dynamic/private';

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
	categories: string;
	mechanics: string;
	description: string;
	imageUrl: string;
}

const CACHE_TTL = 10 * 60 * 1000; // 10분: 같은 검색어 반복 시 외부 호출 생략
const FETCH_TIMEOUT = 15000; // 15초: 외부 API라 여유를 둠
const MAX_CACHE_ENTRIES = 200;

const searchCache = new Map<string, { data: BggSearchResult[]; timestamp: number }>();

/**
 * 공식 XML API 호출. 2026-10에 BGG가 비로그인 검색(geekitems?search=)을 401로 막아
 * 등록된 앱 토큰으로 옮겼다. 비공식 geekitems/dynamicinfo는 언제 막혀도 이상하지 않아
 * 가져오기도 같은 API로 맞췄다. 토큰 발급: https://boardgamegeek.com/applications
 */
async function fetchBggXml(path: string, timeout: number) {
	const token = env.BGG_API_TOKEN;
	if (!token) {
		throw new Error('BGG 연동에는 BGG_API_TOKEN 설정이 필요합니다.');
	}
	const response = await fetch(`https://boardgamegeek.com/xmlapi2/${path}`, {
		headers: { Authorization: `Bearer ${token}` },
		signal: AbortSignal.timeout(timeout)
	});
	if (!response.ok) {
		throw new Error(`BGG API 오류 (${response.status})`);
	}
	return cheerio.load(await response.text(), { xml: true });
}

export async function searchBggGames(queryStr: string): Promise<BggSearchResult[]> {
	const key = queryStr.trim().toLowerCase();

	const cached = searchCache.get(key);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
		return cached.data;
	}

	const $ = await fetchBggXml(
		`search?type=boardgame&query=${encodeURIComponent(queryStr)}`,
		FETCH_TIMEOUT
	);
	const items = $('item')
		.map((_, el) => ({
			objectid: $(el).attr('id'),
			name: $(el).children('name').attr('value') ?? '',
			yearpublished: $(el).children('yearpublished').attr('value')
		}))
		.get();

	// 정렬이 질의 근접도와 무관해 "catan"에 확장·파생작이 실제 게임보다 위에 온다.
	// 질의와의 근접도로 다시 정렬해 운영자가 첫 화면에서 진짜 게임을 보게 한다.
	const q = queryStr.trim().toLowerCase();
	const rank = (name: string) => {
		const n = name.toLowerCase();
		if (n === q) return 0;
		if (n.startsWith(q + ' ') || n.startsWith(q + ':')) return 1;
		if (n.startsWith(q)) return 2;
		return 3;
	};

	// 같은 objectid가 이름(대체 이름)만 달리해 여러 번 온다.
	// 중복을 남기면 화면의 keyed each가 깨지고, 운영자에게도 같은 게임이 여러 번 보인다.
	const seen = new Set<string>();
	const games: BggSearchResult[] = items
		.filter((item: any) => {
			const id = String(item.objectid);
			if (seen.has(id)) return false;
			seen.add(id);
			return true;
		})
		.map((item: any) => ({
			id: String(item.objectid),
			name: item.name,
			// 연도가 없는 항목도 있다 — 빈 값으로 두고 UI가 판단하게 한다.
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

// 단건 조회라 빠르지만 외부 API라 넉넉히 잡는다
const IMPORT_FETCH_TIMEOUT = 10000;
// 번역(google-translate-api-x)은 실측 1~1.5초 내외
const TRANSLATE_TIMEOUT = 8000;

const hasKorean = (str: string) => /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(str);

/**
 * BGG에서 게임 정보를 가져와 필요하면 한국어로 번역까지 마친 데이터를 반환한다.
 * BGG fetch → 번역 순서로 의존관계가 있어 두 단계를 합칠 수는 없지만,
 * 번역 단계 내부(이름/설명)는 병렬로 처리한다.
 */
export async function fetchAndTranslateBggGame(bggId: string, searchName?: string): Promise<BggImportedGame> {
	// stats=1이어야 statistics(난이도)가 같이 온다
	const $ = await fetchBggXml(`thing?id=${encodeURIComponent(bggId)}&stats=1`, IMPORT_FETCH_TIMEOUT);
	const item = $('items > item').first();

	if (item.length === 0) {
		throw new Error('Could not find game data on BGG');
	}

	// XML API는 숫자/이름을 전부 value 속성으로 준다
	const attr = (selector: string) => item.children(selector).attr('value') ?? '';
	const int = (selector: string) => parseInt(attr(selector) || '0');

	let name = item.children('name[type="primary"]').attr('value') ?? '';
	const minPlayers = int('minplayers');
	const maxPlayers = int('maxplayers');
	const playtimeMin = int('minplaytime');
	const playtimeMax = int('maxplaytime');
	const minAge = int('minage');

	// XML 이스케이프를 벗긴 뒤에도 본문에 HTML 엔티티(&amp;mdash; 등)가 남아 있어 한 번 더 푼다
	let description = item.children('description').text();
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

	const imageUrl = item.children('image').text().trim();

	const avgWeight = parseFloat(item.find('statistics ratings averageweight').attr('value') ?? '');
	const complexity = Number.isFinite(avgWeight) ? avgWeight : 0;

	// "Best with 3–4 players" / "Best with 1, 4 players" 형태의 요약을 기존 저장 형식("3-4", "1, 4")으로
	let bestPlayers = '';
	const bestWith = item.find('poll-summary[name="suggested_numplayers"] result[name="bestwith"]').attr('value') ?? '';
	const bestMatch = bestWith.match(/^Best with (.+?) players?$/);
	if (bestMatch) {
		bestPlayers = bestMatch[1].replace(/[–—]/g, '-');
	}

	// BGG는 카테고리(장르)와 메카닉(스타일)을 별개 분류로 둔다 — 합치지 않는다.
	const linkNames = (type: string) =>
		item
			.children(`link[type="${type}"]`)
			.map((_, el) => $(el).attr('value'))
			.get()
			.join(', ');
	const categories = linkNames('boardgamecategory');
	const mechanics = linkNames('boardgamemechanic');

	return { name, minPlayers, maxPlayers, playtimeMin, playtimeMax, minAge, complexity, bestPlayers, categories, mechanics, description, imageUrl };
}

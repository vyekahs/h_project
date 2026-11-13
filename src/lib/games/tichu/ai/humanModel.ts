/**
 * 사람 기록으로 학습한 수 선택 모델.
 *
 * 실제 사람이 둔 판(tichu_decision_log)에서, 사람이 낼 수 있었던 후보 수마다 특징을 뽑고
 * "사람이 이 수를 골랐는가"를 맞히도록 결정 트리 묶음(그래디언트 부스팅)을 학습했다.
 * 게임에서는 같은 방식으로 후보마다 점수를 매겨 가장 높은 수를 낸다.
 *
 * 특징에는 규칙 AI 다섯 명이 각자 고른 수(ai_*)와 탐색 점수(aiScore)가 들어간다. 모델은
 * 규칙 AI를 버리는 게 아니라 "규칙 AI의 판단 + 상황"을 보고 사람이 어느 쪽을 택하는지
 * 배운 것이다. 그래서 수 하나를 고를 때 규칙 AI를 다섯 번 돌린다.
 *
 * 특징 추출은 학습 때 쓴 것과 **한 글자도 다르면 안 된다**. 학습 스크립트도 이 파일의
 * extractCandidates를 그대로 불러 특징을 만든다.
 *
 * 학습 데이터: 사람 716라운드, 판단 7,027번. 확인용 라운드(학습에 안 쓴 절반)에서 사람이 고른
 * 수를 맞힌 비율 66% (규칙 AI 최고 59%). 시뮬레이션(시드 7개 × 100게임, 한 팀만 모델)에서
 * 라운드당 +23점, 7개 모두 플러스, 게임 승률 약 48% → 71%.
 *
 * 사람 표시(u_*): 누구의 판단인지를 특징으로 넣어 같이 학습했다. 게임에서는 AI 캐릭터에 맞는
 * 사람 표시를 켜서 그 사람 쪽으로 기울인다. 효과는 작다(사람별 일치율 −0.4~+1.4%p) —
 * 사람들끼리 두는 방식의 차이보다 공통점이 훨씬 크다.
 */
import type { Card, Combination, SeatIndex } from '../types';
import type { AiDecisionContext, AiStrategy } from './types';
import { decidePlay } from './strategy';
import { getWeightsForStrategy, getBehaviorForStrategy } from './presets';
import { findBeatablePlays, findLeadPlays, findOptimalPartition, findAllPlayableCombinations } from './handEvaluator';
import { buildCardTracker, comboLikelyToWin } from './cardTracker';
import { searchBestPlay, calcExitRate } from './playSearchGrid';
import { isBomb } from '../combinations';
import { getCardPoints, getPartnerSeat } from '../constants';
import { mustPlayWishedRank } from '../wish';

/** AI 캐릭터 → 학습 데이터의 사람 표시. 이리는 특정 사람 없이 모두의 평균이다. */
const PERSONAS = ['arang', 'memo', 'odin', 'rami'] as const;
const PERSONA_OF: Record<AiStrategy, (typeof PERSONAS)[number] | null> = {
	aggressive: 'arang',
	tricky: 'memo',
	balanced: 'odin',
	wild: 'rami',
	defensive: null
};

/**
 * 캐릭터별 경향 보정 — 모델 점수에 더한다.
 *
 * 사람 표시(u_*)만으로는 기록이 적어 캐릭터가 거의 같게 두었다(AI끼리 같은 수 98%).
 * 그런데 실제 기록에는 뚜렷한 경향 차이가 있다: 라미는 상대가 이길 때 22%만 패스하고
 * (아랭 34%, 오딘 41%), 손패 9장 이상에서 큰 조합부터 내는 비율이 76%다(아랭 60%).
 *
 * 그 사람이 실제로 겪은 상황들에서 AI가 고른 수의 비율이 그 사람의 비율과 같아지는 값을
 * 찾고(학습 스크립트 calib2.py), 전체 기록에 맞춘 값을 뺀 **차이만** 넣는다. 이리는 0.
 * 사람 비율을 그대로 따라 하면 모두에게 공통인 사람의 약점(파트너 트릭을 덮는 실수 —
 * 모델 89% vs 사람 76% 패스)까지 따라 해서 라운드당 −5점이었다(시드 7개, 7/7 손해).
 * 차이만 넣으면 손해가 없다(+2, 시드 7개 중 4개 플러스).
 *  - passOpp: 상대가 이기고 있는 트릭에서 패스
 *  - passPartner: 파트너가 이기고 있는 트릭에서 패스
 *  - bigLead: 손패 9장 이상일 때 3장 이상 조합(폭탄 제외)으로 리드
 *  - highFollow: 받을 때 A·용·봉황 낱장
 * 같은 상황 7천 번에 두게 하면 캐릭터끼리 같은 수 91~97%.
 */
type Tendency = { passOpp: number; passPartner: number; bigLead: number; highFollow: number };
const PERSONA_BIAS: Record<AiStrategy, Tendency> = {
	aggressive: { passOpp: -0.2, passPartner: -0.1, bigLead: 0.1, highFollow: 0 },
	tricky: { passOpp: -0.5, passPartner: 0.8, bigLead: 0.1, highFollow: -0.5 },
	balanced: { passOpp: -0.2, passPartner: -0.4, bigLead: -0.1, highFollow: -0.2 },
	wild: { passOpp: -0.3, passPartner: -0.3, bigLead: 1.1, highFollow: -0.3 },
	defensive: { passOpp: 0, passPartner: 0, bigLead: 0, highFollow: 0 }
};

export const MODEL_PRESETS: AiStrategy[] = ['aggressive', 'balanced', 'defensive', 'tricky', 'wild'];
const TYPES = ['single', 'pair', 'triple', 'full_house', 'straight', 'stairs', 'four_bomb', 'straight_flush_bomb'];

export const FEATURE_NAMES = [
	// 상황
	'lead', 'hand', 'oppMin', 'partnerCards', 'partnerOut', 'topPartner', 'topRank', 'trickPts', 'meDecl', 'partnerDecl', 'oppDecl', 'turnsNow',
	// 후보
	'pass', 'n', ...TYPES.map(t => `t_${t}`), 'rank', 'high', 'phoenix', 'dragon', 'mahjong', 'dTurns', 'turnsAfter', 'remaining',
	'loose', 'winProb', 'exitAfter', 'pureAfter', 'aiScore', 'aiScoreRank', 'rankOrder', 'isLowest', 'isHighest',
	...MODEL_PRESETS.map(p => `ai_${p}`)
];

/** 무늬를 뺀 카드 이름 묶음 — 무늬만 다른 수는 같은 수로 본다 */
export const normKey = (ids: string[]) => ids.map(c => (c.includes('_') ? c.split('_')[1] : c)).sort().join(' ');

const partition = (cs: Card[]) => cs.length === 0 ? { turns: 0, combos: [] as Combination[] }
	: findOptimalPartition(cs, findAllPlayableCombinations(cs).filter(c => !isBomb(c)));

const isDog = (c: Card) => c.type === 'special' && c.special === 'dog';
const declared = (p: { grandTichu: boolean | null; smallTichu: boolean }) => p.smallTichu || p.grandTichu === true;

export interface CandidateSet {
	/** null = 패스 */
	cands: (Combination | null)[];
	keys: string[];
	feats: number[][];
	/** 규칙 AI 프리셋별로 고른 수 ('P' = 패스) */
	aiPicks: Record<string, string>;
	aiRaw: Record<string, string[] | 'pass'>;
}

export function extractCandidates(ctx: AiDecisionContext): CandidateSet {
	const me = ctx.currentSeat;
	const partnerSeat = getPartnerSeat(me) as SeatIndex;
	const oppSeats = [(me + 1) % 4, (me + 3) % 4] as SeatIndex[];
	const hand = ctx.hand;
	const plays = ctx.trick?.plays ?? [];
	const top = plays.length ? plays[plays.length - 1].combination : null;
	const lead = !top;

	const raw = lead ? findLeadPlays(hand) : findBeatablePlays(hand, top!);
	const byKey = new Map<string, Combination>();
	for (const c of raw) {
		if (c.cards.some(isDog)) continue;
		const k = normKey(c.cards.map(x => x.id));
		if (!byKey.has(k)) byKey.set(k, c);
	}
	const cands: (Combination | null)[] = [...byKey.values()];
	if (!lead) cands.push(null);
	const keys = cands.map(c => (c ? normKey(c.cards.map(x => x.id)) : 'P'));

	const tracker = buildCardTracker(ctx);
	const part = partition(hand);
	const inMulti = new Set<string>();
	for (const mc of part.combos) if (mc.type !== 'single') for (const x of mc.cards) inMulti.add(x.id);
	const aiPicks: Record<string, string> = {};
	const aiRaw: Record<string, string[] | 'pass'> = {};
	for (const p of MODEL_PRESETS) {
		try {
			const d = decidePlay(ctx, getWeightsForStrategy(p), getBehaviorForStrategy(p));
			aiRaw[p] = d;
			aiPicks[p] = d === 'pass' ? 'P' : normKey(d);
		} catch {
			aiPicks[p] = 'ERR';
		}
	}
	const real = cands.filter((c): c is Combination => c !== null && !isBomb(c));
	const grid = real.length
		? searchBestPlay(hand, real, tracker, ctx, getWeightsForStrategy('balanced'), getBehaviorForStrategy('balanced'), lead ? 'lead' : 'follow')
		: [];
	const gridScore = new Map(grid.map((r, i) => [normKey(r.combo.cards.map(x => x.id)), { score: r.totalScore, rank: i }]));
	const ranks = cands.map(c => (c ? c.rank : -1));
	const sortedRanks = [...new Set(ranks.filter(r => r >= 0))].sort((a, b) => a - b);

	const p = ctx.players;
	const activeOpps = oppSeats.filter(x => p[x].finishOrder === null);
	const ctxF = [
		lead ? 1 : 0, hand.length,
		activeOpps.length ? Math.min(...activeOpps.map(x => p[x].hand.length)) : 0,
		p[partnerSeat].hand.length,
		p[partnerSeat].finishOrder !== null ? 1 : 0,
		plays.length && plays[plays.length - 1].seat === partnerSeat ? 1 : 0,
		top ? top.rank : 0,
		plays.flatMap(pl => pl.combination.cards).reduce((a, c) => a + getCardPoints(c), 0),
		declared(p[me]) ? 1 : 0, declared(p[partnerSeat]) ? 1 : 0,
		oppSeats.some(x => declared(p[x])) ? 1 : 0,
		part.turns
	];

	const feats = cands.map((c, i) => {
		const key = keys[i];
		let f: number[];
		if (!c) {
			f = [1, 0, ...TYPES.map(() => 0), 0, 0, 0, 0, 0, 0, part.turns, hand.length, 0, 0, 0, 0, 0, -1, -1, 0, 0];
		} else {
			const rest = hand.filter(h => !c.cards.some(x => x.id === h.id));
			const pr = partition(rest);
			const special = (n: string) => c.cards.some(x => x.type === 'special' && x.special === n) ? 1 : 0;
			const ex = rest.length ? calcExitRate(rest, tracker) : { rate: 1, pureWinRate: 1 };
			const gs = gridScore.get(key);
			const ro = sortedRanks.indexOf(c.rank);
			f = [0, c.cards.length, ...TYPES.map(t => (c.type === t ? 1 : 0)), c.rank,
				(c.type === 'single' && (c.rank >= 14 || special('phoenix') || special('dragon'))) ? 1 : 0,
				special('phoenix'), special('dragon'), special('mahjong'), pr.turns - (part.turns - 1), pr.turns, rest.length,
				(c.type === 'single' && !inMulti.has(c.cards[0].id)) ? 1 : 0,
				comboLikelyToWin(c, tracker, hand), ex.rate, ex.pureWinRate,
				gs ? gs.score : -1, gs ? gs.rank : -1, sortedRanks.length > 1 ? ro / (sortedRanks.length - 1) : 0,
				ro === 0 ? 1 : 0, ro === sortedRanks.length - 1 ? 1 : 0];
		}
		f.push(...MODEL_PRESETS.map(pp => (aiPicks[pp] === key ? 1 : 0)));
		return [...ctxF, ...f];
	});

	return { cands, keys, feats, aiPicks, aiRaw };
}

// ===== 추론 =====

/**
 * 트리 하나: 노드 배열을 평평하게 담는다.
 * 내부 노드: [특징 번호, 임계값, 왼쪽, 오른쪽] — 값 <= 임계값이면 왼쪽.
 * 잎: [-1, 값]
 */
export type Tree = number[][];
export interface HumanModel {
	features: string[];
	baseline: number;
	trees: Tree[];
}

export function scoreFeatures(model: HumanModel, f: number[]): number {
	let s = model.baseline;
	for (const tree of model.trees) {
		let n = 0;
		for (;;) {
			const node = tree[n];
			if (node[0] < 0) { s += node[1]; break; }
			n = f[node[0]] <= node[1] ? node[2] : node[3];
		}
	}
	return s;
}

/**
 * 모델로 수를 고른다. 모델이 다룰 수 없는 경우(소원 강제, 개)는 null → 규칙 AI에 맡긴다.
 * preset: AI 캐릭터. 사람 표시를 고르고, 개를 낼지처럼 모델이 배우지 않은 판단을 맡길 규칙 AI다.
 */
export function decideHumanPlay(
	ctx: AiDecisionContext,
	model: HumanModel,
	preset: AiStrategy
): string[] | 'pass' | null {
	const persona = PERSONAS.map(p => (PERSONA_OF[preset] === p ? 1 : 0));
	if (ctx.wish.active && ctx.wish.requestedRank !== null && mustPlayWishedRank(ctx.hand, ctx.wish)) return null;
	const set = extractCandidates(ctx);
	const fb = set.aiRaw[preset];
	// 개는 후보에 없다(학습에서 뺐다) — 규칙 AI가 개를 냈으면 그대로 따른다
	if (fb && fb !== 'pass' && fb.length === 1 && ctx.hand.some(c => c.id === fb[0] && isDog(c))) return fb;
	if (set.cands.length === 0) return null;
	const bias = __personaBias.on ? PERSONA_BIAS[preset] : null;
	let best = 0;
	let bestScore = -Infinity;
	set.feats.forEach((f, i) => {
		let s = scoreFeatures(model, model.features.length > f.length ? [...f, ...persona] : f);
		if (bias) s += tendencyBias(f, bias);
		if (s > bestScore) { bestScore = s; best = i; }
	});
	const c = set.cands[best];
	return c ? c.cards.map(x => x.id) : 'pass';
}

const FI = Object.fromEntries(FEATURE_NAMES.map((n, i) => [n, i])) as Record<string, number>;

function tendencyBias(f: number[], b: Tendency): number {
	if (f[FI.pass] === 1) return f[FI.topPartner] === 1 ? b.passPartner : b.passOpp;
	if (f[FI.lead] === 0) return f[FI.high] === 1 ? b.highFollow : 0;
	const bomb = f[FI.t_four_bomb] === 1 || f[FI.t_straight_flush_bomb] === 1;
	if (f[FI.hand] >= 9 && f[FI.n] >= 3 && !bomb) return b.bigLead;
	return 0;
}

/** 실험용 스위치 (시뮬레이션에서 보정을 끄고 비교) */
export const __personaBias = { on: true };

// ===== 불러오기 =====
// 모델 파일(약 400KB)은 티츄를 열 때만 따로 받는다. 받기 전이나 실패하면 규칙 AI로 둔다.

let loaded: HumanModel | null = null;
let loading: Promise<HumanModel | null> | null = null;

export function loadHumanModel(): Promise<HumanModel | null> {
	loading ??= import('./humanModel.json')
		.then(m => (loaded = m.default as unknown as HumanModel))
		.catch(() => null);
	return loading;
}

export function getHumanModel(): HumanModel | null {
	return loaded;
}

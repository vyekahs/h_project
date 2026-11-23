/**
 * 사람 기록으로 학습한 수 선택 모델.
 *
 * 실제 사람이 둔 판(tichu_decision_log)에서, 사람이 낼 수 있었던 후보 수마다 특징을 뽑고
 * "사람이 이 수를 골랐는가"를 맞히도록 결정 트리 묶음(그래디언트 부스팅)을 학습했다.
 * 게임에서는 같은 방식으로 후보마다 점수를 매겨 가장 높은 수를 낸다.
 *
 * 특징에는 규칙 AI 다섯 명이 각자 고른 수(ai_*)와 탐색 점수(aiScore)가 들어간다. 모델은
 * 규칙 AI를 버리는 게 아니라 "규칙 AI의 판단 + 상황"을 보고 사람이 어느 쪽을 택하는지
 * 배운 것이다. 그래서 수 하나를 고를 때 규칙 AI를 다섯 번 돌린다. strategy.ts의 카드 내기
 * 규칙(decidePlay)을 바꾸면 이 특징의 분포가 달라지므로 다시 학습해야 한다.
 *
 * 특징 추출은 학습 때 쓴 것과 **한 글자도 다르면 안 된다**. 학습 자료는 기록을 이 파일의
 * extractCandidates로 재생해서 만든다 (tools/recordReplay.test.ts → scripts/tichu-model/train.py).
 *
 * 학습 자료(2026-11-22): 사람 832라운드, 선택지가 둘 이상인 판단 8,240번 중 소원 때문에 낸 것일
 * 수 있는 471번을 뺀 7,769번.
 * 학습에 안 쓴 판에서 사람이 고른 수를 맞힌 비율(다섯 묶음 교차 검증):
 *   처음 특징 44개 68.1% → 상황 조건 23개를 더해 70.4% (규칙 AI 최고 59%)
 *   소원이 아닌 판단만 보면 71.7% → 소원 가능 판단을 학습에서 빼고 72.1%
 *
 * 소원: 기록에 소원이 남지 않던 때라, 참새 위에서 사람이 억지로 낸 A·K(192번 중 88번)를 고른 수로
 * 배워 AI가 참새 위에 A·K를 냈다(같은 순간 83%). 재생 도구가 네 사람 손패로 소원을 역추적해
 * 그런 수를 걸러낸다(tools/recordReplay.test.ts의 wish.forced). 지금은 참새 위에 9 이하를 낸다.
 * 사람 비율이 한쪽으로 심하게 쏠린 상황은 습관이 아니라 기록에 없는 강제 조건일 수 있다.
 * 사람이 폭탄·용·A를 언제 내는지 조건 조합으로 되짚어 보니, 모델이 못 보던 것(바닥 주인의
 * 남은 장수, 내 뒤에 낼 사람, 가장 싸게 이기려면 뭘 써야 하나)이 판단을 갈랐다.
 * 예: 상대 K 이하 낱장을 용으로만 이길 수 있고 4턴 이상 남았을 때 — 사람 27%, 예전 모델 50%, 지금 23%.
 *
 * 사람 표시(u_*): 누구의 판단인지를 특징으로 넣어 같이 학습했다. 게임에서는 AI 캐릭터에 맞는
 * 사람 표시를 켠다. 맞히는 비율에는 거의 보탬이 안 된다 — 카드를 내는 방식은 사람끼리
 * 차이보다 공통점이 훨씬 크다. 캐릭터 차이는 아래 상황 보정과 habits.ts(폭탄·개)에서 난다.
 */
import type { Card, Combination, SeatIndex } from '../types';
import type { AiDecisionContext, AiStrategy } from './types';
import { decidePlay } from './strategy';
import { getWeightsForStrategy, getBehaviorForStrategy } from './presets';
import { findBeatablePlays, findLeadPlays, findOptimalPartition, findAllPlayableCombinations, findBombs } from './handEvaluator';
import { buildCardTracker, comboLikelyToWin } from './cardTracker';
import { searchBestPlay, calcExitRate } from './playSearchGrid';
import { isBomb } from '../combinations';
import { getCardPoints, getPartnerSeat, getNextActiveSeat } from '../constants';
import { mustPlayWishedRank } from '../wish';
import { decideDogLead } from './habits';
import { DEFAULT_HABITS } from './presets/types';
import { defenseBias } from './tichuDefense';

/** AI 캐릭터 → 학습 데이터의 사람 표시. 이리는 특정 사람 없이 모두의 평균이다. */
const PERSONAS = ['arang', 'memo', 'odin', 'rami'] as const;
const PERSONA_OF: Record<AiStrategy, (typeof PERSONAS)[number] | null> = {
	aggressive: 'arang',
	tricky: 'memo',
	balanced: 'odin',
	wild: 'rami',
	defensive: null
};

export const MODEL_PRESETS: AiStrategy[] = ['aggressive', 'balanced', 'defensive', 'tricky', 'wild'];
const TYPES = ['single', 'pair', 'triple', 'full_house', 'straight', 'stairs', 'four_bomb', 'straight_flush_bomb'];

export const FEATURE_NAMES = [
	// 상황
	'lead', 'hand', 'oppMin', 'partnerCards', 'partnerOut', 'topPartner', 'topRank', 'trickPts', 'meDecl', 'partnerDecl', 'oppDecl', 'turnsNow',
	// 후보
	'pass', 'n', ...TYPES.map(t => `t_${t}`), 'rank', 'high', 'phoenix', 'dragon', 'mahjong', 'dTurns', 'turnsAfter', 'remaining',
	'loose', 'winProb', 'exitAfter', 'pureAfter', 'aiScore', 'aiScoreRank', 'rankOrder', 'isLowest', 'isHighest',
	...MODEL_PRESETS.map(p => `ai_${p}`),
	// 상황 조건 (2026-11 추가) — 사람이 폭탄·용·A를 언제 내는지 조건 조합으로 되짚어 보니
	// 모델이 못 보던 것들이 판단을 갈랐다: 바닥 주인이 몇 장 남았는지, 내 뒤에 낼 사람이
	// 남았는지, 가장 싸게 이기려면 무엇을 써야 하는지.
	'ownerLeft', 'ownerDecl', 'ownerIsNext', 'nextLeft', 'prevLeft', 'toAct', 'topN', 'nOut',
	'hasDragon', 'hasPhoenix', 'nAce', 'nKing', 'hasBomb', 'hasDog',
	'nBeat', 'cheapRank', 'cheapCost', 'cheapHigh', 'played', 'iLed', 'partnerLed', 'nPlays',
	// 후보: 이길 수 있는 수 중 가장 싼 수인가
	'isCheapest'
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

	// --- 상황 조건
	const ownerSeat = plays.length ? plays[plays.length - 1].seat : null;
	const nextSeat = getNextActiveSeat(me, p) as SeatIndex;
	let prevSeat: number = me;
	for (let i = 1; i <= 3; i++) {
		const s = (me + 4 - i) % 4;
		if (p[s].finishOrder === null) { prevSeat = s; break; }
	}
	// 내 뒤에 아직 낼 사람 수 (바닥 주인에게 돌아가기 전까지)
	let toAct = 0;
	if (ownerSeat === null) toAct = p.filter(x => x.seat !== me && x.finishOrder === null).length;
	else for (let s: number = nextSeat, guard = 0; s !== ownerSeat && s !== me && guard < 4; s = getNextActiveSeat(s, p), guard++) toAct++;
	const fi = (name: string) => FEATURE_NAMES.indexOf(name);
	const [iRank, iN, iDTurns, iHigh] = [fi('rank'), fi('n'), fi('dTurns'), fi('high')];
	// 폭탄 말고 낼 수 있는 수 중 가장 싼 수 (리드면 가장 낮은 수)
	let cheap = -1;
	let nBeat = 0;
	cands.forEach((c, i) => {
		if (!c || isBomb(c)) return;
		nBeat++;
		if (cheap < 0 || feats[i][iRank] < feats[cheap][iRank] ||
			(feats[i][iRank] === feats[cheap][iRank] && feats[i][iN] < feats[cheap][iN])) cheap = i;
	});
	const count = (pred: (c: Card) => boolean) => hand.filter(pred).length;
	const special = (n: string) => (c: Card) => c.type === 'special' && c.special === n;
	const situ = [
		ownerSeat === null ? -1 : p[ownerSeat].hand.length,
		ownerSeat !== null && declared(p[ownerSeat]) ? 1 : 0,
		ownerSeat !== null && ownerSeat === nextSeat ? 1 : 0,
		p[nextSeat].hand.length, p[prevSeat].hand.length, toAct,
		top ? top.cards.length : 0, p.filter(x => x.finishOrder !== null).length,
		count(special('dragon')) ? 1 : 0, count(special('phoenix')) ? 1 : 0,
		count(c => c.type === 'normal' && c.rank === 14), count(c => c.type === 'normal' && c.rank === 13),
		findBombs(hand).length ? 1 : 0, count(isDog) ? 1 : 0,
		nBeat, cheap < 0 ? -1 : feats[cheap][iRank], cheap < 0 ? 0 : feats[cheap][iDTurns], cheap < 0 ? 0 : feats[cheap][iHigh],
		56 - p.reduce((a, x) => a + x.hand.length, 0),
		plays.length && ctx.trick!.leadSeat === me ? 1 : 0, plays.length && ctx.trick!.leadSeat === partnerSeat ? 1 : 0,
		plays.length
	];
	feats.forEach((f, i) => f.push(...situ, i === cheap ? 1 : 0));

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
	if (ctx.wish.active && ctx.wish.requestedRank !== null && mustPlayWishedRank(ctx.hand, ctx.wish)) return null;
	return pickFromCandidates(extractCandidates(ctx), ctx, model, preset);
}

/**
 * 이미 뽑아 둔 후보에서 캐릭터가 낼 수를 고른다.
 * 같은 상황을 여러 캐릭터로 볼 때(기록 분석) 후보 추출을 한 번만 하려고 나눠 뒀다.
 */
export function pickFromCandidates(
	set: CandidateSet,
	ctx: AiDecisionContext,
	model: HumanModel,
	preset: AiStrategy
): string[] | 'pass' | null {
	// 개는 후보에 없다(학습에서 뺐다). 선을 잡았을 때 낼지는 캐릭터 습관이 정한다 (habits.ts)
	const fb = set.aiRaw[preset];
	const dog = ctx.hand.find(isDog);
	const leading = !ctx.trick || ctx.trick.plays.length === 0;
	if (dog && leading) {
		const ruleSaysDog = !!fb && fb !== 'pass' && fb.length === 1 && fb[0] === dog.id;
		if (decideDogLead(ctx, getBehaviorForStrategy(preset).habits ?? DEFAULT_HABITS, ruleSaysDog)) return [dog.id];
	}
	if (set.cands.length === 0) return null;
	const scores = scoreCandidates(set, model, preset);
	const tags = __personaBias.on ? situationTags(set) : null;
	const weights = SITUATION_BIAS[preset];
	// 상대가 티츄를 불렀으면 막는 쪽으로 (tichuDefense.ts)
	const defense = defenseBias(ctx, set.cands);
	let best = 0;
	let bestScore = -Infinity;
	scores.forEach((score, i) => {
		const tag = tags ? tags[i] : null;
		const s = score + (tag ? (weights[tag] ?? 0) : 0) + (defense ? defense[i] : 0);
		if (s > bestScore) { bestScore = s; best = i; }
	});
	const c = set.cands[best];
	return c ? c.cards.map(x => x.id) : 'pass';
}

/** 후보마다 모델 점수 (캐릭터의 사람 표시만 켠 값 — 상황 보정은 더하기 전) */
export function scoreCandidates(set: CandidateSet, model: HumanModel, preset: AiStrategy): number[] {
	const persona = PERSONAS.map(p => (PERSONA_OF[preset] === p ? 1 : 0));
	const idx = inputIndex(model);
	return set.feats.map(f => {
		const full = [...f, ...persona];
		return scoreFeatures(model, idx.map(i => full[i]));
	});
}

/** 모델이 쓰는 특징을 이름으로 찾아 둔다 — 특징이 늘어도 예전 모델 파일을 그대로 읽을 수 있다 */
const inputIndexCache = new WeakMap<HumanModel, number[]>();
function inputIndex(model: HumanModel): number[] {
	let idx = inputIndexCache.get(model);
	if (!idx) {
		const names = [...FEATURE_NAMES, ...PERSONAS.map(p => `u_${p}`)];
		idx = model.features.map(n => names.indexOf(n));
		inputIndexCache.set(model, idx);
	}
	return idx;
}

const FI = Object.fromEntries(FEATURE_NAMES.map((n, i) => [n, i])) as Record<string, number>;

/**
 * 캐릭터별 상황 보정 — 모델 점수에 더한다.
 *
 * 모델은 사람 전체를 한데 배워서, 사람 표시만으로는 캐릭터가 거의 같게 둔다. 그런데 기록을
 * 조건 조합으로 나눠 보면 몇몇 상황에서는 사람마다 뚜렷이 갈린다:
 *
 *   상황 (모두 AND)                                        아랭   메모   오딘   라미
 *   상대 카드 · 남는 카드로 공짜로 이김 · 3턴 이내 → 패스      12%    13%    37%    18%
 *   상대 카드 · 조합을 깨야 이김 · 3턴 이내 → 패스            46%    37%    49%    16%
 *   상대 낱장 · 낮은 카드로도 이기는데 → A를 냄              19%    10%    10%    25%
 *   상대 낱장 A 이상 · 4턴 이상 남음 → 용을 냄               50%    45%    21%    68%
 *
 * 값을 정한 방법: 학습에 안 쓴 판으로 낸 모델의 예상과 그 사람의 실제를 상황별로 비교해,
 * 통계적으로 뚜렷하게(z ≥ 2) 벗어난 상황에만 그 차이만큼 점수를 옮겼다
 * (scripts/tichu-model/calibrate.py). 이리는 사람 전체라 보정이 없다.
 *
 * 해 보고 버린 방법 — 상황마다 캐릭터가 고르는 **비율**을 그 사람의 비율과 똑같이 맞추기.
 * 비율은 맞아도 사람과 같은 수를 고르는 비율은 그대로였고 라미는 떨어졌다(70.5 → 67.7%).
 * 어느 순간에 패스하는지는 모르는 채 횟수만 맞추면 엉뚱한 순간에 패스하게 된다.
 *
 * 실력 맞추기 (같은 패를 돌려 가며 받는 시뮬레이션):
 * - 오딘의 "잘 참는" 성향을 기록대로 두면 AI끼리 라운드당 −7.5점, 게임 승률 41.6%로 혼자 약했다
 *   (사람 오딘은 참고도 이기지만 AI는 아니다). 그래서 오딘의 패스 전체를 0.4 낮췄다.
 * - 그래도 라미가 라운드당 +4.8점(게임 승률 54~56%), 오딘이 −3.2점으로 벌어져 있었다. 기록의 같은
 *   순간과 대조하니 AI 라미가 사람 라미보다 더 덤볐다 — 남는 카드로 이길 수 있을 때 사람 라미는
 *   17.5%를 넘기는데 AI는 7.3%. 그래서 깎는 대신 기록 쪽으로 옮겼다: 라미는 공짜여도 가끔 넘기고
 *   (passFree +1.5 → 15%), A·용·봉밖에 없을 때 조금 더 아낀다(passHigh +0.3). 오딘은 큰 조합 리드를
 *   사람만큼(57%) 하게 했다(bigLead +0.3). 라미의 "조합을 깨서라도 받기"·"큰 조합 리드"는 그대로다.
 *   → 96묶음 12,462라운드: 아랭 +2.0 · 메모 +0.6 · 오딘 −1.8 · 라미 −0.1 · 이리 −0.8점(각 ±2),
 *     게임 승률 48.6~53.9%. 이 아래로는 측정 오차라 더 맞추지 않았다.
 * - 48묶음으로는 게임 승률 오차가 ±5%p다. 한 번 재고 "48~52% 안"이라고 판단하면 안 된다
 *   (라미 52.1%로 통과시켰던 값이 다시 재니 56.5%였다). 점수차로, 96묶음 이상으로 볼 것.
 */
export const SITUATIONS = [
	// 상대 카드 위에서 패스 — 가장 싼 수가 무엇이냐에 따라 (near = 손패를 3턴 이내에 비울 수 있음)
	'passFree_near', 'passFree_far', 'passBreak_near', 'passBreak_far', 'passHigh_near', 'passHigh_far',
	// 용 — 상대 낱장이 K 이하일 때(다른 수가 없음/있음), A 이상일 때
	'dragonLowOnly_near', 'dragonLowOnly_far', 'dragonLowSpare', 'dragonAce_near', 'dragonAce_far',
	// A 낱장 — 더 낮은 카드로는 못 이김 / 낮은 카드로도 이김
	'aceOnly_near', 'aceOnly_far', 'aceSpare',
	// 봉황 낱장 — 상대 A 이상, 다른 낱장으로는 못 이김, 4턴 이상 남음
	'phoenixAce_far',
	// 파트너가 이기고 있는 트릭에서 패스 / 손패 9장 이상일 때 3장 이상 조합으로 리드
	'passPartner', 'bigLead'
] as const;
export type Situation = (typeof SITUATIONS)[number];

export const SITUATION_BIAS: Record<AiStrategy, Partial<Record<Situation, number>>> = {
	aggressive: { passFree_near: -0.46, passBreak_near: 0.3, aceOnly_far: 0.55, bigLead: 0.23 },
	tricky: { passHigh_far: -0.37, dragonLowSpare: -1.23, passPartner: 0.44 },
	balanced: {
		passFree_near: 0.32, passFree_far: -0.4, passBreak_near: -0.4, passBreak_far: -0.4, passHigh_near: -0.4, passHigh_far: -0.4,
		aceSpare: -0.52, bigLead: 0.3
	},
	wild: {
		passFree_near: 1.5, passFree_far: 1.5, passBreak_near: -0.3, passBreak_far: -0.2, passHigh_near: 0.3, passHigh_far: 0.3,
		aceSpare: 0.41, bigLead: 0.53
	},
	defensive: {}
};

/** 후보마다 해당하는 상황 (없으면 null) */
export function situationTags(set: CandidateSet): (Situation | null)[] {
	const f0 = set.feats[0];
	if (!f0) return [];
	const isBombF = (f: number[]) => f[FI.t_four_bomb] === 1 || f[FI.t_straight_flush_bomb] === 1;
	if (f0[FI.lead] === 1) return set.feats.map(f => (f[FI.hand] >= 9 && f[FI.n] >= 3 && !isBombF(f) ? 'bigLead' : null));
	if (f0[FI.topPartner] === 1) return set.feats.map(f => (f[FI.pass] === 1 ? 'passPartner' : null));
	const beat = set.feats.map((f, i) => i).filter(i => set.feats[i][FI.pass] === 0 && !isBombF(set.feats[i]));
	if (beat.length === 0) return set.feats.map(() => null);
	const near = f0[FI.turnsNow] <= 3;
	const topRank = f0[FI.topRank];
	let cheap = beat[0];
	for (const i of beat) {
		const a = set.feats[i], b = set.feats[cheap];
		if (a[FI.rank] < b[FI.rank] || (a[FI.rank] === b[FI.rank] && a[FI.n] < b[FI.n])) cheap = i;
	}
	const cheapHigh = set.feats[cheap][FI.high] === 1;
	const cheapFree = set.feats[cheap][FI.dTurns] <= 0;
	const singles = beat.filter(i => set.feats[i][FI.t_single] === 1);
	const lowerSingle = singles.some(i => set.feats[i][FI.high] === 0);
	const otherThanDragon = singles.some(i => set.feats[i][FI.dragon] === 0);
	const otherThanPhoenixDragon = singles.some(i => set.feats[i][FI.dragon] === 0 && set.feats[i][FI.phoenix] === 0);
	return set.feats.map(f => {
		if (f[FI.pass] === 1) {
			if (cheapHigh) return near ? 'passHigh_near' : 'passHigh_far';
			if (cheapFree) return near ? 'passFree_near' : 'passFree_far';
			return near ? 'passBreak_near' : 'passBreak_far';
		}
		if (f[FI.t_single] !== 1) return null;
		if (f[FI.dragon] === 1) {
			if (topRank >= 14) return near ? 'dragonAce_near' : 'dragonAce_far';
			if (otherThanDragon) return 'dragonLowSpare';
			return near ? 'dragonLowOnly_near' : 'dragonLowOnly_far';
		}
		if (f[FI.phoenix] === 1) return topRank >= 14 && !otherThanPhoenixDragon && !near ? 'phoenixAce_far' : null;
		if (f[FI.high] === 1) return lowerSingle ? 'aceSpare' : near ? 'aceOnly_near' : 'aceOnly_far';
		return null;
	});
}

/** 실험용 스위치 (시뮬레이션에서 캐릭터 상황 보정을 끄고 비교) */
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

/** 측정용 — 시뮬레이션에서 자리마다 다른 모델을 쓰게 할 때 */
export function __setHumanModel(model: HumanModel | null): void {
	loaded = model;
}

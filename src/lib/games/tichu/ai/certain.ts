/**
 * 계산으로 답이 정해지는 순간.
 *
 * 카드 내기는 사람 기록으로 학습한 모델이 고른다(humanModel.ts). 그런데 안 보이는 카드는
 * 정확히 셀 수 있어서(56장 − 내 손패 − 나온 카드), 계산으로 답이 나오는 순간이 있다.
 * 그때는 모델이 고른 수를 검산하고, 손해인 수였으면 바꾼다. 모델이 고른 수가 계산상
 * 최선과 값이 같으면 그대로 둔다 — 캐릭터 차이는 답이 여럿인 곳에만 남는다.
 *
 * 1. 둘만 남았을 때 (solveTwoLeft)
 *    상대 손패 = 안 보이는 카드 전부. 선언 성패와 1등은 이미 정해졌고 남은 건 카드 점수뿐이라,
 *    끝까지 계산해서 우리 팀 점수가 가장 많이 남는 수를 고른다.
 * 2. 확실한 마무리 (findSureExit)
 *    내 손패를 "아무도 못 이기는 조합"들과 많아야 하나의 나머지로 나눌 수 있으면, 못 이기는
 *    조합부터 내고 나머지를 마지막에 내면 반드시 나간다.
 *
 * AI는 자기 손패·나온 카드·남은 장수만 쓴다. context.players[].hand 의 내용은 보지 않는다.
 */
import type { Card, Combination, SeatIndex } from '../types';
import type { AiDecisionContext } from './types';
import { canBeat, isBomb, resolvePhoenixSingleRank } from '../combinations';
import { getCardPoints, getTeam, getPartnerSeat, getNextActiveSeat } from '../constants';
import { mustPlayWishedRank } from '../wish';
import { findAllPlayableCombinations, findBombs } from './handEvaluator';
import { getUnseenCards } from './monteCarlo';

/** 측정용 스위치 — 끄면 모델이 고른 수를 그대로 낸다 */
export const __logic = { on: true };

/** 측정용 집계 */
export const logicStats = {
	/** 둘만 남은 순간에 끝까지 계산한 횟수 / 그중 모델의 수를 바꾼 횟수 / 바꿔서 얻은 점수 합 */
	twoLeft: 0, twoLeftChanged: 0, twoLeftGain: 0,
	/** 둘만 남았지만 계산량이 한도를 넘어 모델에 맡긴 횟수 */
	twoLeftBudget: 0,
	/** 확실한 마무리를 찾은 횟수 / 그중 모델의 수를 바꾼 횟수 */
	sure: 0, sureChanged: 0
};

type Move = string[] | 'pass';

const isSp = (c: Card, name: string) => c.type === 'special' && c.special === name;
const points = (cards: Card[]) => cards.reduce((s, c) => s + getCardPoints(c), 0);
const sameMove = (a: Move, b: Move) =>
	a === 'pass' || b === 'pass' ? a === b : a.length === b.length && a.every(id => b.includes(id));

// ───────────────────────── 1. 둘만 남았을 때 ─────────────────────────

interface ComboInfo {
	mask: number;
	combo: Combination;
	pts: number;
	bomb: boolean;
	dog: boolean;
	dragon: boolean;
	n: number;
}

export interface TwoLeftSolution {
	move: Move;
	/** 이 수를 두고 둘 다 최선을 다했을 때 (우리 팀 − 상대 팀) 카드 점수. 남은 둘의 손패·딴 점수만 센 값 */
	value: number;
	/** 모델이 고른 수의 값 (그 수가 후보에 없었으면 null) */
	preferredValue: number | null;
	nodes: number;
}

/**
 * 한 번의 판단에 쓰는 계산량 한도. 넘으면 계산을 포기하고 모델에 맡긴다.
 * 실전에서 둘이 합쳐 20장 이하면 평균 15ms·최대 35ms 안에 끝난다(M 계열 노트북 기준, 16~20장 41번 모두 성공).
 */
const NODE_BUDGET = 60_000;
const TWO_LEFT_MAX_CARDS = 20;
const ABORT = Symbol('budget');

/**
 * 둘만 남은 끝내기를 끝까지 계산한다. 계산할 수 없는 상황이면 null.
 *
 * 엔진 규칙을 그대로 따른다:
 * - 한 명이 손을 비우면 라운드가 끝난다. 그 순간 깔린 트릭은 마지막에 낸 사람이 가져간다(용이어도).
 * - 꼴찌의 손패 점수는 상대 팀에, 꼴찌가 딴 점수는 1등의 팀에 간다.
 * - 패스로 끝난 트릭은 낸 사람이 가져가고 선을 잡는다. 용으로 먹었으면 남은 상대에게 준다
 *   (나간 상대에게 주는 것보다 손해일 수 없다 — 그 상대가 꼴찌가 되면 1등 팀으로 넘어가므로).
 * - 개: 파트너가 나갔으므로 파트너 다음 자리의 남은 사람에게 선이 간다.
 * - 상대는 방금 낸 카드 위에 폭탄을 바로 얹을 수 있다고 본다(가장 불리한 경우).
 */
export function solveTwoLeft(ctx: AiDecisionContext, preferred?: Move, budget = NODE_BUDGET): TwoLeftSolution | null {
	const me = ctx.currentSeat;
	const active = ctx.players.filter(p => p.finishOrder === null);
	if (active.length !== 2 || ctx.finishOrder.length === 0) return null;
	const oppPlayer = active.find(p => p.seat !== me);
	if (!oppPlayer || active.every(p => p.seat !== me) || getTeam(oppPlayer.seat) === getTeam(me)) return null;
	const myHand = ctx.hand;
	if (myHand.length === 0) return null;

	// 상대 손패 = 안 보이는 카드 전부. 개는 내고 나면 어디에도 남지 않으므로, 한 장이 남으면 이미 나온 개다.
	let oppHand = getUnseenCards(ctx);
	if (oppHand.length === oppPlayer.hand.length + 1) oppHand = oppHand.filter(c => !isSp(c, 'dog'));
	if (oppHand.length !== oppPlayer.hand.length || oppHand.length === 0) return null;

	const all = [...myHand, ...oppHand];
	// 둘이 합쳐 20장을 넘으면 한도 안에 거의 못 끝낸다 (실전 9번 중 1번) — 시간만 쓰므로 모델에 맡긴다
	if (all.length > TWO_LEFT_MAX_CARDS) return null;
	// 참새가 남아 있으면 소원이 새로 걸릴 수 있고, 걸린 소원이 둘 중 누구를 묶으면 낼 수 있는 수가 달라진다
	if (all.some(c => isSp(c, 'mahjong'))) return null;
	const wish = ctx.wish;
	if (wish.active && wish.requestedRank !== null && all.some(c => c.type === 'normal' && c.rank === wish.requestedRank)) return null;

	const bit = new Map<string, number>();
	all.forEach((c, i) => bit.set(c.id, 1 << i));
	const cardPts = all.map(getCardPoints);
	const handPts = (mask: number) => {
		let s = 0;
		for (let i = 0; i < all.length; i++) if (mask & (1 << i)) s += cardPts[i];
		return s;
	};
	const myMask = (1 << myHand.length) - 1;
	const oppMask = ((1 << all.length) - 1) & ~myMask;

	const comboCache = new Map<number, ComboInfo[]>();
	const combosOf = (mask: number): ComboInfo[] => {
		let list = comboCache.get(mask);
		if (list) return list;
		const cards: Card[] = [];
		for (let i = 0; i < all.length; i++) if (mask & (1 << i)) cards.push(all[i]);
		const seen = new Set<number>();
		list = [];
		for (const combo of findAllPlayableCombinations(cards)) {
			let m = 0;
			for (const c of combo.cards) m |= bit.get(c.id)!;
			if (seen.has(m)) continue;
			seen.add(m);
			list.push({
				mask: m, combo, pts: points(combo.cards), bomb: isBomb(combo),
				dog: combo.cards.length === 1 && isSp(combo.cards[0], 'dog'),
				dragon: combo.cards.some(c => isSp(c, 'dragon')), n: combo.cards.length
			});
		}
		list.sort((a, b) => b.n - a.n); // 많이 터는 수부터 본다 (가지치기가 잘 된다)
		comboCache.set(mask, list);
		return list;
	};

	// 0 = 나, 1 = 상대
	const idx = (seat: number): 0 | 1 => (seat === me ? 0 : 1);
	const seats = [me, oppPlayer.seat];
	const dogTo = seats.map(s => idx(getNextActiveSeat(getPartnerSeat(s), ctx.players)));
	const firstMine = getTeam(ctx.finishOrder[0]) === getTeam(me);

	// 지금 깔린 트릭
	const plays = ctx.trick?.plays ?? [];
	let top0: Combination | null = null;
	let owner0 = 0; // 0 나 · 1 상대 · 2 이미 나간 사람
	let passes0 = 0;
	let trick0 = 0;
	let outMine = false; // 나간 사람이 우리 팀인가
	let outNext: 0 | 1 = 0; // 그 트릭이 패스로 끝나면 선을 잡는 사람
	if (plays.length > 0) {
		const last = plays[plays.length - 1];
		if (last.seat === me) return null;
		top0 = last.combination;
		trick0 = plays.reduce((s, p) => s + points(p.combination.cards), 0);
		if (last.seat === oppPlayer.seat) owner0 = 1;
		else {
			owner0 = 2;
			passes0 = ctx.trick!.passCount;
			outMine = getTeam(last.seat) === getTeam(me);
			outNext = idx(getNextActiveSeat(last.seat, ctx.players));
		}
	}
	const won0 = [points(ctx.players[me].wonCards), points(oppPlayer.wonCards)];

	/** who가 손을 비우고 끝났을 때 (우리 팀 − 상대 팀). fixed = 나간 사람이 가져간 트릭 점수 */
	const finish = (who: number, hm: number, ho: number, w0: number, w1: number, fixed: number) =>
		who === 0
			? w0 + handPts(ho) + (firstMine ? w1 : -w1) + fixed
			: -(w1 + handPts(hm)) + (firstMine ? w0 : -w0) + fixed;

	let nodes = 0;
	const table = new Map<string, { lo: number; hi: number }>();

	/** mover가 c를 낸 뒤의 값. bomb = 그 위에 바로 얹는 자기 폭탄 */
	const afterPlay = (
		hm: number, ho: number, mover: number, c: ComboInfo, bomb: ComboInfo | null,
		top: Combination | null, trick: number, w0: number, w1: number, fixed: number, alpha: number, beta: number
	): number => {
		let left = (mover === 0 ? hm : ho) & ~c.mask;
		let pts = trick + c.pts;
		let ntop = resolvePhoenixSingleRank(c.combo, top);
		if (bomb) {
			left &= ~bomb.mask;
			pts += bomb.pts;
			ntop = bomb.combo;
		}
		const nhm = mover === 0 ? left : hm;
		const nho = mover === 1 ? left : ho;
		if (left === 0) return finish(mover, nhm, nho, w0 + (mover === 0 ? pts : 0), w1 + (mover === 1 ? pts : 0), fixed);
		return search(nhm, nho, 1 - mover, ntop, mover, 0, pts, w0, w1, fixed, alpha, beta);
	};

	const afterDog = (hm: number, ho: number, mover: number, c: ComboInfo, w0: number, w1: number, fixed: number, alpha: number, beta: number): number => {
		const left = (mover === 0 ? hm : ho) & ~c.mask;
		const nhm = mover === 0 ? left : hm;
		const nho = mover === 1 ? left : ho;
		if (left === 0) return finish(mover, nhm, nho, w0, w1, fixed);
		return search(nhm, nho, dogTo[mover], null, 0, 0, 0, w0, w1, fixed, alpha, beta);
	};

	const afterPass = (
		hm: number, ho: number, mover: number, top: Combination, owner: number, passes: number,
		trick: number, w0: number, w1: number, fixed: number, alpha: number, beta: number
	): number => {
		const dragon = top.cards.some(c => isSp(c, 'dragon'));
		if (owner === 2) {
			// 나간 사람의 카드: 남은 둘이 다 패스해야 끝난다
			if (passes + 1 < 2) return search(hm, ho, 1 - mover, top, 2, passes + 1, trick, w0, w1, fixed, alpha, beta);
			if (dragon) {
				// 나간 사람이 용으로 먹었으면 그 사람의 상대편 중 남은 사람이 받는다
				const to = outMine ? 1 : 0;
				return search(hm, ho, outNext, null, 0, 0, 0, w0 + (to === 0 ? trick : 0), w1 + (to === 1 ? trick : 0), fixed, alpha, beta);
			}
			return search(hm, ho, outNext, null, 0, 0, 0, w0, w1, fixed + (outMine ? trick : -trick), alpha, beta);
		}
		const winner = 1 - mover;
		const to = dragon ? mover : winner;
		return search(hm, ho, winner, null, 0, 0, 0, w0 + (to === 0 ? trick : 0), w1 + (to === 1 ? trick : 0), fixed, alpha, beta);
	};

	function search(
		hm: number, ho: number, mover: number, top: Combination | null, owner: number, passes: number,
		trick: number, w0: number, w1: number, fixed: number, alpha: number, beta: number
	): number {
		if (++nodes > budget) throw ABORT;
		const key = `${hm},${ho},${mover},${owner},${passes},${top ? `${top.type}${top.length}:${top.rank}` : '-'},${trick},${w0},${w1},${fixed}`;
		const hit = table.get(key);
		if (hit) {
			if (hit.lo >= beta) return hit.lo;
			if (hit.hi <= alpha) return hit.hi;
			if (hit.lo === hit.hi) return hit.lo;
			if (hit.lo > alpha) alpha = hit.lo;
			if (hit.hi < beta) beta = hit.hi;
		}
		const alpha0 = alpha;
		const beta0 = beta;
		const maxing = mover === 0;
		let best = maxing ? -Infinity : Infinity;
		let cut = false as boolean;
		const take = (v: number) => {
			if (maxing) {
				if (v > best) best = v;
				if (best > alpha) alpha = best;
			} else {
				if (v < best) best = v;
				if (best < beta) beta = best;
			}
			cut = alpha >= beta;
		};

		const hand = mover === 0 ? hm : ho;
		for (const c of combosOf(hand)) {
			if (top) {
				if (c.dog || !canBeat(top, c.combo)) continue;
			} else if (c.dog) {
				take(afterDog(hm, ho, mover, c, w0, w1, fixed, alpha, beta));
				if (cut) break;
				continue;
			}
			take(afterPlay(hm, ho, mover, c, null, top, top ? trick : 0, w0, w1, fixed, alpha, beta));
			if (cut) break;
			// 상대는 방금 낸 카드 위에 자기 폭탄을 바로 얹을 수 있다 (내가 받아칠 틈이 없다)
			if (mover === 1 && !c.bomb) {
				for (const b of combosOf(hand & ~c.mask)) {
					if (!b.bomb) continue;
					take(afterPlay(hm, ho, mover, c, b, top, top ? trick : 0, w0, w1, fixed, alpha, beta));
					if (cut) break;
				}
				if (cut) break;
			}
		}
		if (!cut && top) take(afterPass(hm, ho, mover, top, owner, passes, trick, w0, w1, fixed, alpha, beta));

		const lo = best >= beta0 || (best > alpha0 && best < beta0) ? best : hit?.lo ?? -Infinity;
		const hi = best <= alpha0 || (best > alpha0 && best < beta0) ? best : hit?.hi ?? Infinity;
		table.set(key, { lo: Math.max(lo, hit?.lo ?? -Infinity), hi: Math.min(hi, hit?.hi ?? Infinity) });
		return best;
	}

	// 내 차례: 모델이 고른 수를 먼저 정확히 계산하고, 그보다 확실히 나은 수가 있을 때만 바꾼다
	type Root = { move: Move; run: (alpha: number) => number };
	const roots: Root[] = [];
	for (const c of combosOf(myMask)) {
		const ids = c.combo.cards.map(x => x.id);
		if (top0) {
			if (c.dog || !canBeat(top0, c.combo)) continue;
			roots.push({ move: ids, run: a => afterPlay(myMask, oppMask, 0, c, null, top0, trick0, won0[0], won0[1], 0, a, Infinity) });
		} else if (c.dog) {
			roots.push({ move: ids, run: a => afterDog(myMask, oppMask, 0, c, won0[0], won0[1], 0, a, Infinity) });
		} else {
			roots.push({ move: ids, run: a => afterPlay(myMask, oppMask, 0, c, null, null, 0, won0[0], won0[1], 0, a, Infinity) });
		}
	}
	if (top0) {
		const top = top0;
		roots.push({ move: 'pass', run: a => afterPass(myMask, oppMask, 0, top, owner0, passes0, trick0, won0[0], won0[1], 0, a, Infinity) });
	}
	if (roots.length === 0) return null;
	const prefAt = preferred === undefined ? -1 : roots.findIndex(r => sameMove(r.move, preferred));
	if (prefAt > 0) roots.unshift(roots.splice(prefAt, 1)[0]);

	try {
		let best = roots[0];
		let value = best.run(-Infinity);
		const preferredValue = prefAt >= 0 ? value : null;
		for (let i = 1; i < roots.length; i++) {
			const v = roots[i].run(value);
			if (v > value) {
				value = v;
				best = roots[i];
			}
		}
		return { move: best.move, value, preferredValue, nodes };
	} catch (e) {
		if (e !== ABORT) throw e;
		logicStats.twoLeftBudget++;
		return null;
	}
}

// ───────────────────────── 2. 확실한 마무리 ─────────────────────────

/** 이보다 손패가 많으면 따지지 않는다 (나눌 방법이 너무 많고, 그때는 확실한 마무리가 거의 없다) */
const SURE_MAX_HAND = 10;

/**
 * 반드시 나갈 수 있는 순서가 있으면 그 첫 수를 돌려준다. 없으면 null.
 *
 * "아무도 못 이긴다"는 안 보이는 카드를 한 사람이 다 쥐었다고 쳐도 못 이긴다는 뜻이다
 * (남은 사람 중 가장 많이 쥔 장수보다 긴 조합은 애초에 받을 수 없다). 안 보이는 카드로
 * 폭탄이 만들어질 수 있으면 확실한 건 없으므로 포기한다.
 */
export function findSureExit(ctx: AiDecisionContext, preferred?: Move): string[] | null {
	const me = ctx.currentSeat;
	const hand = ctx.hand;
	if (hand.length === 0 || hand.length > SURE_MAX_HAND) return null;
	const others = ctx.players.filter(p => p.seat !== me && p.finishOrder === null && p.hand.length > 0);
	if (others.length === 0) return null;
	// 파트너가 티츄를 불렀고 아직 아무도 안 나갔으면, 내가 먼저 나가는 순간 그 선언이 깨진다
	const partner = ctx.players[getPartnerSeat(me)];
	if (ctx.finishOrder.length === 0 && partner.finishOrder === null && (partner.grandTichu === true || partner.smallTichu)) return null;

	const maxOther = Math.max(...others.map(p => p.hand.length));
	const count = new Array<number>(16).fill(0);
	const bySuit = new Map<string, Set<number>>();
	let phoenix = false;
	let dragon = false;
	let mahjong = false;
	for (const c of getUnseenCards(ctx)) {
		if (c.type === 'normal') {
			count[c.rank]++;
			if (!bySuit.has(c.suit)) bySuit.set(c.suit, new Set());
			bySuit.get(c.suit)!.add(c.rank);
		} else if (c.special === 'phoenix') phoenix = true;
		else if (c.special === 'dragon') dragon = true;
		else if (c.special === 'mahjong') mahjong = true;
	}
	// 폭탄이 나올 수 있는가
	if (maxOther >= 4 && count.some(n => n === 4)) return null;
	if (maxOther >= 5) {
		for (const ranks of bySuit.values()) {
			let run = 0;
			for (let r = 2; r <= 14; r++) {
				run = ranks.has(r) ? run + 1 : 0;
				if (run >= 5) return null;
			}
		}
	}

	/** 안 보이는 카드로 이 조합을 이길 수 있는가 (top = 내가 얹는 카드, 리드면 null) */
	const beatable = (combo: Combination, top: Combination | null): boolean => {
		if (isBomb(combo)) return false;
		if (combo.cards.length > maxOther) return false;
		const rank = resolvePhoenixSingleRank(combo, top).rank;
		const above = (need: number) => {
			for (let q = Math.floor(rank) + 1; q <= 14; q++) {
				if (count[q] >= need || (phoenix && need > 1 && count[q] >= need - 1)) return true;
			}
			return false;
		};
		switch (combo.type) {
			case 'single':
				if (isSp(combo.cards[0], 'dragon')) return false;
				return dragon || phoenix || above(1);
			case 'pair': return above(2);
			case 'triple': return above(3);
			case 'full_house': return above(3); // 페어까지 있는지는 따지지 않는다 (있다고 본다)
			case 'straight': {
				const len = combo.cards.length;
				for (let high = rank + 1; high <= 14; high++) {
					const low = high - len + 1;
					if (low < 1) continue;
					let missing = 0;
					for (let q = low; q <= high; q++) if (!(q === 1 ? mahjong : count[q] > 0)) missing++;
					if (missing === 0 || (missing === 1 && phoenix)) return true;
				}
				return false;
			}
			case 'stairs': {
				const pairs = combo.cards.length / 2;
				for (let high = rank + 1; high <= 14; high++) {
					const low = high - pairs + 1;
					if (low < 2) continue;
					let missing = 0;
					for (let q = low; q <= high; q++) missing += Math.max(0, 2 - count[q]);
					if (missing === 0 || (missing === 1 && phoenix)) return true;
				}
				return false;
			}
			default: return true;
		}
	};

	const bit = new Map<string, number>();
	hand.forEach((c, i) => bit.set(c.id, 1 << i));
	const full = (1 << hand.length) - 1;
	interface Part { mask: number; combo: Combination; safe: boolean; dog: boolean }
	const partCache = new Map<number, Part[]>();
	const partsOf = (mask: number): Part[] => {
		let list = partCache.get(mask);
		if (list) return list;
		const cards = hand.filter(c => mask & bit.get(c.id)!);
		const seen = new Set<number>();
		list = [];
		for (const combo of findAllPlayableCombinations(cards)) {
			let m = 0;
			for (const c of combo.cards) m |= bit.get(c.id)!;
			if (seen.has(m)) continue;
			seen.add(m);
			const dog = combo.cards.length === 1 && isSp(combo.cards[0], 'dog');
			// 개는 선을 넘기고, 참새는 소원을 걸게 되므로 마지막에만 낸다
			const safe = !dog && !combo.cards.some(c => isSp(c, 'mahjong')) && !beatable(combo, null);
			list.push({ mask: m, combo, safe, dog });
		}
		partCache.set(mask, list);
		return list;
	};
	/** 남은 손패를 "못 이기는 조합들 + 나머지 spare개 이하"로 나눌 수 있는가 */
	const memo = new Map<number, boolean>();
	const splits = (mask: number, spare: number): boolean => {
		if (mask === 0) return true;
		const key = mask * 2 + spare;
		const known = memo.get(key);
		if (known !== undefined) return known;
		const lowest = mask & -mask;
		let ok = false;
		for (const p of partsOf(mask)) {
			if (!(p.mask & lowest)) continue;
			const cost = p.safe ? 0 : 1;
			if (cost <= spare && splits(mask & ~p.mask, spare - cost)) {
				ok = true;
				break;
			}
		}
		memo.set(key, ok);
		return ok;
	};

	const plays = ctx.trick?.plays ?? [];
	const top = plays.length > 0 ? plays[plays.length - 1].combination : null;
	const options: Part[] = [];
	for (const p of partsOf(full)) {
		if (top && (p.dog || !canBeat(top, p.combo))) continue;
		if (p.mask === full) {
			options.push(p); // 이 한 수로 나간다
			continue;
		}
		const safeNow = top ? !beatable(p.combo, top) : p.safe;
		if (safeNow && splits(full & ~p.mask, 1)) options.push(p);
	}
	if (options.length === 0) return null;
	const ids = (p: Part) => p.combo.cards.map(c => c.id);
	if (preferred && preferred !== 'pass' && options.some(p => sameMove(ids(p), preferred))) return preferred;
	options.sort((a, b) =>
		Number(b.mask === full) - Number(a.mask === full) || b.combo.cards.length - a.combo.cards.length || a.combo.rank - b.combo.rank);
	return ids(options[0]);
}

// ───────────────────────── 모델이 고른 수 검산 ─────────────────────────

/** 모델(또는 규칙 AI)이 고른 수를 계산으로 검산해, 손해가 확실하면 바꾼다 */
export function refineWithLogic(ctx: AiDecisionContext, picked: Move): Move {
	if (!__logic.on) return picked;
	// 소원에 묶였으면 낼 수 있는 수가 따로 정해진다
	if (mustPlayWishedRank(ctx.hand, ctx.wish)) return picked;

	const two = solveTwoLeft(ctx, picked);
	if (two) {
		logicStats.twoLeft++;
		if (!sameMove(two.move, picked)) {
			logicStats.twoLeftChanged++;
			if (two.preferredValue !== null) logicStats.twoLeftGain += two.value - two.preferredValue;
		}
		return two.move;
	}
	const sure = findSureExit(ctx, picked);
	if (sure) {
		logicStats.sure++;
		if (!sameMove(sure, picked)) logicStats.sureChanged++;
		return sure;
	}
	return picked;
}

/**
 * 끼어드는 폭탄을 미룰지. 둘만 남았고 바로 다음이 내 차례면, 폭탄을 지금 쓸지는 차례가 왔을 때
 * 끝내기 계산이 정한다 (지금 끼어드는 것과 차례에 내는 것은 같은 수다).
 */
export function defersBombToTurn(ctx: AiDecisionContext, lastPlaySeat: SeatIndex): boolean {
	if (!__logic.on) return false;
	if (ctx.players.filter(p => p.finishOrder === null).length !== 2) return false;
	if (getNextActiveSeat(lastPlaySeat, ctx.players) !== ctx.currentSeat) return false;
	if (findBombs(ctx.hand).length === 0) return false;
	return solveTwoLeft(ctx) !== null;
}

/**
 * 용으로 먹은 트릭을 줄 상대. 남은 상대가 한 명뿐이면 그 사람에게 준다 — 나간 상대에게 주면
 * 그 점수는 상대 팀에 굳지만, 남은 상대가 꼴찌가 되면 1등의 팀으로 넘어가기 때문에 손해일 수 없다.
 */
export function soleActiveOpponent(ctx: AiDecisionContext, seat: SeatIndex): SeatIndex | null {
	if (!__logic.on) return null;
	const opponents = ctx.players.filter(p => getTeam(p.seat) !== getTeam(seat) && p.finishOrder === null);
	return opponents.length === 1 ? opponents[0].seat : null;
}

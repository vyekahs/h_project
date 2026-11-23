/**
 * 계산으로 답이 정해지는 순간 (certain.ts) 검증.
 *
 * 끝내기 계산은 엔진 규칙을 따로 옮겨 적은 것이라, 규칙을 하나라도 다르게 적으면 "확실하다"는
 * 말이 거짓이 된다. 그래서 무작위 끝내기를 실제 엔진으로 끝까지 쳐서 계산값과 맞춰 본다.
 */
import { describe, it, expect } from 'vitest';
import { LocalGameEngine } from './localGameEngine';
import { AiPlayer } from './aiPlayer';
import { clampTimers } from './simHarness';
import { solveTwoLeft, findSureExit, refineWithLogic, logicStats, __logic } from './certain';
import { findAllPlayableCombinations, findBeatablePlays, findBombs } from './handEvaluator';
import { createAllCards, getCardPoints, getNextActiveSeat, getPartnerSeat } from '../constants';
import { detectCombination, canBeat, resolvePhoenixSingleRank } from '../combinations';
import { createWishState } from '../wish';
import type { Card, Combination, NormalCard, SeatIndex, TichuPlayer, Trick } from '../types';
import type { AiDecisionContext } from './types';

const DECK = createAllCards();
const normal = (rank: number) => DECK.filter(x => x.type === 'normal' && (x as NormalCard).rank === rank);
const special = (name: string) => DECK.find(x => x.type === 'special' && x.special === name)!;
const pts = (cards: Card[]) => cards.reduce((s, c) => s + getCardPoints(c), 0);

function rng(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
function shuffled<T>(arr: T[], r: () => number): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(r() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

function player(seat: number, hand: Card[], wonCards: Card[], finishOrder: number | null): TichuPlayer {
	return {
		userId: seat, name: `p${seat}`, seat: seat as SeatIndex, team: seat % 2 === 0 ? 'A' : 'B',
		hand, wonCards, grandTichu: false, smallTichu: false,
		hasPlayedFirstCard: true, finishOrder, connected: true
	};
}
function ctxOf(players: TichuPlayer[], seat: number, trick: Trick | null, finishOrder: SeatIndex[]): AiDecisionContext {
	return {
		hand: players[seat].hand, trick, wish: createWishState(), currentSeat: seat as SeatIndex, players,
		finishOrder, finishedCount: finishOrder.length,
		cumulativeScoreA: 0, cumulativeScoreB: 0, completedRounds: [], roundNumber: 1
	};
}

// ───────────────────────── 둘만 남은 끝내기 ─────────────────────────

interface Position {
	mover: number;
	other: number;
	finishOrder: SeatIndex[];
	hands: Card[][];
	won: Card[][];
	trick: Trick | null;
}

/** 둘만 남은 무작위 끝내기. 폭탄·참새는 손에 없다 */
function randomTwoLeft(r: () => number): Position {
	for (;;) {
		const pairs = [[0, 1], [0, 3], [1, 2], [2, 3], [1, 0], [3, 0], [2, 1], [3, 2]];
		const [mover, other] = pairs[Math.floor(r() * pairs.length)];
		const out = [0, 1, 2, 3].filter(s => s !== mover && s !== other);
		const finishOrder = (r() < 0.5 ? out : [...out].reverse()) as SeatIndex[];
		const deck = shuffled(DECK.filter(c => !(c.type === 'special' && c.special === 'mahjong')), r);
		const hands: Card[][] = [[], [], [], []];
		hands[mover] = deck.splice(0, 1 + Math.floor(r() * 5));
		hands[other] = deck.splice(0, 1 + Math.floor(r() * 5));
		if (findBombs(hands[mover]).length || findBombs(hands[other]).length) continue;

		let trick: Trick | null = null;
		if (r() < 0.4) {
			// 누군가 낸 낱장이 깔려 있다 — 남은 상대가 냈거나, 방금 나간 사람의 마지막 카드
			const at = deck.findIndex(c => !(c.type === 'special' && c.special === 'dog'));
			const card = deck.splice(at, 1)[0];
			const combination = resolvePhoenixSingleRank(detectCombination([card])!, null);
			const owner = r() < 0.5 ? other : out[Math.floor(r() * 2)];
			const players = [0, 1, 2, 3].map(s => ({ finishOrder: s === mover || s === other ? null : 1 }));
			const passCount = owner === other || getNextActiveSeat(owner, players) === mover ? 0 : 1;
			trick = { plays: [{ seat: owner as SeatIndex, combination }], passCount, leadSeat: owner as SeatIndex, currentSeat: mover as SeatIndex };
		}
		const won: Card[][] = [[], [], [], []];
		for (const c of [...deck, special('mahjong')]) won[Math.floor(r() * 4)].push(c);
		return { mover, other, finishOrder, hands, won, trick };
	}
}

function contextOf(pos: Position, seat: number): AiDecisionContext {
	const players = [0, 1, 2, 3].map(s => {
		const order = pos.finishOrder.indexOf(s as SeatIndex);
		return player(s, pos.hands[s], pos.won[s], order >= 0 ? order + 1 : null);
	});
	return ctxOf(players, seat, pos.trick, pos.finishOrder);
}

function randomLegal(ctx: AiDecisionContext, r: () => number): string[] | 'pass' {
	const plays = ctx.trick?.plays ?? [];
	const top = plays.length ? plays[plays.length - 1].combination : null;
	const options: (Combination | null)[] = top ? [null, ...findBeatablePlays(ctx.hand, top)] : findAllPlayableCombinations(ctx.hand);
	const pick = options[Math.floor(r() * options.length)];
	return pick ? pick.cards.map(c => c.id) : 'pass';
}

type Chooser = (ctx: AiDecisionContext, ai: AiPlayer) => string[] | 'pass';

/** 실제 엔진으로 라운드 끝까지 친다. choose[자리]가 그 자리의 수를 고른다. (A팀 − B팀) 점수를 돌려준다 */
async function playOut(pos: Position, choose: Record<number, Chooser>): Promise<number> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const e = new LocalGameEngine({
		playerName: 'p0', partnerStrategy: 'balanced', aiSpeed: 'fast', targetScore: 100000,
		onStateChange: () => {}, onEvent: () => {}
	}) as any;
	e.waitForBombWindow = () => Promise.resolve();
	e.delay = () => Promise.resolve();
	for (let s = 0; s < 4; s++) {
		const p = e.state.players[s] as TichuPlayer;
		const order = pos.finishOrder.indexOf(s as SeatIndex);
		p.hand = [...pos.hands[s]];
		p.wonCards = [...pos.won[s]];
		p.finishOrder = order >= 0 ? order + 1 : null;
		p.hasPlayedFirstCard = true;
		p.grandTichu = false;
		p.smallTichu = false;
	}
	e.state.round = {
		roundNumber: 1, players: e.state.players,
		trick: pos.trick ? { ...pos.trick, plays: [...pos.trick.plays] } : null,
		wish: createWishState(), currentSeat: pos.mover, finishedCount: 2, finishOrder: [...pos.finishOrder],
		dragonGiftPending: false, dragonGiftSeat: null, turnDeadline: null
	};
	e.state.phase = 'playing';
	const ai0 = new AiPlayer(0 as SeatIndex, 'balanced', false);
	for (const seat of [1, 2, 3]) {
		const ai = e.aiPlayers.get(seat) as AiPlayer;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		if (choose[seat]) (ai as any).makePlayDecision = (ctx: AiDecisionContext) => choose[seat](ctx, ai);
	}
	if (pos.mover !== 0) void e.processAiTurns();
	for (let i = 0; i < 2000 && e.state.completedRounds.length === 0; i++) {
		await new Promise(res => setTimeout(res, 0));
		const round = e.state.round;
		if (e.state.phase === 'playing' && round.currentSeat === 0 && e.state.players[0].finishOrder === null) {
			const ctx = e.createAiContext(0);
			const d = choose[0] ? choose[0](ctx, ai0) : ai0.makePlayDecision(ctx);
			if (d === 'pass') e.humanPass();
			else await e.humanPlayCards(d);
		} else if (e.state.phase === 'dragon_gift' && round.dragonGiftSeat === 0) {
			e.humanGiftDragon(ai0.makeDragonGiftDecision(e.createAiContext(0)));
		}
	}
	expect(e.state.completedRounds.length).toBe(1);
	const result = e.state.completedRounds[0];
	e.destroy?.();
	return result.teamAScore - result.teamBScore + 0;
}

/** 계산값(남은 둘 기준)을 라운드 점수차(A팀 − B팀)로 옮긴다 */
function expectedDiff(pos: Position, value: number): number {
	const moverTeamA = pos.mover % 2 === 0;
	const fixed = pts(pos.won[getPartnerSeat(pos.mover)]) - pts(pos.won[getPartnerSeat(pos.other)]);
	return (moverTeamA ? 1 : -1) * (value + fixed) + 0; // + 0: -0을 0으로
}

describe('둘만 남았을 때 끝까지 계산', () => {
	it('둘 다 계산대로 두면 실제 엔진 점수가 계산값과 같다', async () => {
		const restore = clampTimers();
		const before = { ...logicStats };
		try {
			const r = rng(20261123);
			for (let i = 0; i < 300; i++) {
				const pos = randomTwoLeft(r);
				const solved = solveTwoLeft(contextOf(pos, pos.mover), undefined, 2_000_000);
				expect(solved, `판 ${i}`).not.toBeNull();
				const diff = await playOut(pos, {});
				expect(diff, `판 ${i}: ${JSON.stringify({ mover: pos.mover, other: pos.other, fo: pos.finishOrder, hands: pos.hands.map(h => h.map(c => c.id)), trick: pos.trick?.plays[0] })}`)
					.toBe(expectedDiff(pos, solved!.value));
			}
			expect(logicStats.twoLeftBudget).toBe(before.twoLeftBudget);
		} finally {
			restore();
		}
	}, 120_000);

	it('상대가 아무렇게나 둬도 계산값보다 못 받지 않는다 / 내가 아무렇게나 두면 계산값보다 더 못 받는다', async () => {
		const restore = clampTimers();
		try {
			const r = rng(7);
			for (let i = 0; i < 300; i++) {
				const pos = randomTwoLeft(r);
				const value = solveTwoLeft(contextOf(pos, pos.mover), undefined, 2_000_000)!.value;
				const sign = pos.mover % 2 === 0 ? 1 : -1;
				const target = sign * expectedDiff(pos, value);
				const wild: Chooser = ctx => randomLegal(ctx, r);
				expect(sign * await playOut(pos, { [pos.other]: wild }), `판 ${i} (상대가 무작위)`).toBeGreaterThanOrEqual(target);
				expect(sign * await playOut(pos, { [pos.mover]: wild }), `판 ${i} (내가 무작위)`).toBeLessThanOrEqual(target);
			}
		} finally {
			restore();
		}
	}, 120_000);

	it('모델이 고른 수가 최선과 값이 같으면 그대로 둔다', () => {
		const r = rng(99);
		let kept = 0;
		for (let i = 0; i < 200; i++) {
			const pos = randomTwoLeft(r);
			const ctx = contextOf(pos, pos.mover);
			const best = solveTwoLeft(ctx)!;
			// 어떤 수를 먼저 넣어도 값은 같아야 하고, 그 수가 최선이면 그 수를 돌려줘야 한다
			const again = solveTwoLeft(ctx, best.move)!;
			expect(again.value).toBe(best.value);
			expect(again.move).toEqual(best.move);
			const plays = ctx.trick?.plays ?? [];
			const top = plays.length ? plays[plays.length - 1].combination : null;
			const all = top ? findBeatablePlays(ctx.hand, top) : findAllPlayableCombinations(ctx.hand);
			for (const c of all) {
				if (top === null || !(c.cards.length === 1 && c.cards[0].id === 'dog')) {
					const ids = c.cards.map(x => x.id);
					const s = solveTwoLeft(ctx, ids)!;
					expect(s.value).toBe(best.value);
					expect(s.preferredValue!).toBeLessThanOrEqual(best.value);
					if (s.preferredValue === best.value) {
						expect(s.move).toEqual(ids);
						kept++;
					}
				}
			}
		}
		expect(kept).toBeGreaterThan(100);
	});

	it('상대 손패 내용은 보지 않는다 — 가려도 같은 답', () => {
		const r = rng(5);
		for (let i = 0; i < 50; i++) {
			const pos = randomTwoLeft(r);
			const ctx = contextOf(pos, pos.mover);
			const open = solveTwoLeft(ctx)!;
			const hidden = ctx.players.map(p => (p.seat === pos.mover ? p : { ...p, hand: p.hand.map(() => ({ type: 'normal', suit: 'jade', rank: 2, id: 'x' }) as Card) }));
			expect(solveTwoLeft({ ...ctx, players: hidden })).toEqual(open);
		}
	});
});

// ───────────────────────── 확실한 마무리 ─────────────────────────

describe('확실한 마무리', () => {
	/** 좌석 0이 나, 나머지 손패는 others. played = 이미 나온 카드 */
	function scene(mine: Card[], others: (Card[] | null)[], top: Combination | null = null, topSeat = 1): AiDecisionContext {
		const inHands = new Set([...mine, ...others.flatMap(h => h ?? []), ...(top?.cards ?? [])].map(c => c.id));
		const played = DECK.filter(c => !inHands.has(c.id));
		const finished = others.map((h, i) => (h === null ? i + 1 : -1)).filter(s => s > 0) as SeatIndex[];
		const players = [
			player(0, mine, played, null),
			...others.map((h, i) => player(i + 1, h ?? [], [], h === null ? finished.indexOf((i + 1) as SeatIndex) + 1 : null))
		];
		const trick: Trick | null = top
			? { plays: [{ seat: topSeat as SeatIndex, combination: top }], passCount: 0, leadSeat: topSeat as SeatIndex, currentSeat: 0 as SeatIndex }
			: null;
		return ctxOf(players, 0, trick, finished);
	}

	it('A 페어·K 페어·3 — 더 높은 페어가 없으면 페어들부터 내고 3으로 나간다', () => {
		const [a1, a2, a3] = normal(14);
		const [k1, k2, k3, k4] = normal(13);
		const three = normal(3)[0];
		// 안 보이는 A는 한 장뿐이고(나머지 한 장과 봉황은 이미 나왔다) K 두 장은 페어가 돼도 K 페어를 못 이긴다
		const ctx = scene([a1, a2, k1, k2, three], [[a3, ...normal(4).slice(0, 2)], [k3, ...normal(6).slice(0, 2)], [k4, normal(7)[0]]]);
		const first = findSureExit(ctx)!;
		expect(first).not.toBeNull();
		// A·K 연속 페어 넉 장을 한 번에 낸다 (아무도 못 받는다)
		expect([...first].sort()).toEqual([a1.id, a2.id, k1.id, k2.id].sort());
		// 3부터 내려던 수는 바뀐다
		expect(refineWithLogic(ctx, [three.id])).toEqual(first);
		// 페어부터 내려던 수는 그대로
		expect(refineWithLogic(ctx, [k1.id, k2.id])).toEqual([k1.id, k2.id]);
	});

	it('안 보이는 카드로 폭탄이 만들어질 수 있으면 확실하지 않다', () => {
		const [a1, a2] = normal(14);
		const three = normal(3)[0];
		const ctx = scene([a1, a2, three], [normal(5), normal(6).slice(0, 2), normal(7).slice(0, 2)]);
		expect(findSureExit(ctx)).toBeNull();
	});

	it('봉황이 안 나왔으면 A 낱장은 확실하지 않다', () => {
		const a = normal(14)[0];
		const three = normal(3)[0];
		expect(findSureExit(scene([a, three], [[special('phoenix'), normal(4)[0]], [normal(6)[0]], [normal(7)[0]]]))).toBeNull();
		expect(findSureExit(scene([a, three], [[normal(4)[0]], [normal(6)[0]], [normal(7)[0]]]))).toEqual([a.id]);
	});

	it('파트너가 티츄를 불렀고 아직 아무도 안 나갔으면 먼저 나가지 않는다', () => {
		const a = normal(14)[0];
		const three = normal(3)[0];
		const ctx = scene([a, three], [[normal(4)[0]], [normal(6)[0], normal(6)[1]], [normal(7)[0]]]);
		expect(findSureExit(ctx)).toEqual([a.id]);
		ctx.players[2].smallTichu = true;
		expect(findSureExit(ctx)).toBeNull();
	});

	it('찾은 순서는 남들이 무슨 패를 쥐었든 끝까지 통한다', () => {
		const r = rng(31);
		let fired = 0;
		for (let i = 0; i < 6000; i++) {
			// 내 패는 높은 쪽에서, 남의 패는 아무 데서나 — 끝판처럼 대부분의 카드는 이미 나온 상태
			const high = shuffled(DECK.filter(c => c.type === 'special' || (c as NormalCard).rank >= 10), r);
			const mine = high.slice(0, 1 + Math.floor(r() * 6));
			const rest = shuffled(DECK.filter(c => !mine.includes(c)), r);
			const others: (Card[] | null)[] = [1, 2, 3].map(() => (r() < 0.25 ? null : rest.splice(0, 1 + Math.floor(r() * 4))));
			if (others.every(h => h === null)) continue;
			let top: Combination | null = null;
			const topSeat = 1 + others.findIndex(h => h !== null);
			if (r() < 0.3) {
				const card = rest.find(c => !(c.type === 'special' && (c.special === 'dog' || c.special === 'dragon')))!;
				rest.splice(rest.indexOf(card), 1);
				top = resolvePhoenixSingleRank(detectCombination([card])!, null);
			}
			let ctx = scene(mine, others, top, topSeat);
			if (!findSureExit(ctx)) continue;
			fired++;
			let hand = mine;
			for (let step = 0; hand.length > 0; step++) {
				expect(step).toBeLessThan(12);
				const move = findSureExit(ctx);
				expect(move, `판 ${i} ${step}번째`).not.toBeNull();
				const cards = move!.map(id => hand.find(c => c.id === id)!);
				const combo = resolvePhoenixSingleRank(detectCombination(cards)!, top);
				if (top) expect(canBeat(top, combo)).toBe(true);
				hand = hand.filter(c => !cards.includes(c));
				if (hand.length === 0) break;
				// 아직 손패가 남았으면 이 조합은 아무도 못 이겨야 한다 — 그래야 선이 내게 돌아온다
				for (const h of others) {
					if (h) expect(findBeatablePlays(h, combo).map(c => c.cards.map(x => x.id)), `판 ${i}: ${move} 위에`).toEqual([]);
				}
				top = null;
				ctx = scene(hand, others);
			}
		}
		expect(fired).toBeGreaterThan(200);
	});

	it('스위치를 끄면 고른 수를 그대로 낸다', () => {
		const [a1, a2] = normal(14);
		const three = normal(3)[0];
		const ctx = scene([a1, a2, three], [[normal(4)[0]], [normal(6)[0]], [normal(7)[0]]]);
		expect(refineWithLogic(ctx, [three.id])).not.toEqual([three.id]);
		__logic.on = false;
		try {
			expect(refineWithLogic(ctx, [three.id])).toEqual([three.id]);
		} finally {
			__logic.on = true;
		}
	});
});

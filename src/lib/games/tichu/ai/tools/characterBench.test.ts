/**
 * 캐릭터 측정 — "얼마나 다르게 두는가"와 "실력이 같은가"를 한 번에 잰다.
 *
 * 실력 비교는 같은 패를 돌려 가며 받는 방식이다. 패 묶음 하나(게임 한 판 분량의 딜)를
 * 자리 배치 10가지로 다시 친다 — 다섯 캐릭터가 네 자리를 두 번씩 앉고, 열 가지 파트너
 * 짝이 두 번씩 나온다. 모든 캐릭터가 같은 손패를 한 번씩 받으므로 패 운이 상쇄된다.
 *
 *   CHAR_BENCH=1 SEED=1 SETS=12 OUT=/tmp/x.json npx vitest run src/lib/games/tichu/ai/tools/characterBench.test.ts
 *   OVERRIDE='{"wild":{"grandPropensity":1.4}}'        캐릭터 성향값(PersonalityWeights)을 덮어쓴다
 *   BIAS='{"balanced":{"passFree_near":0}}'            캐릭터 상황 보정값을 덮어쓴다
 *   AB=1 OLD_MODEL=<예전 humanModel.json>              한 팀은 지금 모델, 한 팀은 예전 모델로 같은 패를 두 번 친다
 * 결과 정리: python3 scripts/tichu-model/bench_report.py parity|ab <결과 폴더>
 * (평소 테스트에서는 건너뛴다)
 */
import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { loadHumanModel, __setHumanModel, SITUATION_BIAS, type HumanModel } from '../humanModel';
import { readFileSync } from 'node:fs';
import { simulateGame, clampTimers, seedRandom } from '../simHarness';
import { AiPlayer } from '../aiPlayer';
import { createShuffledDeck } from '../../deck';
import { getPartnerSeat } from '../../constants';
import { findBeatablePlays } from '../handEvaluator';
import type { AiStrategy } from '../types';
import type { Card, Combination } from '../../types';

const ALL: AiStrategy[] = ['aggressive', 'tricky', 'balanced', 'wild', 'defensive'];

const KEYS = [
	'rounds', 'games', 'wins', 'scoreDiff', 'first', 'last', 'oneTwo',
	'gt', 'gtOk', 'st', 'stOk',
	'bombs', 'bombInterrupt', 'ownBomb', 'dog',
	'oppChoice', 'oppChoicePass', 'partnerChoice', 'partnerChoicePass',
	'leads', 'leadCards', 'leadSingle', 'bigHandLeads', 'bigHandBigLead', 'followSingles', 'followHigh',
	'exch', 'pDragon', 'pPhoenix', 'pAce', 'pKing', 'pTenQ', 'pMid', 'pLow', 'pDog', 'pMahjong',
	'hadDragon', 'gaveDragon', 'hadPhoenix', 'gavePhoenix', 'hadAce', 'gaveAce',
	'hadDog', 'dogToOpp', 'dogToPartner', 'hadMahjong', 'mahjongToOpp',
	'wishAsk', 'wishSet'
] as const;
type Key = (typeof KEYS)[number];
type Stat = Record<Key, number>;
const blank = (): Stat => Object.fromEntries(KEYS.map(k => [k, 0])) as Stat;

const sp = (c: Card, n: string) => c.type === 'special' && c.special === n;
const isHighSingle = (c: Combination) =>
	c.type === 'single' && (c.rank >= 14 || sp(c.cards[0], 'dragon') || sp(c.cards[0], 'phoenix'));

const run = process.env.CHAR_BENCH ? it : it.skip;

describe('캐릭터 측정', () => {
	run('행동 차이와 실력 차이', async () => {
		await loadHumanModel();
		const seed = Number(process.env.SEED ?? 1);
		const sets = Number(process.env.SETS ?? 2);
		const override = JSON.parse(process.env.OVERRIDE ?? '{}') as Record<string, Record<string, number | string>>;
		const stats = Object.fromEntries(ALL.map(p => [p, blank()])) as Record<AiStrategy, Stat>;
		// BIAS='{"balanced":{"passFree_near":0}}' — 캐릭터 상황 보정값을 바꿔서 재 본다
		const biasOverride = JSON.parse(process.env.BIAS ?? '{}') as Record<string, Record<string, number>>;
		for (const [p, o] of Object.entries(biasOverride)) Object.assign(SITUATION_BIAS[p as AiStrategy], o);
		/** 패 묶음별 캐릭터 점수차 합 — 표준오차 계산용 */
		const perSet: Record<AiStrategy, { diff: number; rounds: number }>[] = [];

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const proto = AiPlayer.prototype as any;
		const orig = {
			ex: proto.makeExchangeDecision, wish: proto.makeWishDecision, bomb: proto.checkBombInterrupt,
			play: proto.makePlayDecision, grand: proto.makeGrandTichuDecision, small: proto.makeSmallTichuDecision
		};
		// AB 모드: 팀마다 지금 모델 / 예전 모델을 갈아 끼운다. newTeam: 'A' | 'B' | null(전부 지금 모델)
		const newModel = (await loadHumanModel())!;
		const oldModel: HumanModel | null = process.env.OLD_MODEL ? JSON.parse(readFileSync(process.env.OLD_MODEL, 'utf8')) : null;
		let newTeam: 'A' | 'B' | null = null;
		const ab = { rounds: 0, diff: 0, games: 0, wins: 0, perSet: [] as { diff: number; rounds: number }[] };
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const useVersion = (ai: any) => {
			const isNew = newTeam === null || (ai.seat % 2 === 0) === (newTeam === 'A');
			__setHumanModel(isNew || !oldModel ? newModel : oldModel);
		};
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const applyOverride = (ai: any) => {
			useVersion(ai);
			if (ai.__ov) return;
			ai.__ov = true;
			const o = override[ai.strategy];
			if (o) Object.assign(ai.weights, o);
		};
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		proto.makeGrandTichuDecision = function (...a: any[]) { applyOverride(this); return orig.grand.apply(this, a); };
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		proto.makeSmallTichuDecision = function (...a: any[]) { applyOverride(this); return orig.small.apply(this, a); };
		proto.makeExchangeDecision = function (hand: Card[], ...rest: unknown[]) {
			applyOverride(this);
			const r = orig.ex.call(this, hand, ...rest);
			const s = stats[this.strategy as AiStrategy];
			const find = (id: string) => hand.find(x => x.id === id);
			const p = find(r.toPartner);
			const opp = [find(r.toLeft), find(r.toRight)];
			s.exch++;
			if (p) {
				if (sp(p, 'dragon')) s.pDragon++;
				else if (sp(p, 'phoenix')) s.pPhoenix++;
				else if (sp(p, 'dog')) s.pDog++;
				else if (sp(p, 'mahjong')) s.pMahjong++;
				else if (p.type === 'normal') {
					if (p.rank === 14) s.pAce++;
					else if (p.rank === 13) s.pKing++;
					else if (p.rank >= 10) s.pTenQ++;
					else if (p.rank >= 6) s.pMid++;
					else s.pLow++;
				}
			}
			if (hand.some(c => sp(c, 'dragon'))) { s.hadDragon++; if (p && sp(p, 'dragon')) s.gaveDragon++; }
			if (hand.some(c => sp(c, 'phoenix'))) { s.hadPhoenix++; if (p && sp(p, 'phoenix')) s.gavePhoenix++; }
			if (hand.some(c => c.type === 'normal' && c.rank === 14)) { s.hadAce++; if (p && p.type === 'normal' && p.rank === 14) s.gaveAce++; }
			if (hand.some(c => sp(c, 'dog'))) {
				s.hadDog++;
				if (p && sp(p, 'dog')) s.dogToPartner++;
				if (opp.some(c => c && sp(c, 'dog'))) s.dogToOpp++;
			}
			if (hand.some(c => sp(c, 'mahjong'))) { s.hadMahjong++; if (opp.some(c => c && sp(c, 'mahjong'))) s.mahjongToOpp++; }
			return r;
		};
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		proto.makePlayDecision = function (ctx: any) {
			useVersion(this);
			const r = orig.play.call(this, ctx);
			const plays = ctx.trick?.plays ?? [];
			if (plays.length > 0) {
				const top = plays[plays.length - 1];
				if (findBeatablePlays(ctx.hand, top.combination).length > 0) {
					const s = stats[this.strategy as AiStrategy];
					if (top.seat === getPartnerSeat(ctx.currentSeat)) { s.partnerChoice++; if (r === 'pass') s.partnerChoicePass++; }
					else { s.oppChoice++; if (r === 'pass') s.oppChoicePass++; }
				}
			}
			return r;
		};
		proto.makeWishDecision = function (...a: unknown[]) {
			useVersion(this);
			const r = orig.wish.apply(this, a);
			const s = stats[this.strategy as AiStrategy];
			s.wishAsk++;
			if (r !== null) s.wishSet++;
			return r;
		};
		proto.checkBombInterrupt = function (...a: unknown[]) {
			useVersion(this);
			const r = orig.bomb.apply(this, a);
			if (r) stats[this.strategy as AiStrategy].bombInterrupt++;
			return r;
		};
		const origOwn = proto.checkOwnTrickBomb, origGift = proto.makeDragonGiftDecision;
		proto.checkOwnTrickBomb = function (...a: unknown[]) {
			useVersion(this);
			const r = origOwn.apply(this, a);
			if (r) stats[this.strategy as AiStrategy].ownBomb++;
			return r;
		};
		proto.makeDragonGiftDecision = function (...a: unknown[]) { useVersion(this); return origGift.apply(this, a); };

		const restore = clampTimers();
		const t0 = Date.now();
		let totalRounds = 0;
		try {
			for (let d = 0; d < sets; d++) {
				// 패 묶음: 한 게임이 쓸 만큼 넉넉히
				const unDeck = seedRandom(seed * 100003 + d * 7919 + 1);
				const decks: Card[][] = Array.from({ length: 60 }, () => createShuffledDeck());
				unDeck();
				const setAcc = Object.fromEntries(ALL.map(p => [p, { diff: 0, rounds: 0 }])) as Record<AiStrategy, { diff: number; rounds: number }>;

				const arrangements: AiStrategy[][] = [];
				for (let k = 0; k < 5; k++) {
					arrangements.push([0, 1, 2, 3].map(s => ALL[(s + k) % 5]));
					arrangements.push([0, 1, 2, 3].map(s => ALL[(2 * s + k) % 5]));
				}
				const AB = !!process.env.AB;
				const setAB = { diff: 0, rounds: 0 };
				for (const [presets, team] of arrangements.flatMap(a => (AB ? [[a, 'A'], [a, 'B']] : [[a, null]]) as [AiStrategy[], 'A' | 'B' | null][])) {
					newTeam = team;
					const un = seedRandom(seed * 7 + d * 131 + 17);
					const st = (seat: number) => stats[presets[seat]];
					let lastA = 0, lastB = 0;
					try {
						await simulateGame({
							presets: presets as [AiStrategy, AiStrategy, AiStrategy, AiStrategy],
							targetScore: 1000,
							decks,
							onEvent: (e, engine) => {
								if (e.seat === undefined) return;
								const s = st(e.seat);
								const trick = engine.state.round?.trick;
								if (e.type === 'play' || e.type === 'bomb') {
									const combo = e.combo as Combination;
									if (e.type === 'bomb') { s.bombs++; return; }
									const plays = trick?.plays ?? [];
									if (plays.length <= 1) {
										s.leads++;
										s.leadCards += combo.cards.length;
										if (combo.type === 'single') s.leadSingle++;
										const handBefore = engine.state.players[e.seat].hand.length + combo.cards.length;
										if (handBefore >= 9) { s.bigHandLeads++; if (combo.cards.length >= 3) s.bigHandBigLead++; }
									} else if (combo.type === 'single') {
										s.followSingles++;
										if (isHighSingle(combo)) s.followHigh++;
									}
								} else if (e.type === 'dog') s.dog++;
							},
							onRound: (r) => {
								totalRounds++;
								lastA += r.teamAScore; lastB += r.teamBScore;
								if (team) {
									const dd = (team === 'A' ? 1 : -1) * (r.teamAScore - r.teamBScore);
									ab.rounds++; ab.diff += dd; setAB.rounds++; setAB.diff += dd;
								}
								for (let seat = 0; seat < 4; seat++) {
									const s = st(seat);
									const teamA = seat % 2 === 0;
									const diff = teamA ? r.teamAScore - r.teamBScore : r.teamBScore - r.teamAScore;
									s.rounds++;
									s.scoreDiff += diff;
									setAcc[presets[seat]].diff += diff;
									setAcc[presets[seat]].rounds++;
									if (r.finishOrder[0] === seat) s.first++;
									if (r.finishOrder.length === 4 && r.finishOrder[3] === seat) s.last++;
									if (r.oneTwo && (r.oneTwo === 'A') === teamA) s.oneTwo++;
								}
								for (const x of r.grandTichuDeclarations) { st(x.seat).gt++; if (x.success) st(x.seat).gtOk++; }
								for (const x of r.smallTichuDeclarations) { st(x.seat).st++; if (x.success) st(x.seat).stOk++; }
							}
						});
					} finally {
						un();
					}
					for (let seat = 0; seat < 4; seat++) {
						const s = st(seat);
						s.games++;
						if (lastA !== lastB && (lastA > lastB) === (seat % 2 === 0)) s.wins++;
					}
					if (team) { ab.games++; if (lastA !== lastB && (lastA > lastB) === (team === 'A')) ab.wins++; }
				}
				if (AB) ab.perSet.push(setAB);
				perSet.push(setAcc);
			}
		} finally {
			restore();
			proto.makeExchangeDecision = orig.ex;
			proto.makeWishDecision = orig.wish;
			proto.checkBombInterrupt = orig.bomb;
			proto.makePlayDecision = orig.play;
			proto.makeGrandTichuDecision = orig.grand;
			proto.makeSmallTichuDecision = orig.small;
			proto.checkOwnTrickBomb = origOwn;
			proto.makeDragonGiftDecision = origGift;
			__setHumanModel(newModel);
		}
		const out = { seed, sets, totalRounds, seconds: Math.round((Date.now() - t0) / 1000), stats, perSet, ab };
		if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(out));
		console.log(JSON.stringify({ seed, sets, totalRounds, seconds: out.seconds }));
	}, 7_200_000);
});

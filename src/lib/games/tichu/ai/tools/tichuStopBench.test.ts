/**
 * 티츄 저지 실험 (측정 도구 — 평소 테스트에서는 건너뛴다).
 *
 * 0번 자리가 사람처럼 자주 티츄를 부르게 하고(손패 강도 기준, 판마다 같은 패면 같은 선언),
 * 상대 두 자리(1·3번)의 저지 전술만 바꿔 가며 **같은 패**를 다시 친다.
 *
 *   STOP_BENCH=1 SEED=1 SETS=2 VARIANTS='[{"name":"beat+3","beatCaller":3}]' OUT=x.json npx vitest run src/lib/games/tichu/ai/tools/tichuStopBench.test.ts
 * 기준('off')은 저지 보정을 끈 것. VARIANTS의 각 항목은 __defense 값을 덮어쓴다.
 * 결과 정리: python3 scripts/tichu-model/bench_report.py stop <결과 폴더>
 */
import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { loadHumanModel } from '../humanModel';
import { simulateGame, clampTimers, seedRandom } from '../simHarness';
import { AiPlayer } from '../aiPlayer';
import { __defense } from '../tichuDefense';
import { evaluateHandStrength } from '../handEvaluator';
import { createShuffledDeck } from '../../deck';
import type { AiStrategy } from '../types';
import type { Card } from '../../types';

const ALL: AiStrategy[] = ['aggressive', 'tricky', 'balanced', 'wild', 'defensive'];
const BASE = { ...__defense };
const OFF: Partial<typeof BASE> = { on: false };
type Acc = { rounds: number; decl: number; ok: number; gt: number; gtOk: number; st: number; stOk: number; diff: number; diffDecl: number; oppFirst: number; games: number; winsA: number };
const blank = (): Acc => ({ rounds: 0, decl: 0, ok: 0, gt: 0, gtOk: 0, st: 0, stOk: 0, diff: 0, diffDecl: 0, oppFirst: 0, games: 0, winsA: 0 });

const run = process.env.STOP_BENCH ? it : it.skip;
describe('티츄 저지 실험', () => {
	run('전술별 선언 성공률', async () => {
		await loadHumanModel();
		const seed = Number(process.env.SEED ?? 1);
		const sets = Number(process.env.SETS ?? 1);
		const GT = Number(process.env.GT_TH ?? 19), ST = Number(process.env.ST_TH ?? 32);
		const variants: ({ name: string } & Partial<typeof BASE>)[] = [{ name: 'off', ...OFF }, ...JSON.parse(process.env.VARIANTS ?? '[]')];
		const acc: Record<string, Acc> = Object.fromEntries(variants.map(v => [v.name, blank()]));
		const perSet: Record<string, { decl: number; ok: number; diff: number; rounds: number }>[] = [];
		let cur: Partial<typeof BASE> = {};

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const proto = AiPlayer.prototype as any;
		const names = ['makePlayDecision', 'checkBombInterrupt', 'checkOwnTrickBomb', 'makeWishDecision', 'makeDragonGiftDecision', 'makeExchangeDecision'];
		const orig: Record<string, (...a: unknown[]) => unknown> = {};
		// 저지 전술은 상대 자리(1·3번)의 판단에만 켠다
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const use = (ai: any) => Object.assign(__defense, BASE, ai.seat % 2 === 1 ? cur : {});
		for (const n of names) {
			orig[n] = proto[n];
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			proto[n] = function (this: any, ...a: unknown[]) { use(this); return orig[n].apply(this, a); };
		}
		const origG = proto.makeGrandTichuDecision, origS = proto.makeSmallTichuDecision;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		proto.makeGrandTichuDecision = function (this: any, hand: Card[], ...a: unknown[]) {
			use(this);
			return this.seat === 0 ? evaluateHandStrength(hand) >= GT : origG.call(this, hand, ...a);
		};
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		proto.makeSmallTichuDecision = function (this: any, hand: Card[], ...a: unknown[]) {
			use(this);
			// 0번: 14장을 다 쥔 첫 차례에만, 손패 강도로
			return this.seat === 0 ? hand.length === 14 && evaluateHandStrength(hand) >= ST : origS.call(this, hand, ...a);
		};

		const restore = clampTimers();
		const t0 = Date.now();
		try {
			for (let d = 0; d < sets; d++) {
				const unDeck = seedRandom(seed * 100003 + d * 7919 + 5);
				const decks: Card[][] = Array.from({ length: 60 }, () => createShuffledDeck());
				unDeck();
				const arrangements: AiStrategy[][] = [];
				for (let k = 0; k < 5; k++) {
					arrangements.push([0, 1, 2, 3].map(s => ALL[(s + k) % 5]));
					arrangements.push([0, 1, 2, 3].map(s => ALL[(2 * s + k) % 5]));
				}
				const setAcc = Object.fromEntries(variants.map(v => [v.name, { decl: 0, ok: 0, diff: 0, rounds: 0 }]));
				for (const presets of arrangements) {
					for (const v of variants) {
						const { name, ...params } = v;
						cur = params;
						const a = acc[name], sa = setAcc[name];
						let A = 0, B = 0;
						const un = seedRandom(seed * 7 + d * 131 + 17);
						try {
							await simulateGame({
								presets: presets as [AiStrategy, AiStrategy, AiStrategy, AiStrategy],
								targetScore: 1000, decks,
								onRound: (r) => {
									const diff = r.teamAScore - r.teamBScore;
									A += r.teamAScore; B += r.teamBScore;
									a.rounds++; a.diff += diff; sa.rounds++; sa.diff += diff;
									const g = r.grandTichuDeclarations.find((x: { seat: number }) => x.seat === 0);
									const s = r.smallTichuDeclarations.find((x: { seat: number }) => x.seat === 0);
									if (g) { a.gt++; if (g.success) a.gtOk++; }
									if (s) { a.st++; if (s.success) a.stOk++; }
									if (g || s) {
										a.decl++; sa.decl++; a.diffDecl += diff;
										if ((g ?? s)!.success) { a.ok++; sa.ok++; }
										if (r.finishOrder[0] % 2 === 1) a.oppFirst++;
									}
								}
							});
						} finally { un(); }
						a.games++; if (A > B) a.winsA++;
					}
				}
				perSet.push(setAcc);
			}
		} finally {
			restore();
			for (const n of names) proto[n] = orig[n];
			proto.makeGrandTichuDecision = origG; proto.makeSmallTichuDecision = origS;
			Object.assign(__defense, BASE);
		}
		const out = { seed, sets, seconds: Math.round((Date.now() - t0) / 1000), variants, acc, perSet };
		if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(out));
		console.log(JSON.stringify({ seed, sets, seconds: out.seconds, off: acc.off }));
	}, 7_200_000);
});

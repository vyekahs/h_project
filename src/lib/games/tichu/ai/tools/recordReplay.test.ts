/**
 * 기록 재생 (분석·학습용 도구 — 평소 테스트에서는 건너뛴다).
 *
 * 사람이 둔 판을 한 수씩 되짚어, 그 순간의 후보·특징과 지금의 AI 캐릭터들이 고를 수를 남긴다.
 * 모델 학습 자료도 이걸로 만든다 (scripts/tichu-model/README.md).
 *
 *   REPLAY=1 IN=<tichu_log.json> OUT=<out.jsonl> npx vitest run src/lib/games/tichu/ai/tools/recordReplay.test.ts
 *
 * 출력 한 줄 = 사람의 판단 한 번:
 *   kind 'turn'  내 차례에 낸 수(패스 포함)   — 후보 전체와 캐릭터별 선택
 *   kind 'top'   누가 카드를 낸 직후, 폭탄을 쥐고 있던 순간 — 끼어들었는지와 캐릭터별 끼어들기 판단
 *   kind 'meta'  특징 이름 (첫 줄)
 *
 * 예전 기록에는 소원이 없다("M:9" 줄이 없다). 그런 판은 참새가 나온 뒤 숫자 2~14를 모두 "소원이었을 수 있는 후보"로 두고,
 * 그 숫자를 낼 수 있었는데 안 낸 사람이 나오면 후보에서 지운다(네 사람 손패를 다 아니까 가능하다).
 * turn 줄의 wish.forced 가 비어 있지 않으면 그 수는 소원 때문에 낸 것일 수 있다 — 사람이 고른 수로 세면 안 된다.
 */
import { describe, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadHumanModel, extractCandidates, pickFromCandidates, scoreCandidates, situationTags, normKey, MODEL_PRESETS, FEATURE_NAMES } from '../humanModel';
import { AiPlayer } from '../aiPlayer';
import { __deterministic } from '../determinism';
import { createAllCards, getNextActiveSeat, getTeam, getCardPoints } from '../../constants';
import { detectCombination, resolvePhoenixSingleRank, isBomb, canBeat } from '../../combinations';
import { createWishState, canPlayWishedCombo } from '../../wish';
import { findBombs, findOptimalPartition, findAllPlayableCombinations } from '../handEvaluator';
import type { AiDecisionContext, AiStrategy } from '../types';
import type { Card, Combination, Rank, SeatIndex, TichuPlayer, Trick } from '../../types';

interface Row {
	id: number; u: number; t: string; r: number; seat: number; st: string | null; ps: string | null;
	d: string; ff: boolean; fp: number | null; ts: number | null; tg: number | null;
	h8: string[] | null; h14: string[] | null; plays: [number, string][] | null;
}

const run = process.env.REPLAY ? it : it.skip;

describe('기록 재생', () => {
	run('사람의 판단마다 캐릭터의 선택을 남긴다', async () => {
		const model = (await loadHumanModel())!;
		__deterministic.on = true;
		const rows: Row[] = JSON.parse(readFileSync(process.env.IN!, 'utf8'));
		const [shard, shards] = (process.env.SHARD ?? '0/1').split('/').map(Number);
		const byId = new Map(createAllCards().map(c => [c.id, c]));
		const card = (id: string) => byId.get(id)!;

		const rounds = new Map<string, Row[]>();
		for (const r of rows) {
			const k = `${r.u}|${r.t.slice(0, 19)}|${r.r}`;
			if (!rounds.has(k)) rounds.set(k, []);
			rounds.get(k)!.push(r);
		}
		// 누적 점수: 같은 사람의 연속된 라운드를 한 게임으로 묶는다
		const keys = [...rounds.keys()].sort();
		const cum = new Map<string, [number, number]>();
		{
			let prevU = -1, prevR = 99, a = 0, b = 0;
			for (const k of keys) {
				const rs = rounds.get(k)!;
				const u = rs[0].u, rn = rs[0].r;
				if (u !== prevU || rn <= prevR) { a = 0; b = 0; }
				cum.set(k, [a, b]);
				a += rs.find(x => x.seat === 0)?.ts ?? 0;
				b += rs.find(x => x.seat === 1)?.ts ?? 0;
				prevU = u; prevR = rn;
			}
		}

		const ais = Object.fromEntries(MODEL_PRESETS.map(p => [p, new AiPlayer(0 as SeatIndex, p, false)])) as Record<AiStrategy, AiPlayer>;
		const out: string[] = [];
		if (shard === 0) out.push(JSON.stringify({ kind: 'meta', features: FEATURE_NAMES }));
		let ki = -1;
		for (const k of keys) {
			ki++;
			if (ki % shards !== shard) continue;
			const rs = rounds.get(k)!;
			const bySeat = [0, 1, 2, 3].map(s => rs.find(x => x.seat === s));
			if (bySeat.some(x => !x || !x.h14) || !bySeat[0]!.plays) continue;
			const u = bySeat[0]!.u;
			const players: TichuPlayer[] = bySeat.map((x, s) => ({
				userId: s, name: `p${s}`, seat: s as SeatIndex, team: getTeam(s),
				hand: x!.h14!.map(card), wonCards: [], grandTichu: x!.d === 'grand', smallTichu: false,
				hasPlayedFirstCard: false, finishOrder: null, connected: true
			}));
			const finishOrder: SeatIndex[] = [];
			let trick: Trick | null = null;
			let expected: number | null = null;
			let topI = -1;
			const [ca, cb] = cum.get(k)!;
			const ctxFor = (seat: number): AiDecisionContext => ({
				hand: players[seat].hand, trick, wish: createWishState(), currentSeat: seat as SeatIndex, players,
				finishOrder, finishedCount: finishOrder.length, cumulativeScoreA: ca, cumulativeScoreB: cb,
				completedRounds: [], roundNumber: bySeat[0]!.r
			});
			const base = (seat: number) => ({
				u, k, seat, fp: bySeat[0]!.fp, tg: bySeat[0]!.tg,
				hand: players[seat].hand.map(c => c.id),
				left: players.map(p => p.hand.length),
				decl: players.map(p => (p.grandTichu ? 'G' : p.smallTichu ? 'S' : '')),
				out: [...finishOrder],
				pts: trick ? trick.plays.flatMap(p => p.combination.cards).reduce((a, c) => a + getCardPoints(c), 0) : 0,
				top: trick && trick.plays.length
					? (() => { const t = trick!.plays[trick!.plays.length - 1]; return { seat: t.seat, type: t.combination.type, rank: t.combination.rank, cards: t.combination.cards.map(c => c.id) }; })()
					: null,
				lead: trick ? trick.leadSeat : null,
				topI: trick && trick.plays.length ? topI : -1,
				nplays: trick ? trick.plays.length : 0
			});
			const finish = (seat: number) => {
				if (players[seat].hand.length === 0 && players[seat].finishOrder === null) {
					finishOrder.push(seat as SeatIndex);
					players[seat].finishOrder = finishOrder.length;
				}
			};
			const next = (seat: number) => getNextActiveSeat(seat, players);
			const turnsOf = (cs: Card[]) => cs.length === 0 ? 0
				: findOptimalPartition(cs, findAllPlayableCombinations(cs).filter(c => !isBomb(c))).turns;

			const plays = bySeat[0]!.plays!;
			let aborted = false;
			// 소원 후보: live(아직 살아 있음) → done(그 숫자가 나와서 끝남) / dead(낼 수 있었는데 안 낸 사람이 있어 소원이 아님)
			const wishCand = new Map<number, 'live' | 'done' | 'dead'>();
			let mjSeat: number | null = null;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const roundOut: any[] = [];
			for (let i = 0; i < plays.length && !aborted; i++) {
				const [seat, x] = plays[i];
				if (x[0] === 'T') { if (x === 'T:small') players[seat].smallTichu = true; continue; }
				if (x[0] === 'M') {
					// 소원이 기록된 판: 추측할 필요 없이 그 숫자만 남긴다 (0 = 소원 없음)
					const wished = Number(x.slice(2));
					for (let r = 2; r <= 14; r++) wishCand.set(r, r === wished ? 'live' : 'dead');
					continue;
				}
				if (x === 'W' || x[0] === 'G') {
					if (trick) {
						const to = x[0] === 'G' ? Number(x.slice(2)) : seat;
						players[to].wonCards.push(...trick.plays.flatMap(p => p.combination.cards));
					}
					trick = null;
					expected = players[seat].finishOrder === null ? seat : next(seat);
					continue;
				}
				const isDogPlay = x[0] === 'D';
				const ids = x === 'P' ? null : isDogPlay ? ['dog'] : x.split(' ');
				const inTurn = expected === null || expected === seat;

				// ---- 소원 후보 갱신: 이 사람이 그 숫자를 꼭 내야 했는가
				const topNow: Combination | null = trick && trick.plays.length ? trick.plays[trick.plays.length - 1].combination : null;
				const playedRanks = new Set((ids ?? []).map(card).filter(c => c?.type === 'normal').map(c => (c as { rank: number }).rank));
				const wishLive: number[] = [];
				const wishForced: number[] = [];
				for (const [r, st] of wishCand) {
					if (st !== 'live') continue;
					wishLive.push(r);
					const must = inTurn && players[seat].hand.some(c => c.type === 'normal' && c.rank === r) &&
						(topNow === null || canPlayWishedCombo(players[seat].hand, { active: true, requestedRank: r as Rank, requestedBy: null }, topNow));
					if (must) wishForced.push(r);
					if (playedRanks.has(r)) wishCand.set(r, 'done');
					else if (must) wishCand.set(r, 'dead');
				}

				// ---- 사람(0번 자리)의 내 차례 판단
				if (seat === 0 && inTurn) {
					try {
						const ctx = ctxFor(0);
						const set = extractCandidates(ctx);
						const human = ids ? normKey(ids) : 'P';
						const picks: Record<string, string> = {};
						const sc: Record<string, number[]> = {};
						for (const p of MODEL_PRESETS) {
							let d = pickFromCandidates(set, ctx, model, p);
							if (d === null) d = ais[p].makePlayDecision(ctx);
							picks[p] = d === 'pass' ? 'P' : normKey(d);
							sc[p] = scoreCandidates(set, model, p).map(v => Math.round(v * 10000) / 10000);
						}
						const handTurns = turnsOf(players[0].hand);
						const bombs = findBombs(players[0].hand);
						roundOut.push(({
							kind: 'turn', ...base(0), i, human, humanIds: ids, picks, sc, tags: situationTags(set), mj: mjSeat, wl: wishLive, wf: wishForced,
							handTurns, bombs: bombs.map(b => b.cards.map(c => c.id)),
							cands: set.cands.map((c, j) => ({
								k: set.keys[j], ids: c ? c.cards.map(z => z.id) : null, type: c ? c.type : 'pass', rank: c ? c.rank : 0,
								f: set.feats[j]
							}))
						}));
					} catch (e) {
						roundOut.push(({ kind: 'error', k, i, msg: String(e) }));
					}
				}

				// ---- 적용
				if (ids === null) {
					if (trick) trick.passCount++;
					expected = next(seat);
					continue;
				}
				if (isDogPlay) {
					players[seat].hand = players[seat].hand.filter(c => c.id !== 'dog');
					players[seat].hasPlayedFirstCard = true;
					finish(seat);
					trick = null;
					expected = Number(x.slice(2));
					continue;
				}
				const cards = ids.map(card);
				if (cards.some(c => !c || !players[seat].hand.some(h => h.id === c.id))) { aborted = true; break; }
				const combo0 = detectCombination(cards);
				if (!combo0) { aborted = true; break; }
				const last: Combination | null = trick && trick.plays.length ? trick.plays[trick.plays.length - 1].combination : null;
				const combo = resolvePhoenixSingleRank(combo0, last);
				const wasBombOutOfTurn = seat === 0 && !inTurn && isBomb(combo);
				players[seat].hand = players[seat].hand.filter(h => !ids.includes(h.id));
				players[seat].hasPlayedFirstCard = true;
				if (!trick) trick = { plays: [], passCount: 0, leadSeat: seat as SeatIndex, currentSeat: seat as SeatIndex };
				trick.plays.push({ seat: seat as SeatIndex, combination: combo });
				trick.passCount = 0;
				finish(seat);
				expected = next(seat);
				topI = i;
				void wasBombOutOfTurn;
				if (ids.includes('mahjong')) {
					mjSeat = seat;
					for (let r = 2; r <= 14; r++) wishCand.set(r, 'live');
				}

				// ---- 누가 카드를 낸 직후: 사람이 폭탄을 쥐고 있었다면 끼어들 수 있던 순간
				if (players[0].finishOrder === null) {
					const bombs = findBombs(players[0].hand).filter(b => canBeat(combo, b));
					if (bombs.length > 0) {
						// 이 카드가 바닥에 있는 동안(패스만 이어지는 동안) 0번이 폭탄을 냈는가
						let j = i + 1;
						let e = expected;
						let bombed: string[] | null = null;
						let bombInTurn = false;
						for (; j < plays.length; j++) {
							const [s2, y] = plays[j];
							if (y[0] === 'T') continue;
							if (y === 'P') { e = next(s2); continue; }
							if (y === 'W' || y[0] === 'G' || y[0] === 'D') break;
							if (s2 === 0) {
								const c = detectCombination(y.split(' ').map(card));
								if (c && isBomb(c)) { bombed = c.cards.map(z => z.id); bombInTurn = e === 0; }
							}
							break;
						}
						// 지금 AI 캐릭터의 끼어들기 판단 (엔진은 남이 낸 카드 위에서만 묻는다)
						const interrupt: Record<string, boolean> = {};
						// 내 차례가 왔다고 치면 폭탄을 고르는가 (차례가 오기 전에 판이 바뀔 수 있어 근사값이다)
						const turnBomb: Record<string, boolean> = {};
						if (seat === 0) {
							// 내가 낸 카드 위: 마지막 폭탄을 얹어 바로 나가는가
							for (const p of MODEL_PRESETS) interrupt[p] = !isBomb(combo) && ais[p].checkOwnTrickBomb(players[0].hand) !== null;
						} else {
							const ctx = ctxFor(0);
							for (const p of MODEL_PRESETS) {
								try { interrupt[p] = ais[p].checkBombInterrupt(ctx, { seat: seat as SeatIndex, combination: combo }) !== null; }
								catch { interrupt[p] = false; }
							}
							try {
								const set = extractCandidates(ctx);
								for (const p of MODEL_PRESETS) {
									const d = pickFromCandidates(set, ctx, model, p);
									const c = d && d !== 'pass' ? detectCombination(d.map(card)) : null;
									turnBomb[p] = !!c && isBomb(c);
								}
							} catch { /* 근사값이라 실패하면 비워 둔다 */ }
						}
						const afterTurns = bombs.map(b => turnsOf(players[0].hand.filter(h => !b.cards.some(z => z.id === h.id))));
						roundOut.push(({
							kind: 'top', ...base(0), i, myTurnNext: expected === 0, bombed, bombInTurn, interrupt, turnBomb,
							bombs: bombs.map(b => b.cards.map(c => c.id)), afterTurns,
							afterLeft: bombs.map(b => players[0].hand.length - b.cards.length),
							ownerOut: players[seat].finishOrder !== null
						}));
					}
				}
			}
			// 판이 끝난 뒤에도 지워지지 않은 숫자만 소원 후보로 남긴다
			const possible = (r: number) => wishCand.get(r) !== 'dead';
			for (const rec of roundOut) {
				if (rec.kind === 'turn') {
					rec.wish = { live: rec.wl.filter(possible), forced: rec.wf.filter(possible) };
					delete rec.wl; delete rec.wf;
				}
				out.push(JSON.stringify(rec));
			}
		}
		writeFileSync(process.env.OUT!, out.join('\n') + '\n');
		console.log(JSON.stringify({ shard, lines: out.length }));
	}, 7_200_000);
});

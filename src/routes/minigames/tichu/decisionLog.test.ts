/**
 * 선언 판단 기록이 실제로 만들어지는지 확인한다.
 *
 * 이 데이터는 나중에 AI 문턱을 보정하는 근거가 되므로, 특징값이 비어 있거나
 * 이상한 범위로 들어가면 몇 주치 수집이 통째로 쓸모없어진다.
 */
import { describe, it, expect, vi } from 'vitest';
import { LocalGameEngine } from '$lib/games/tichu/ai/localGameEngine';
import { AiPlayer } from '$lib/games/tichu/ai/aiPlayer';
import { clampTimers } from '$lib/games/tichu/ai/simHarness';
import {
	resetDecisionLog, noteGrandTichuHand, noteHandAtPlayStart, commitRound, flushDecisionLog
} from './decisionLog';
import type { GamePhase, SeatIndex } from '$lib/games/tichu/types';

describe('선언 판단 기록', () => {
	it('한 라운드를 돌리면 특징값이 채워진 행이 만들어진다', async () => {
		const restore = clampTimers();
		const sent: unknown[] = [];
		const realFetch = globalThis.fetch;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(globalThis as any).fetch = vi.fn(async (_url: string, init: any) => {
			sent.push(JSON.parse(init.body));
			return { ok: true, json: async () => ({ ok: true }) };
		});

		try {
			resetDecisionLog();
			const ai0 = new AiPlayer(0 as SeatIndex, 'balanced', false);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const e = new LocalGameEngine({
				playerName: 'p0', partnerStrategy: 'balanced', aiSpeed: 'fast',
				targetScore: 200, onStateChange: () => {}, onEvent: () => {}
			}) as any;
			e.waitForBombWindow = () => Promise.resolve();
			e.delay = () => Promise.resolve();
			e.startGame();

			let noted8 = false, noted14 = false, committed = false;
			for (let i = 0; i < 5000 && !committed; i++) {
				await new Promise(r => setTimeout(r, 0));
				const phase: GamePhase = e.state.phase;
				const round = e.state.round;

				if (phase === 'grand_tichu_window' && round && !noted8) {
					noteGrandTichuHand(round.roundNumber, e.state.players[0].hand);
					noted8 = true;
					if (e.state.players[0].grandTichu === null) e.humanPassGrandTichu();
				} else if (phase === 'exchange') {
					if (!e.exchangeSubmissions[0]) {
						e.humanSubmitExchange(ai0.makeExchangeDecision(e.state.players[0].hand));
					}
				} else if (phase === 'playing') {
					if (!noted14 && round) {
						noteHandAtPlayStart(round.roundNumber, e.state.players[0].hand, e);
						noted14 = true;
					}
					if (round?.currentSeat === 0 && e.state.players[0].finishOrder === null) {
						const d = ai0.makePlayDecision(e.createAiContext(0));
						if (d === 'pass') e.humanPass(); else await e.humanPlayCards(d);
					}
				} else if (phase === 'wish_declare') {
					if (round?.currentSeat === 0) {
						e.humanSetWish(ai0.makeWishDecision(e.state.players[0].hand, e.createAiContext(0)));
					}
				} else if (phase === 'dragon_gift') {
					if (round?.dragonGiftSeat === 0) e.humanGiftDragon(1 as SeatIndex);
				} else if (phase === 'round_end' || phase === 'game_end') {
					const rs = e.state.completedRounds;
					const r = rs[rs.length - 1];
					commitRound(
						r.roundNumber,
						r.grandTichuDeclarations.some((d: { seat: number }) => d.seat === 0) ? 'grand'
							: r.smallTichuDeclarations.some((d: { seat: number }) => d.seat === 0) ? 'small'
							: 'none',
						r.finishOrder[0] === 0,
						r.teamAScore,
						'balanced'
					);
					committed = true;
				}
			}
			expect(committed, '라운드가 끝나지 않아 기록을 만들지 못함').toBe(true);
			e.destroy();

			await flushDecisionLog();
			expect(sent.length, '전송이 일어나지 않음').toBe(1);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const rows = (sent[0] as any).rounds;
			expect(rows.length).toBe(1);
			const row = rows[0];

			expect(row.hand8?.length, '그랜드 시점 8장이 안 남음').toBe(8);
			expect(row.hand14?.length, '교환 후 14장이 안 남음').toBe(14);
			expect(['none', 'small', 'grand']).toContain(row.declared);
			expect(typeof row.finishedFirst).toBe('boolean');

			// 특징값이 채워지고 범위가 정상인지
			expect(row.pureWinRate, 'pureWinRate 미계산').not.toBeNull();
			expect(row.pureWinRate).toBeGreaterThanOrEqual(0);
			expect(row.pureWinRate).toBeLessThanOrEqual(1);
			expect(row.exitRate).toBeGreaterThan(0);
			expect(row.exitRate).toBeLessThanOrEqual(1);
			expect(row.minTurns, 'minTurns 범위 이상').toBeGreaterThan(0);
			expect(row.minTurns).toBeLessThanOrEqual(14);
			expect(row.leadCombos).toBeGreaterThanOrEqual(0);
			expect(row.leadCombos, 'leadCombos가 턴 수보다 많음').toBeLessThanOrEqual(row.minTurns);
			expect(row.handStrength).toBeGreaterThan(0);
			expect(row.raceProb).toBeGreaterThanOrEqual(0);
			expect(row.raceProb).toBeLessThanOrEqual(1);
		} finally {
			globalThis.fetch = realFetch;
			restore();
		}
	}, 120000);
});

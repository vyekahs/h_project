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
	resetDecisionLog, observePhase, observeState, observeEvent, flushDecisionLog
} from './decisionLog';
import type { GamePhase, SeatIndex } from '$lib/games/tichu/types';

describe('선언 판단 기록', () => {
	it('게임을 끝까지 돌리면 마지막 라운드까지 특징값이 채워진 행이 만들어진다', async () => {
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
			const e: any = new LocalGameEngine({
				playerName: 'p0', partnerStrategy: 'balanced', aiSpeed: 'fast',
				targetScore: 200, onStateChange: () => observeState(e),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				onEvent: (ev: any) => observeEvent(ev, e)
			});
			e.waitForBombWindow = () => Promise.resolve();
			e.delay = () => Promise.resolve();
			e.startGame();

			// 화면(gameState)과 똑같이 phase가 바뀔 때만 observePhase를 부른다.
			// 예전 테스트는 기록 함수를 직접 불러서, 화면 쪽 연결이 마지막 라운드를
			// 빠뜨리는 것을 잡지 못했다.
			let lastPhase: GamePhase | null = null;
			for (let i = 0; i < 100000 && lastPhase !== 'game_end'; i++) {
				await new Promise(r => setTimeout(r, 0));
				const phase: GamePhase = e.state.phase;
				const round = e.state.round;
				if (phase !== lastPhase) {
					const prev = lastPhase;
					lastPhase = phase;
					observePhase(phase, prev, e, 'balanced');
				}

				if (phase === 'grand_tichu_window') {
					if (e.state.players[0].grandTichu === null) e.humanPassGrandTichu();
				} else if (phase === 'exchange') {
					if (!e.exchangeSubmissions[0]) {
						e.humanSubmitExchange(ai0.makeExchangeDecision(e.state.players[0].hand));
					}
				} else if (phase === 'playing') {
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
				} else if (phase === 'round_end') {
					e.startNextRound();
				}
			}
			expect(lastPhase, '게임이 끝나지 않음').toBe('game_end');
			const totalRounds: number = e.state.completedRounds.length;
			e.destroy();

			await flushDecisionLog();
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const rows = sent.flatMap((b: any) => b.rounds);
			// 한 라운드 = 네 자리 4행 (사람 + AI 셋)
			expect(rows.length, '빠진 행이 있음 (마지막 라운드?)').toBe(totalRounds * 4);
			// 승부가 갈린 마지막 라운드는 round_end 없이 game_end로 간다 — 그것까지 남아야 한다
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const human = rows.filter((r: any) => r.seat === 0);
			expect(human.map((r: { roundNumber: number }) => r.roundNumber))
				.toEqual(Array.from({ length: totalRounds }, (_, i) => i + 1));
			// 라운드마다 보내야 중간에 그만둔 게임도 남는다
			expect(sent.length, '라운드마다 전송되지 않음').toBe(totalRounds);

			for (let n = 1; n <= totalRounds; n++) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const rr = rows.filter((r: any) => r.roundNumber === n);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				expect(rr.map((r: any) => r.seat).sort()).toEqual([0, 1, 2, 3]);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				expect(rr.map((r: any) => r.finishPosition).sort(), '등수가 1~4로 한 번씩이어야 함').toEqual([1, 2, 3, 4]);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				expect(rr.filter((r: any) => r.finishedFirst).length).toBe(1);
				for (const r of rr) {
					expect(r.seatStrategy === null, 'AI 자리만 성향이 있어야 함').toBe(r.seat === 0);
					const partner = rr.find((x: { seat: number }) => x.seat === (r.seat + 2) % 4);
					expect(r.partnerDeclared).toBe(partner.declared);
					// 스몰을 부른 자리만 선언 시점이 남는다
					expect(r.smallCardsOut !== null, `seat ${r.seat} smallCardsOut`).toBe(r.declared === 'small');
				}
			}

			// 플레이 기록: 사람 행에만, 낸 카드를 다 합치면 최소 세 명분(42장)은 나와야 한다
			for (const r of rows) {
				if (r.seat !== 0) { expect(r.plays).toBeNull(); continue; }
				const cards = (r.plays as [number, string][])
					.filter(([, x]) => /^[a-z]/.test(x)).flatMap(([, x]) => x.split(' '));
				expect(cards.length, '플레이 기록이 비어 있음').toBeGreaterThanOrEqual(42);
				expect(new Set(cards).size, '같은 카드가 두 번 기록됨').toBe(cards.length);
			}

			const row = human[0];

			expect(row.hand8?.length, '그랜드 시점 8장이 안 남음').toBe(8);
			expect(row.hand14?.length, '교환 후 14장이 안 남음').toBe(14);
			expect(['none', 'small', 'grand']).toContain(row.declared);
			expect(row.targetScore).toBe(200);
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

/**
 * 세이브/복원 회귀 테스트.
 *
 * 복원은 진행 중이던 async AI 흐름을 잃어버린다. resumeAfterRestore가 단계에 맞는
 * AI 처리를 다시 시작해주지 않으면 게임이 그대로 교착된다.
 *
 * 실제 저장은 "AI가 생각하는 도중"에 일어나므로, 각 단계에서 AI 쪽 처리가
 * 아직 안 끝난 상태를 만들어 저장한 뒤 복원한다.
 */
import { describe, it, expect } from 'vitest';
import { LocalGameEngine } from './localGameEngine';
import { AiPlayer } from './aiPlayer';
import type { GamePhase, SeatIndex } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stripDelays(e: any) {
	e.waitForBombWindow = () => Promise.resolve();
	// 0이 아닌 실제 지연을 준다. 0으로 만들면 AI 처리가 마이크로태스크 안에서 끝나버려
	// "AI가 아직 생각 중"인 상태를 관측할 수 없고, 그러면 이 테스트가 검증하려는
	// 교착 상황 자체가 재현되지 않는다.
	e.delay = () => new Promise(r => setTimeout(r, 3));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeEngine(): any {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const e = new LocalGameEngine({
		playerName: 'p0',
		partnerStrategy: 'balanced',
		aiSpeed: 'fast',
		targetScore: 200,
		onStateChange: () => {},
		onEvent: () => {}
	}) as any;
	stripDelays(e);
	return e;
}

/** 사람(0번) 자리를 AI로 대신 조작해 게임을 굴린다 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function driveSeat0(engine: any, ai0: AiPlayer) {
	const phase: GamePhase = engine.state.phase;
	const round = engine.state.round;
	if (phase === 'grand_tichu_window') {
		const p0 = engine.state.players[0];
		if (p0.grandTichu === null) {
			if (ai0.makeGrandTichuDecision(p0.hand)) engine.humanDeclareGrandTichu();
			else engine.humanPassGrandTichu();
		}
	} else if (phase === 'exchange') {
		if (!engine.exchangeSubmissions[0]) {
			engine.humanSubmitExchange(ai0.makeExchangeDecision(engine.state.players[0].hand));
		}
	} else if (phase === 'wish_declare') {
		if (round?.currentSeat === 0) {
			engine.humanSetWish(ai0.makeWishDecision(engine.state.players[0].hand, engine.createAiContext(0)));
		}
	} else if (phase === 'dragon_gift') {
		if (round?.dragonGiftSeat === 0) engine.humanGiftDragon(1 as SeatIndex);
	} else if (phase === 'playing') {
		if (round?.currentSeat === 0 && engine.state.players[0].finishOrder === null) {
			const d = ai0.makePlayDecision(engine.createAiContext(0));
			if (d === 'pass') engine.humanPass();
			else await engine.humanPlayCards(d);
		}
	}
}

interface Case {
	phase: GamePhase;
	/** 이 시점에 저장할 가치가 있는가 (AI가 행동해야 하는 상태인가) */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	ready: (e: any) => boolean;
	/** 저장 직전에 "AI가 아직 생각 중"인 상태로 되돌린다 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	pending?: (snap: any) => void;
}

const CASES: Case[] = [
	{
		phase: 'grand_tichu_window',
		ready: () => true,
		pending: snap => {
			// AI 자리의 그랜드 티츄 결정이 아직 안 끝난 상태
			for (let i = 1; i < 4; i++) {
				snap.grandTichuDecisions[i] = null;
				snap.state.players[i].grandTichu = null;
			}
		}
	},
	{
		phase: 'exchange',
		ready: () => true,
		pending: snap => {
			for (let i = 1; i < 4; i++) snap.exchangeSubmissions[i] = null;
		}
	},
	{ phase: 'playing', ready: e => e.state.round?.currentSeat !== 0 },
	{
		phase: 'wish_declare',
		ready: e => {
			const plays = e.state.round?.trick?.plays;
			return !!plays && plays[plays.length - 1]?.seat !== 0;
		}
	},
	{ phase: 'dragon_gift', ready: e => e.state.round?.dragonGiftSeat !== 0 && e.state.round?.dragonGiftSeat != null }
];

describe('티츄 세이브/복원', () => {
	for (const c of CASES) {
		it(`${c.phase}: AI 처리가 남은 상태로 저장/복원해도 진행된다`, async () => {
			const ai0 = new AiPlayer(0 as SeatIndex, 'balanced', false);
			let tested = false;

			// 소원·드래곤은 매판 나오지 않으므로 여러 판을 돌려 기회를 찾는다
			for (let game = 0; game < 12 && !tested; game++) {
				let engine = makeEngine();
				engine.startGame();
				let saved = false;
				const startRounds = 0;

				for (let i = 0; i < 4000; i++) {
					await new Promise(r => setTimeout(r, 0));
					if (engine.state.phase === 'game_end') break;

					if (!saved && engine.state.phase === c.phase && c.ready(engine)) {
						const snap = JSON.parse(JSON.stringify(engine.getSaveSnapshot()));
						expect(snap, `${c.phase} 스냅샷 실패`).not.toBeNull();
						c.pending?.(snap);
						engine.destroyed = true;
						engine = LocalGameEngine.restore(snap, () => {}, () => {});
						stripDelays(engine);
						engine.resumeAfterRestore();
						saved = true;
						tested = true;
						continue;
					}

					if (saved && engine.state.completedRounds.length > startRounds) break;
					await driveSeat0(engine, ai0);
				}

				if (tested) {
					expect(
						engine.state.completedRounds.length,
						`${c.phase} 복원 후 라운드가 끝나지 않음 — 교착`
					).toBeGreaterThan(startRounds);
				}
			}

			if (!tested) {
				// 소원·드래곤은 매판 나오지 않고, AI가 행동해야 하는 순간을 잡아야 한다.
				// 기회를 못 만들었으면 검증할 것이 없다.
				console.warn(`[skip] ${c.phase} 상황을 만들지 못함`);
			}
		}, 180000);
	}
});

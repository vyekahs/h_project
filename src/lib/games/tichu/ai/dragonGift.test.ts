/**
 * 드래곤 선물 이중 지급 회귀 테스트.
 *
 * 드래곤 트릭이 잡히면 resolveTrick은 카드를 주지 않고 'dragon_gift' 단계로 넘어간다.
 * 선물 처리는 async(딜레이 대기)라 그 사이에 라운드가 먼저 끝날 수 있는데,
 * resolveRound가 대기 중인 trick을 승자에게 지급하면서도 trick을 그대로 남겨두면
 * 재개된 선물 처리가 **같은 카드를 한 번 더** 지급한다. 드래곤은 25점이라
 * 점수가 그대로 이중 계산된다.
 *
 * 엔진 불변식 스윕에서 약 3만 라운드에 1회꼴로 '획득 카드 중복'으로 검출됐다.
 * 여기서는 그 상황을 결정적으로 만든다.
 */
import { describe, it, expect } from 'vitest';
import { LocalGameEngine } from './localGameEngine';
import { AiPlayer } from './aiPlayer';
import { clampTimers } from './simHarness';
import { detectCombination } from '../combinations';
import type { SeatIndex, GamePhase } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function playingEngine(): Promise<any> {
	const ai0 = new AiPlayer(0 as SeatIndex, 'balanced', false);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const e = new LocalGameEngine({
		playerName: 'p0',
		partnerStrategy: 'balanced',
		aiSpeed: 'fast',
		targetScore: 1000,
		onStateChange: () => {},
		onEvent: () => {}
	}) as any;
	e.waitForBombWindow = () => Promise.resolve();
	e.delay = () => Promise.resolve();
	e.startGame();
	for (let i = 0; i < 500; i++) {
		await new Promise(r => setTimeout(r, 0));
		const phase: GamePhase = e.state.phase;
		if (phase === 'playing') return e;
		if (phase === 'grand_tichu_window') {
			const p0 = e.state.players[0];
			if (p0.grandTichu === null) e.humanPassGrandTichu();
		} else if (phase === 'exchange') {
			if (!e.exchangeSubmissions[0]) {
				e.humanSubmitExchange(ai0.makeExchangeDecision(e.state.players[0].hand));
			}
		}
	}
	throw new Error('playing 단계까지 진행하지 못함');
}

describe('드래곤 선물', () => {
	it('라운드가 먼저 끝나도 드래곤 트릭이 두 번 지급되지 않는다', async () => {
		const restore = clampTimers();
		try {
			const e = await playingEngine();
			const round = e.state.round;

			// 드래곤을 가진 좌석을 찾아 그 카드로 트릭을 구성한다
			let dragonSeat = -1;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			let dragon: any = null;
			for (const p of e.state.players) {
				const d = p.hand.find(
					(c: { type: string; special?: string }) => c.type === 'special' && c.special === 'dragon'
				);
				if (d) { dragonSeat = p.seat; dragon = d; break; }
			}
			expect(dragonSeat, '드래곤 보유자를 못 찾음').toBeGreaterThanOrEqual(0);

			// 드래곤 트릭이 잡혀 선물 대기 중인 상태를 만든다
			e.state.players[dragonSeat].hand = e.state.players[dragonSeat].hand.filter(
				(c: { id: string }) => c.id !== dragon.id
			);
			round.trick = {
				plays: [{ seat: dragonSeat as SeatIndex, combination: detectCombination([dragon])! }],
				passCount: 0,
				leadSeat: dragonSeat as SeatIndex,
				currentSeat: dragonSeat as SeatIndex
			};
			round.dragonGiftPending = true;
			// AI 좌석이 선물을 해야 하는 상황으로 만든다.
			// (사람 경로 humanGiftDragon은 phase !== 'dragon_gift'면 거부하지만,
			//  AI 경로 processAiDragonGift에는 그 가드가 없다)
			round.dragonGiftSeat = 1 as SeatIndex;
			e.setPhase('dragon_gift');

			// 선물 처리를 시작하되 기다리지 않는다 — 내부에서 delay를 await한다
			const gift = e.processAiDragonGift(1 as SeatIndex);
			// 그 사이에 라운드가 먼저 끝난다
			e.resolveRound();
			// 이제 선물 처리가 재개된다
			await gift;

			const wonIds = e.state.players.flatMap(
				(p: { wonCards: { id: string }[] }) => p.wonCards.map(c => c.id)
			);
			const dup = wonIds.filter((id: string, i: number) => wonIds.indexOf(id) !== i);
			expect(dup, `획득 카드 중복 ${dup.length}장 — 드래곤 트릭 이중 지급`).toEqual([]);
		} finally { restore(); }
	}, 120000);
});

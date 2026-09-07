/**
 * 세이브 왕복 충실도 테스트.
 *
 * 저장 → JSON 직렬화 → 복원 했을 때 상태가 정말 같은가.
 * 세이브 데이터에 빠진 필드가 있으면 복원 후 조용히 다른 게임이 된다.
 */
import { describe, it, expect } from 'vitest';
import { LocalGameEngine } from './localGameEngine';
import { AiPlayer } from './aiPlayer';
import { clampTimers } from './simHarness';
import type { SeatIndex, GamePhase } from '../types';
import type { AiStrategy } from './types';

const PRESETS: AiStrategy[] = ['aggressive', 'balanced', 'defensive', 'tricky', 'wild'];

describe('세이브 왕복 충실도', () => {
	it('저장 후 복원한 상태가 원본과 같다', async () => {
		const restore = clampTimers();
		const problems: string[] = [];
		try {
			for (let g = 0; g < 30; g++) {
				const presets = [0, 1, 2, 3].map(i => PRESETS[(g + i) % PRESETS.length]) as [AiStrategy, AiStrategy, AiStrategy, AiStrategy];
				const ai0 = new AiPlayer(0 as SeatIndex, presets[0], false);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const e = new LocalGameEngine({
					playerName: 'p0', partnerStrategy: presets[2], aiSpeed: 'fast',
					targetScore: 400, onStateChange: () => {}, onEvent: () => {}
				}) as any;
				e.waitForBombWindow = () => Promise.resolve();
				e.delay = () => Promise.resolve();
				e.aiPlayers.set(1, new AiPlayer(1 as SeatIndex, presets[1], false));
				e.aiPlayers.set(2, new AiPlayer(2 as SeatIndex, presets[2], true));
				e.aiPlayers.set(3, new AiPlayer(3 as SeatIndex, presets[3], false));
				e.startGame();

				// 판 중간의 임의 시점에서 저장/복원 비교
				const at = 20 + g * 7;
				for (let i = 0; i < 4000; i++) {
					await new Promise(r => setTimeout(r, 0));
					const phase: GamePhase = e.state.phase;
					if (phase === 'game_end') break;
					if (phase === 'round_end') { e.startNextRound(); continue; }

					if (i === at) {
						const snap = e.getSaveSnapshot();
						if (snap) {
							const before = JSON.parse(JSON.stringify(e.state));
							const restored = LocalGameEngine.restore(
								JSON.parse(JSON.stringify(snap)), () => {}, () => {}
							);
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							const after = JSON.parse(JSON.stringify((restored as any).state));
							if (JSON.stringify(before) !== JSON.stringify(after)) {
								// 어떤 키가 다른지 좁힌다
								for (const k of Object.keys(before)) {
									if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
										problems.push(`복원 후 state.${k} 불일치 (phase=${phase})`);
									}
								}
							}
							// AI 성향이 보존되는가
							for (const seat of [1, 2, 3]) {
								// eslint-disable-next-line @typescript-eslint/no-explicit-any
								const orig = (e as any).aiPlayers.get(seat);
								// eslint-disable-next-line @typescript-eslint/no-explicit-any
								const re = (restored as any).aiPlayers.get(seat);
								if (orig.strategy !== re.strategy) {
									problems.push(`복원 후 ${seat}번 프리셋 바뀜: ${orig.strategy} → ${re.strategy}`);
								}
								if (JSON.stringify(orig.weights) !== JSON.stringify(re.weights)) {
									problems.push(`복원 후 ${seat}번 가중치 바뀜 (${orig.strategy})`);
								}
								if (orig.isPartner !== re.isPartner) {
									problems.push(`복원 후 ${seat}번 파트너 플래그 바뀜`);
								}
							}
						}
						break;
					}

					const round = e.state.round;
					if (phase === 'grand_tichu_window') {
						if (e.state.players[0].grandTichu === null) e.humanPassGrandTichu();
					} else if (phase === 'exchange') {
						if (!e.exchangeSubmissions[0]) e.humanSubmitExchange(ai0.makeExchangeDecision(e.state.players[0].hand));
					} else if (phase === 'wish_declare') {
						if (round?.currentSeat === 0) e.humanSetWish(ai0.makeWishDecision(e.state.players[0].hand, e.createAiContext(0)));
					} else if (phase === 'dragon_gift') {
						if (round?.dragonGiftSeat === 0) e.humanGiftDragon(1 as SeatIndex);
					} else if (phase === 'playing') {
						if (round?.currentSeat === 0 && e.state.players[0].finishOrder === null) {
							const d = ai0.makePlayDecision(e.createAiContext(0));
							if (d === 'pass') e.humanPass(); else await e.humanPlayCards(d);
						}
					}
				}
				e.destroy();
			}
		} finally { restore(); }
		const uniq = [...new Set(problems)];
		if (uniq.length) console.log('\n[세이브 왕복 불일치]\n  ' + uniq.slice(0, 10).join('\n  '));
		else console.log('\n[세이브 왕복] 이상 없음');
		expect(uniq, `세이브 왕복 불일치 ${uniq.length}종`).toEqual([]);
	}, 900000);
});

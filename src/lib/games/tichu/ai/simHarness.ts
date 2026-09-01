/**
 * AI 측정용 고속 시뮬레이션 하네스.
 *
 * 실게임 엔진을 그대로 구동하되, 사람에게 보여주기 위한 **대기 시간만** 제거해
 * 표본을 크게 늘릴 수 있게 한다. 지연 요소는 세 가지:
 *   1. AI 사고 지연  (AI_SPEED_DELAYS, 0.8~4초/수)  → engine.delay 패치
 *   2. 폭탄 윈도우   (BOMB_WINDOW_MS 5초)          → engine.waitForBombWindow 패치
 *   3. 라운드 종료   (ROUND_END_DELAY 1.5초/라운드) → 전역 setTimeout 클램프
 * 3번이 resolveRound 안의 지역 상수라 인스턴스 패치가 불가능해 전역을 클램프한다.
 *
 * 게임 로직 자체는 전혀 건드리지 않으므로 측정 결과는 실제 플레이와 동일하다.
 */
import { LocalGameEngine } from './localGameEngine';
import { AiPlayer } from './aiPlayer';
import type { GamePhase, SeatIndex, Card } from '../types';
import type { AiStrategy } from './types';

export interface SimEvent {
	type: string;
	seat?: SeatIndex;
	combo?: { cards: Card[] };
	tichuType?: string;
	targetSeat?: SeatIndex;
}

export interface SimOptions {
	/** 좌석별 프리셋 [seat0, seat1, seat2, seat3] */
	presets: [AiStrategy, AiStrategy, AiStrategy, AiStrategy];
	targetScore?: number;
	/** 이벤트 훅 — engine을 함께 받아 발생 시점의 상태를 조회할 수 있다 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	onEvent?: (e: SimEvent, engine: any) => void;
	/** 라운드 완료 시 훅 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	onRound?: (result: any, engine: any) => void;
	/** 좌석별 PresetBehavior를 가공 (절제 실험용). 반환값이 실제 사용될 behavior. */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	patchBehavior?: (seat: SeatIndex, behavior: any) => any;
}

/** AiPlayer의 behavior를 교체 (readonly라 캐스팅 필요) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function patchAi(ai: AiPlayer, seat: SeatIndex, opts: SimOptions): AiPlayer {
	if (opts.patchBehavior) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(ai as any).behavior = opts.patchBehavior(seat, (ai as any).behavior);
	}
	return ai;
}

export interface SimResult {
	completed: boolean;
	rounds: number;
	crash: string | null;
	consoleNoise: string[];
}

/**
 * Math.random을 시드 기반 결정론적 생성기로 교체. 반환된 함수로 원복.
 *
 * 티츄는 라운드 점수 편차가 매우 크다(티츄 ±100/±200, 원투 200/0). 그래서 변형 A와 B를
 * 각각 다른 딜로 돌려 평균을 비교하면 수백 라운드로도 노이즈가 효과를 덮어버린다.
 * (실측: 동일 설정을 200게임과 120게임으로 재보니 -6.4 vs -21.7로 갈렸다.)
 * 같은 시드를 주면 두 변형이 **동일한 딜 순서**를 보므로 짝지은 비교가 되어
 * 분산이 크게 줄어든다.
 */
export function seedRandom(seed: number): () => void {
	const real = Math.random;
	let s = seed >>> 0;
	Math.random = () => {
		// mulberry32
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	return () => { Math.random = real; };
}

/** 전역 setTimeout의 지연을 0으로 클램프. 반환된 함수로 원복. */
export function clampTimers(): () => void {
	const real = globalThis.setTimeout;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(globalThis as any).setTimeout = (fn: (...a: unknown[]) => void, _ms?: number, ...args: unknown[]) =>
		real(fn, 0, ...args);
	return () => { (globalThis as { setTimeout: typeof real }).setTimeout = real; };
}

/** 한 게임을 끝까지 시뮬레이션. 모든 좌석을 AI가 조종한다(seat0 = 사람 자리). */
export async function simulateGame(opts: SimOptions): Promise<SimResult> {
	const noise: string[] = [];
	const oe = console.error, ow = console.warn;
	console.error = (...a: unknown[]) => { noise.push(a.map(String).join(' ')); };
	console.warn = (...a: unknown[]) => { noise.push(a.map(String).join(' ')); };

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const engine = new LocalGameEngine({
		playerName: 'sim0',
		partnerStrategy: opts.presets[2],
		aiSpeed: 'fast',
		targetScore: opts.targetScore ?? 300,
		onStateChange: () => {},
		onEvent: (e: SimEvent) => opts.onEvent?.(e, engine)
	}) as any;

	engine.waitForBombWindow = () => Promise.resolve();
	engine.delay = () => Promise.resolve();
	engine.aiPlayers.set(1 as SeatIndex, patchAi(new AiPlayer(1 as SeatIndex, opts.presets[1], false), 1 as SeatIndex, opts));
	engine.aiPlayers.set(2 as SeatIndex, patchAi(new AiPlayer(2 as SeatIndex, opts.presets[2], true), 2 as SeatIndex, opts));
	engine.aiPlayers.set(3 as SeatIndex, patchAi(new AiPlayer(3 as SeatIndex, opts.presets[3], false), 3 as SeatIndex, opts));
	const ai0 = patchAi(new AiPlayer(0 as SeatIndex, opts.presets[0], false), 0 as SeatIndex, opts);

	let crash: string | null = null;
	let iter = 0;
	let lastRc = 0;
	try {
		engine.startGame();
		while (iter++ < 40000) {
			await new Promise(r => setTimeout(r, 0));

			const rc = engine.state.completedRounds.length;
			if (rc > lastRc) {
				for (let i = lastRc; i < rc; i++) opts.onRound?.(engine.state.completedRounds[i], engine);
				lastRc = rc;
			}

			const phase: GamePhase = engine.state.phase;
			if (phase === 'game_end') break;

			if (phase === 'grand_tichu_window') {
				const p0 = engine.state.players[0];
				if (p0.grandTichu === null) {
					if (ai0.makeGrandTichuDecision(p0.hand)) engine.humanDeclareGrandTichu();
					else engine.humanPassGrandTichu();
				}
				continue;
			}
			if (phase === 'exchange') {
				if (!engine.exchangeSubmissions[0]) {
					const p0 = engine.state.players[0];
					const partner = engine.state.players[2];
					engine.humanSubmitExchange(ai0.makeExchangeDecision(
						p0.hand, partner.grandTichu === true || partner.smallTichu === true));
				}
				continue;
			}
			if (phase === 'playing') {
				const round = engine.state.round;
				if (round && round.currentSeat === 0 && engine.state.players[0].finishOrder === null) {
					const p0 = engine.state.players[0];
					// 사람 자리도 규칙과 동일하게 첫 카드 전까지 매 차례 스몰 티츄 판단
					if (!p0.hasPlayedFirstCard && !p0.smallTichu && !p0.grandTichu &&
						ai0.makeSmallTichuDecision(p0.hand, engine.createAiContext(0))) {
						engine.humanDeclareSmallTichu();
						opts.onEvent?.({ type: 'tichu_declare', seat: 0 as SeatIndex, tichuType: 'small' }, engine);
					}
					const d = ai0.makePlayDecision(engine.createAiContext(0));
					if (d === 'pass') engine.humanPass();
					else await engine.humanPlayCards(d);
				}
				continue;
			}
			if (phase === 'wish_declare') {
				const round = engine.state.round;
				if (round && round.currentSeat === 0) {
					engine.humanSetWish(ai0.makeWishDecision(engine.state.players[0].hand, engine.createAiContext(0)));
				}
				continue;
			}
			if (phase === 'dragon_gift') {
				const round = engine.state.round;
				if (round && round.dragonGiftSeat === 0) {
					engine.humanGiftDragon(ai0.makeDragonGiftDecision(engine.createAiContext(0)));
				}
				continue;
			}
			if (phase === 'round_end') { engine.startNextRound(); continue; }
		}
	} catch (e) {
		crash = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
	} finally {
		console.error = oe;
		console.warn = ow;
		engine.destroy?.();
	}

	return {
		completed: engine.state.phase === 'game_end',
		rounds: engine.state.completedRounds.length,
		crash,
		consoleNoise: noise
	};
}

/** 여러 게임을 동시에 굴려 타이머 대기 시간을 겹친다(CPU 작업은 여전히 직렬). */
export async function simulateBatch(opts: SimOptions, games: number, concurrency = 8): Promise<SimResult[]> {
	const out: SimResult[] = [];
	for (let i = 0; i < games; i += concurrency) {
		const batch = Math.min(concurrency, games - i);
		const rs = await Promise.all(Array.from({ length: batch }, () => simulateGame(opts)));
		out.push(...rs);
	}
	return out;
}

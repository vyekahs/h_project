/**
 * 티츄 선언 판단 기록 수집.
 *
 * AI의 선언 기준은 지금 온라인 티츄 사이트 플레이어 6명의 누적 기록에 맞춰
 * 잡혀 있다. 그런데 그 사람들은 실력이 제각각인 온라인 상대와 붙었고 우리 AI는
 * 우리 AI를 상대한다. 조건이 달라서 비교가 얼마나 정확한지 알 수 없다.
 * 우리 플레이어의 기록은 **AI와 정확히 같은 상대·같은 규칙**이라 그 결함이 없다.
 *
 * 선언한 판만이 아니라 매 라운드를 남긴다. "이 손패에서 안 불렀다"도 기준을
 * 배우는 데 똑같이 중요해서, 선언율이 12%라면 8배 빨리 쌓인다.
 *
 * 사람(0번 자리)만이 아니라 AI 세 자리도 같은 특징값으로 남긴다. 첫 수집분을 보니
 * 사람은 AI가 "가망 없다"고 본 손패로도 절반을 1등으로 나갔다 — 선언 기준의 차이가
 * 아니라 플레이 실력 차이가 결과를 지배한다는 뜻이다. 같은 라운드의 AI 기록이
 * 나란히 있어야 "같은 손패 품질에서 사람과 AI의 결과가 얼마나 다른가"를 볼 수 있다.
 */
import { calcExitRate } from '$lib/games/tichu/ai/playSearchGrid';
import { buildCardTracker, comboLikelyToWin } from '$lib/games/tichu/ai/cardTracker';
import {
	evaluateHandStrength,
	findOptimalPartition,
	findAllPlayableCombinations
} from '$lib/games/tichu/ai/handEvaluator';
import { estimateGoOutFirstProb } from '$lib/games/tichu/ai/monteCarlo';
import { isBomb } from '$lib/games/tichu/combinations';
import { getPartnerSeat, getTeam } from '$lib/games/tichu/constants';
import type { GameEvent } from '$lib/games/tichu/ai/localGameEngine';
import type { Card, GamePhase, TichuRoomState, TichuRoundResult } from '$lib/games/tichu/types';

type Declared = 'none' | 'small' | 'grand';

export interface DecisionRow {
	roundNumber: number;
	/** 0 = 사람, 1·3 = 상대 AI, 2 = 파트너 AI */
	seat: number;
	/** 그 자리의 AI 성향. 사람이면 null */
	seatStrategy: string | null;
	pureWinRate: number | null;
	exitRate: number | null;
	minTurns: number | null;
	leadCombos: number | null;
	handStrength: number | null;
	raceProb: number | null;
	declared: Declared;
	/**
	 * 스몰 티츄를 부른 순간까지 그 라운드에 나온 카드 수 (0 = 아무도 내기 전).
	 * 특징값은 플레이 시작 시점 기준이라, 판을 보다가 부른 선언은 따로 가려야 한다.
	 */
	smallCardsOut: number | null;
	/** 같은 라운드에 파트너 / 상대 팀이 부른 가장 큰 선언 */
	partnerDeclared: Declared;
	oppDeclared: Declared;
	finishedFirst: boolean;
	/** 1~4등. 1등을 놓쳤을 때 "아깝게 2등"과 "꼴찌"를 구분한다 */
	finishPosition: number | null;
	/** 이 자리가 속한 팀의 라운드 점수 */
	teamScore: number | null;
	hand8: string[] | null;
	hand14: string[] | null;
	partnerStrategy: string | null;
	/** 300점 게임과 1000점 게임은 그랜드 한 번의 무게가 달라 선언 기준도 다르다 */
	targetScore: number | null;
	/**
	 * 그 라운드의 플레이 순서 — 사람 행(seat 0)에만 싣는다. [자리, 내용] 의 배열.
	 *   "sword_14 jade_14" 낸 카드 / "P" 패스 / "W" 트릭 획득 / "D>2" 개로 2번에게 선 /
	 *   "G>1" 용 트릭을 1번에게 줌 / "T:small" 선언
	 *
	 * 시뮬레이션에서는 AI가 사람 자리를 대신 쳐도 무조건 그랜드 성공률이 37%인데
	 * 실제 사람은 70%를 넘긴다. AI끼리 돌려서는 그 차이가 어디서 나는지 볼 수 없어서
	 * 사람이 실제로 어떻게 쳤는지를 남긴다.
	 */
	plays: [number, string][] | null;
}

/** 라운드 진행 중 자리별로 모아두는 임시 상태 */
interface PendingSeat {
	hand8: string[] | null;
	hand14: string[] | null;
	features: Partial<DecisionRow>;
	smallCardsOut: number | null;
}
interface Pending {
	roundNumber: number;
	seats: PendingSeat[];
	plays: [number, string][];
}

/** 서버가 한 번에 받는 행 수 (한 라운드 = 4행) */
const MAX_ROWS = 40;
const TOTAL_CARDS = 56;
/** 한 라운드 플레이 기록 상한 — 정상 라운드는 100을 넘지 않는다 */
const MAX_PLAYS = 300;

let pending: Pending | null = null;
let buffer: DecisionRow[] = [];

export function resetDecisionLog() {
	pending = null;
	buffer = [];
}

function ensurePending(roundNumber: number): Pending {
	if (!pending || pending.roundNumber !== roundNumber) {
		pending = {
			roundNumber,
			seats: [0, 1, 2, 3].map(() => ({ hand8: null, hand14: null, features: {}, smallCardsOut: null })),
			plays: []
		};
	}
	return pending;
}

/** 그랜드 티츄 판단 시점(8장) */
export function noteGrandTichuHand(roundNumber: number, seat: number, hand: Card[]) {
	ensurePending(roundNumber).seats[seat].hand8 = hand.map(c => c.id);
}

/**
 * 플레이 시작 시점(교환 후 14장) — 스몰 티츄 판단의 기준 시점이다.
 * AI가 쓰는 것과 같은 축의 특징값을 함께 계산해 둔다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function noteHandAtPlayStart(roundNumber: number, seat: number, hand: Card[], engine: any) {
	const p = ensurePending(roundNumber).seats[seat];
	p.hand14 = hand.map(c => c.id);
	try {
		const context = engine.createAiContext(seat);
		const tracker = buildCardTracker(context);
		const exit = calcExitRate(hand, tracker);
		const nonBomb = findAllPlayableCombinations(hand).filter(c => !isBomb(c));
		const part = findOptimalPartition(hand, nonBomb);
		let leads = 0;
		for (const c of part.combos) {
			if (comboLikelyToWin(c, tracker, hand) >= 0.6) leads++;
		}
		p.features = {
			pureWinRate: exit.pureWinRate,
			exitRate: exit.rate,
			minTurns: part.turns,
			leadCombos: leads,
			handStrength: evaluateHandStrength(hand),
			raceProb: estimateGoOutFirstProb(context, 24)
		};
	} catch {
		// 특징값 계산이 실패해도 원본 손패는 남긴다
	}
}

function declaredOf(r: TichuRoundResult, seat: number): Declared {
	return r.grandTichuDeclarations.some(d => d.seat === seat) ? 'grand'
		: r.smallTichuDeclarations.some(d => d.seat === seat) ? 'small'
		: 'none';
}

function strongest(a: Declared, b: Declared): Declared {
	return a === 'grand' || b === 'grand' ? 'grand' : a === 'small' || b === 'small' ? 'small' : 'none';
}

/**
 * 라운드가 끝났을 때 실제 판단과 결과를 확정한다.
 *
 * 손패를 본 적 없는 라운드(이어하기로 중간에 들어온 경우)는 남기지 않는다.
 * 손패가 없으면 선언 기준을 배우는 데 쓸 수 없고, 이어하기가 round_end에서
 * 복원될 때 이미 보낸 라운드를 한 번 더 보내는 것도 이걸로 막힌다.
 */
export function commitRound(
	r: TichuRoundResult,
	seatStrategies: (string | null)[],
	partnerStrategy: string,
	targetScore: number
) {
	if (!pending || pending.roundNumber !== r.roundNumber) return;
	for (let seat = 0; seat < 4; seat++) {
		const p = pending.seats[seat];
		if (!p.hand14) continue;
		const pos = r.finishOrder.indexOf(seat as 0 | 1 | 2 | 3);
		const opps = [0, 1, 2, 3].filter(s => getTeam(s) !== getTeam(seat));
		const declared = declaredOf(r, seat);
		buffer.push({
			roundNumber: r.roundNumber,
			seat,
			seatStrategy: seatStrategies[seat] ?? null,
			pureWinRate: p.features.pureWinRate ?? null,
			exitRate: p.features.exitRate ?? null,
			minTurns: p.features.minTurns ?? null,
			leadCombos: p.features.leadCombos ?? null,
			handStrength: p.features.handStrength ?? null,
			raceProb: p.features.raceProb ?? null,
			declared,
			smallCardsOut: declared === 'small' ? p.smallCardsOut : null,
			partnerDeclared: declaredOf(r, getPartnerSeat(seat)),
			oppDeclared: strongest(declaredOf(r, opps[0]), declaredOf(r, opps[1])),
			finishedFirst: pos === 0,
			finishPosition: pos >= 0 ? pos + 1 : null,
			teamScore: getTeam(seat) === getTeam(0) ? r.teamAScore : r.teamBScore,
			hand8: p.hand8,
			hand14: p.hand14,
			partnerStrategy,
			targetScore,
			plays: seat === 0 ? pending.plays : null
		});
	}
	pending = null;
}

/** 엔진 이벤트를 플레이 기록에 쌓는다 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function observeEvent(event: GameEvent, engine: any) {
	const roundNumber: number | undefined = engine?.state?.round?.roundNumber;
	if (!pending || pending.roundNumber !== roundNumber || pending.plays.length >= MAX_PLAYS) return;
	const entry =
		event.type === 'play' || event.type === 'bomb' ? event.combo.cards.map(c => c.id).join(' ')
		: event.type === 'pass' ? 'P'
		: event.type === 'trick_won' ? 'W'
		: event.type === 'dog' ? `D>${event.targetSeat}`
		: event.type === 'dragon_gift' ? `G>${event.targetSeat}`
		: `T:${event.tichuType}`;
	pending.plays.push([event.seat, entry]);
}

/**
 * 상태가 바뀔 때마다 부른다 — 스몰 티츄가 "언제" 불렸는지 잡기 위한 것.
 * 선언은 phase를 바꾸지 않으므로 observePhase로는 보이지 않는다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function observeState(engine: any) {
	const s: TichuRoomState | null = engine?.state ?? null;
	if (!s?.round || !pending || pending.roundNumber !== s.round.roundNumber) return;
	for (const player of s.players) {
		const p = pending.seats[player.seat];
		if (player.smallTichu && p.smallCardsOut === null) {
			const inHands = s.players.reduce((n, pl) => n + pl.hand.length, 0);
			p.smallCardsOut = Math.max(0, TOTAL_CARDS - inHands);
		}
	}
}

/**
 * phase 전환을 보고 기록을 진행한다. 화면(gameState)과 테스트가 같은 경로를 타도록
 * 판단을 여기 모아 둔다.
 *
 * 승부가 갈리는 라운드는 round_end를 거치지 않고 곧장 game_end로 간다.
 * round_end만 보면 모든 게임의 마지막 라운드가 빠지고, 1라운드 만에 끝난 게임은
 * 통째로 사라진다 (2026-09-19 이전 수집분이 그렇게 빠져 있다).
 *
 * 전송은 라운드마다 한다. 게임 끝에 몰아 보내면 중간에 그만둔 게임 — 선언이
 * 실패해서 그만둔 게임일수록 — 이 빠져 성공률이 부풀려진다.
 */
export function observePhase(
	phase: GamePhase,
	prevPhase: GamePhase | null,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	engine: any,
	partnerStrategy: string
) {
	const s: TichuRoomState | null = engine?.state ?? null;
	if (!s) return;

	if (phase === 'grand_tichu_window' && s.round) {
		for (const pl of s.players) noteGrandTichuHand(s.round.roundNumber, pl.seat, pl.hand);
	} else if (phase === 'playing' && prevPhase === 'exchange' && s.round) {
		for (const pl of s.players) noteHandAtPlayStart(s.round.roundNumber, pl.seat, pl.hand, engine);
	} else if (phase === 'round_end' || phase === 'game_end') {
		const r = s.completedRounds[s.completedRounds.length - 1];
		if (!r) return;
		const seatStrategies = [0, 1, 2, 3].map(
			seat => (engine.aiPlayers?.get(seat)?.strategy as string | undefined) ?? null
		);
		commitRound(r, seatStrategies, partnerStrategy, s.config.targetScore);
		void flushDecisionLog();
	}
}

/**
 * 쌓인 라운드를 보낸다.
 * 실패해도 게임 진행에는 영향이 없어야 하므로 조용히 넘어간다.
 * 네트워크 오류면 다음 라운드 때 함께 다시 보낸다.
 */
export async function flushDecisionLog() {
	if (buffer.length === 0) return;
	const rounds = buffer.slice(0, MAX_ROWS);
	buffer = buffer.slice(MAX_ROWS);
	try {
		await fetch('/api/tichu/decision', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ rounds }),
			// 마지막 라운드 직후 창을 닫아도 전송이 끝까지 가도록
			keepalive: true
		});
	} catch {
		buffer = [...rounds, ...buffer].slice(0, MAX_ROWS);
	}
}

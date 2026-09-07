/**
 * 엔진 불변식 테스트.
 *
 * 게임을 수천 판 돌리면서 매 상태 변화마다 "절대 깨지면 안 되는 것"을 확인한다.
 * 점수 측정(AI가 얼마나 잘 두나)으로는 절대 드러나지 않는 종류의 버그를 잡는다.
 */
import { describe, it, expect } from 'vitest';
import { LocalGameEngine } from './localGameEngine';
import { AiPlayer } from './aiPlayer';
import { clampTimers } from './simHarness';
import type { AiStrategy } from './types';
import type { GamePhase, SeatIndex, TichuRoundResult } from '../types';
import { getTeam, createAllCards } from '../constants';

const ALL_IDS = createAllCards().map(c => c.id);

const GAMES = Number(process.env.TICHU_INV_GAMES ?? 24);
const TARGET = Number(process.env.TICHU_INV_TARGET ?? 500);

const PRESETS: AiStrategy[] = ['aggressive', 'balanced', 'defensive', 'tricky', 'wild'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkState(e: any, problems: string[]) {
	const st = e.state;
	const round = st.round;
	if (!round) return;

	// --- 카드 보존 ---
	// 트릭 카드는 트릭이 끝나면 wonCards로 들어가지만, 엔진은 "UI에서 마지막 플레이가
	// 보이도록" trick을 그대로 남겨둔다. 그래서 trick과 wonCards가 겹치는 건 정상이다.
	// 진짜 불변식은 (1) 손패와 획득 카드가 겹치지 않는다 (2) 전체 합집합이 56장이다.
	const handIds = st.players.flatMap((p: { hand: { id: string }[] }) => p.hand.map(c => c.id));
	const wonIds = st.players.flatMap((p: { wonCards?: { id: string }[] }) => (p.wonCards ?? []).map(c => c.id));
	const trickIds = (round.trick?.plays ?? []).flatMap(
		(pl: { combination: { cards: { id: string }[] } }) => pl.combination.cards.map(c => c.id)
	);
	if (new Set(handIds).size !== handIds.length) problems.push('손패에 중복 카드');
	if (new Set(wonIds).size !== wonIds.length) {
		const seen = new Set<string>(); const dup = new Set<string>();
		for (const id of wonIds) { if (seen.has(id)) dup.add(id); seen.add(id); }
		const deck = createAllCards();
		const desc = [...dup].map(id => {
			const c = deck.find(x => x.id === id)!;
			const holders = st.players
				.filter((p: { wonCards?: { id: string }[] }) => (p.wonCards ?? []).some(x => x.id === id))
				.map((p: { seat: number }) => p.seat);
			const cnt = st.players.reduce((n: number, p: { wonCards?: { id: string }[] }) =>
				n + (p.wonCards ?? []).filter(x => x.id === id).length, 0);
			return `${c.type === 'special' ? c.special : (c as { rank: number }).rank}@좌석[${holders.join('/')}]x${cnt}`;
		});
		problems.push(`획득 카드 중복: ${desc.join(' ')} · phase=${st.phase} · 드래곤선물대기=${round.dragonGiftPending}`);
	}
	const wonSet = new Set(wonIds);
	if (handIds.some((id: string) => wonSet.has(id))) problems.push('손패와 획득 카드가 겹침');
	// 아래는 라운드가 진행 중일 때만 성립한다.
	// (배분 단계는 8장씩 32장, 교환 단계는 카드가 이동 중이라 총량이 일시적으로 어긋난다)
	// 라운드 종료 시 엔진은 남은 플레이어 전원에게 손패를 비우지 않은 채 완주 순위를
	// 부여한다("Auto-finish remaining"). 그건 설계상 정상이다.
	if (st.phase !== 'playing') return;

	// --- 카드 총량 ---
	const all = new Set([...handIds, ...wonIds, ...trickIds]);
	// 개는 규칙상 트릭을 만들지 않고 옆으로 치운다 — 낸 뒤에는 어디에도 없는 것이 정상.
	// 그 외의 카드가 사라지면 버그다.
	const missing = ALL_IDS.filter(id => !all.has(id));
	const deck = createAllCards();
	const notDog = missing.filter(id => {
		const c = deck.find(x => x.id === id)!;
		return !(c.type === 'special' && c.special === 'dog');
	});
	if (notDog.length > 0) {
		const info = notDog.map(id => {
			const c = deck.find(x => x.id === id)!;
			return c.type === 'special' ? c.special : `${(c as { rank: number }).rank}`;
		});
		problems.push(`카드 분실: ${info.join(',')} (총 ${all.size}장)`);
	}

	// --- 나간 플레이어는 손패가 비어 있어야 한다 ---
	for (const p of st.players) {
		if (p.finishOrder !== null && p.hand.length > 0) {
			problems.push(`${p.seat}번은 나갔는데 손패 ${p.hand.length}장`);
		}
	}

	// --- 완주 순서에 중복이 없어야 한다 ---
	if (new Set(round.finishOrder).size !== round.finishOrder.length) {
		problems.push(`완주 순서 중복: ${round.finishOrder.join(',')}`);
	}

	// --- 현재 차례는 아직 안 나간 사람이어야 한다 ---
	if (st.players[round.currentSeat]?.finishOrder !== null) {
		problems.push(`이미 나간 ${round.currentSeat}번에게 차례가 감`);
	}

	// --- 트릭의 각 수는 앞선 수를 실제로 이겨야 한다 ---
	const plays = round.trick?.plays ?? [];
	for (let i = 1; i < plays.length; i++) {
		const prev = plays[i - 1].combination;
		const cur = plays[i].combination;
		// 개는 트릭을 즉시 넘기므로 비교 대상이 아니다
		const isDog = (c: { cards: { type: string; special?: string }[] }) =>
			c.cards.length === 1 && c.cards[0].type === 'special' && c.cards[0].special === 'dog';
		if (isDog(prev) || isDog(cur)) continue;
		if (cur.rank <= prev.rank && cur.type === prev.type && cur.length === prev.length) {
			problems.push(`트릭 순서 이상: ${prev.type}(${prev.rank}) 위에 ${cur.type}(${cur.rank})`);
		}
	}
}

function checkRound(r: TichuRoundResult, problems: string[]) {
	// --- 라운드 점수 합 ---
	// 카드 점수 총합은 100점. 원투면 카드 점수 대신 200점.
	// 티츄 성공/실패로 ±100(스몰) ±200(그랜드)이 더해진다.
	let bonus = 0;
	for (const d of r.grandTichuDeclarations) bonus += d.success ? 200 : -200;
	for (const d of r.smallTichuDeclarations) bonus += d.success ? 100 : -100;
	const base = r.oneTwo ? 200 : 100;
	const total = r.teamAScore + r.teamBScore;
	if (total !== base + bonus) {
		problems.push(
			`점수 합 이상: A ${r.teamAScore} + B ${r.teamBScore} = ${total}, ` +
			`기대 ${base + bonus} (기본 ${base} + 티츄 ${bonus}, 원투=${r.oneTwo})`
		);
	}

	// --- 완주 순서 ---
	if (r.finishOrder.length < 3) {
		problems.push(`완주 순서가 ${r.finishOrder.length}명뿐`);
	}
	if (new Set(r.finishOrder).size !== r.finishOrder.length) {
		problems.push(`완주 순서 중복: ${r.finishOrder.join(',')}`);
	}

	// --- 원투 판정 ---
	if (r.finishOrder.length >= 2) {
		const isOneTwo = getTeam(r.finishOrder[0]) === getTeam(r.finishOrder[1]);
		const claimed = r.oneTwo !== null;
		if (isOneTwo !== claimed) {
			problems.push(`원투 판정 불일치: 실제 ${isOneTwo}, 기록 ${claimed} (${r.finishOrder.join(',')})`);
		}
	}

	// --- 티츄 성공 판정: 1등으로 나간 사람만 성공이어야 한다 ---
	const first = r.finishOrder[0];
	for (const d of [...r.grandTichuDeclarations, ...r.smallTichuDeclarations]) {
		const shouldSucceed = d.seat === first;
		if (d.success !== shouldSucceed) {
			problems.push(`티츄 성공 판정 이상: ${d.seat}번 success=${d.success}, 1등=${first}`);
		}
	}
}

/** 한 판을 끝까지 돌리며 안정 시점마다 불변식을 검사한다 */
async function runOneGame(gameIdx: number, problems: string[]): Promise<number> {
	const presets = [0, 1, 2, 3].map(
		i => PRESETS[(gameIdx + i) % PRESETS.length]
	) as [AiStrategy, AiStrategy, AiStrategy, AiStrategy];
	const ai0 = new AiPlayer(0 as SeatIndex, presets[0], false);

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const engine = new LocalGameEngine({
		playerName: 'p0',
		partnerStrategy: presets[2],
		aiSpeed: 'fast',
		targetScore: TARGET,
		onStateChange: () => {},
		onEvent: () => {}
	}) as any;
	engine.waitForBombWindow = () => Promise.resolve();
	engine.delay = () => Promise.resolve();
	engine.aiPlayers.set(1, new AiPlayer(1 as SeatIndex, presets[1], false));
	engine.aiPlayers.set(2, new AiPlayer(2 as SeatIndex, presets[2], true));
	engine.aiPlayers.set(3, new AiPlayer(3 as SeatIndex, presets[3], false));

	let seen = 0;
	let rounds = 0;
	engine.startGame();
	for (let i = 0; i < 30000; i++) {
		await new Promise(r => setTimeout(r, 0));
		// 모든 동기 변경이 끝난 시점(매크로태스크 경계)에서만 검사한다.
		// onStateChange는 변경 도중에도 불리므로 순간적으로 어긋난 상태를 본다.
		checkState(engine, problems);

		const rc = engine.state.completedRounds.length;
		while (seen < rc) { checkRound(engine.state.completedRounds[seen], problems); seen++; rounds++; }
		const phase: GamePhase = engine.state.phase;
		if (phase === 'game_end') break;
		if (problems.length >= 8) break;
		// 라운드가 끝나면 다음 라운드를 시작한다.
		// (이걸 빼먹어서 판마다 1라운드만 검사되고 있었다)
		if (phase === 'round_end') { engine.startNextRound(); continue; }

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
	engine.destroy();
	return rounds;
}

describe('엔진 불변식', () => {
	it('여러 판을 돌려도 상태·점수 불변식이 깨지지 않는다', async () => {
		const restore = clampTimers();
		const problems: string[] = [];
		let rounds = 0;
		try {
			// 게임을 병렬로 돌린다 — 순차로 돌리면 매크로태스크 대기가 병목이다
			for (let g = 0; g < GAMES; g += 8) {
				const batch = [];
				for (let k = 0; k < 8 && g + k < GAMES; k++) batch.push(runOneGame(g + k, problems));
				for (const n of await Promise.all(batch)) rounds += n;
				if (problems.length >= 8) break;
			}
		} finally { restore(); }

		const uniq = [...new Set(problems)];
		if (uniq.length > 0) console.log(`\n[불변식 위반] ${rounds}라운드 중\n  ` + uniq.slice(0, 8).join('\n  '));
		else console.log(`\n[불변식] ${rounds}라운드 이상 없음`);
		expect(uniq, `불변식 위반 ${uniq.length}종`).toEqual([]);
	}, 3000000);
});

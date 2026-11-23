/**
 * 캐릭터 습관 — 사람 기록에서 뽑은 조건 조합대로 폭탄·개를 내는지 확인한다.
 *
 * 기록에서 사람은 "상대가 곧 나간다" 또는 "내가 곧 나간다"가 걸릴 때만 폭탄을 썼다.
 * 예전 AI는 별일 없는 트릭에서도 터뜨렸고(아랭 49%, 사람 12%), 점수만 보고도
 * 터뜨렸다(아랭 70%, 사람 15%). 반대로 아랭·라미가 쓰는 "내 카드 위에 마지막 폭탄을
 * 얹어 바로 나가기"는 엔진이 막고 있어 할 수 없었다.
 */
import { describe, it, expect } from 'vitest';
import { shouldPlayBomb } from './strategy';
import { getWeightsForStrategy, getBehaviorForStrategy } from './presets';
import { decideDogLead, decideOwnTrickBomb } from './habits';
import { LocalGameEngine } from './localGameEngine';
import { AiPlayer } from './aiPlayer';
import { clampTimers } from './simHarness';
import { createAllCards } from '../constants';
import { detectCombination } from '../combinations';
import type { Card, GamePhase, SeatIndex, TichuPlayer } from '../types';
import type { AiDecisionContext, AiStrategy } from './types';

const DECK = createAllCards();
const card = (id: string): Card => {
	const found = DECK.find(x => x.id === id);
	if (!found) throw new Error(`없는 카드 ${id}`);
	return found;
};
const cards = (ids: string) => ids.split(' ').map(card);
const ALL: AiStrategy[] = ['aggressive', 'tricky', 'balanced', 'wild', 'defensive'];
const BOMB_5 = 'jade_5 sword_5 pagoda_5 star_5';

/** 1번 자리(상대)가 낸 카드 위에서 0번 자리가 폭탄을 낼지 묻는 장면 */
function scene(opts: { myHand: string; oppPlay: string; oppLeft: number; earlier?: string; myDeclared?: boolean }) {
	const filler = DECK.filter(c => c.type === 'normal' && c.rank <= 4);
	const players: TichuPlayer[] = [0, 1, 2, 3].map(seat => ({
		userId: seat, name: `p${seat}`, seat: seat as SeatIndex, team: seat % 2 === 0 ? 'A' : 'B',
		hand: seat === 0 ? cards(opts.myHand) : filler.slice(seat * 3, seat * 3 + (seat === 1 ? opts.oppLeft : 9)),
		wonCards: [], grandTichu: null, smallTichu: seat === 0 && !!opts.myDeclared,
		hasPlayedFirstCard: true, finishOrder: null, connected: true
	}));
	const plays = [
		...(opts.earlier ? [{ seat: 3 as SeatIndex, combination: detectCombination(cards(opts.earlier))! }] : []),
		{ seat: 1 as SeatIndex, combination: detectCombination(cards(opts.oppPlay))! }
	];
	const context: AiDecisionContext = {
		hand: players[0].hand,
		trick: { plays, passCount: 0, leadSeat: plays[0].seat, currentSeat: 2 as SeatIndex },
		wish: { active: false, requestedRank: null, requestedBy: null },
		currentSeat: 0 as SeatIndex, players, finishOrder: [], finishedCount: 0,
		cumulativeScoreA: 0, cumulativeScoreB: 0, completedRounds: [], roundNumber: 1
	};
	return { context, lastPlay: plays[plays.length - 1] };
}
const bombs = (who: AiStrategy, s: ReturnType<typeof scene>) =>
	shouldPlayBomb(s.context, getWeightsForStrategy(who), s.lastPlay, getBehaviorForStrategy(who)) !== null;

describe('폭탄을 내는 조건', () => {
	// 손패 9장, 폭탄을 내도 3턴 이상 남는다
	const BUSY = `${BOMB_5} jade_7 sword_9 pagoda_11 star_13 jade_14`;

	it('별일 없는 트릭에서는 아무도 폭탄을 안 낸다', () => {
		for (const who of ALL) {
			expect(bombs(who, scene({ myHand: BUSY, oppPlay: 'jade_12', oppLeft: 9 })), who).toBe(false);
		}
	});

	it('점수만 보고 터뜨리는 건 라미뿐이다 (용이 깔린 25점 이상 트릭)', () => {
		for (const who of ALL) {
			const s = scene({ myHand: BUSY, oppPlay: 'dragon', oppLeft: 9, earlier: 'star_10' });
			expect(bombs(who, s), who).toBe(who === 'wild');
		}
	});

	it('그 상대가 5장 이하이고 15점 이상이면 모두 낸다', () => {
		for (const who of ALL) {
			const s = scene({ myHand: BUSY, oppPlay: 'jade_13 sword_13', oppLeft: 4 });
			expect(bombs(who, s), who).toBe(true);
		}
	});

	it('그 상대가 2장 이하면 점수와 상관없이 막는다', () => {
		for (const who of ALL) {
			expect(bombs(who, scene({ myHand: BUSY, oppPlay: 'jade_6', oppLeft: 2 })), who).toBe(true);
		}
	});

	it('폭탄을 내면 0~1턴에 나갈 때는 낸다', () => {
		for (const who of ALL) {
			// 폭탄 뒤 Q 페어 하나만 남는다
			const s = scene({ myHand: `${BOMB_5} jade_12 sword_12`, oppPlay: 'jade_9', oppLeft: 9 });
			expect(bombs(who, s), who).toBe(true);
		}
	});

	it('폭탄을 내도 여러 턴이 남으면, 손패가 적어도 안 낸다', () => {
		for (const who of ALL) {
			// 폭탄 뒤 3·8·J 세 턴이 남는다 — 예전에는 아랭·메모가 "4턴 이내"라며 터뜨렸다
			const s = scene({ myHand: `${BOMB_5} jade_3 sword_8 pagoda_11`, oppPlay: 'jade_9', oppLeft: 9 });
			expect(bombs(who, s), who).toBe(false);
		}
	});
});

describe('내 카드 위에 폭탄을 얹어 나가기', () => {
	it('폭탄이 마지막 장들일 때 아랭·라미만 한다', () => {
		for (const who of ALL) {
			const got = decideOwnTrickBomb(cards(BOMB_5), getBehaviorForStrategy(who).habits!);
			expect(got !== null, who).toBe(who === 'aggressive' || who === 'wild');
		}
	});

	it('폭탄 말고 카드가 남으면 안 한다', () => {
		expect(decideOwnTrickBomb(cards(`${BOMB_5} jade_13`), getBehaviorForStrategy('aggressive').habits!)).toBeNull();
	});

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async function playingEngine(): Promise<any> {
		const ai0 = new AiPlayer(0 as SeatIndex, 'balanced', false);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const e = new LocalGameEngine({
			playerName: 'p0', partnerStrategy: 'balanced', aiSpeed: 'fast', targetScore: 1000,
			onStateChange: () => {}, onEvent: () => {}
		}) as any;
		e.waitForBombWindow = () => Promise.resolve();
		e.delay = () => Promise.resolve();
		e.startGame();
		for (let i = 0; i < 500; i++) {
			await new Promise(r => setTimeout(r, 0));
			const phase: GamePhase = e.state.phase;
			if (phase === 'playing') return e;
			if (phase === 'grand_tichu_window') {
				if (e.state.players[0].grandTichu === null) e.humanPassGrandTichu();
			} else if (phase === 'exchange') {
				if (!e.exchangeSubmissions[0]) e.humanSubmitExchange(ai0.makeExchangeDecision(e.state.players[0].hand));
			}
		}
		throw new Error('playing 단계까지 진행하지 못함');
	}

	for (const [who, expected] of [['aggressive', true], ['tricky', false]] as [AiStrategy, boolean][]) {
		it(`엔진: K를 내고 남은 4장이 폭탄이면 ${expected ? '바로 얹고 나간다' : '기다린다'} (${who})`, async () => {
			const restore = clampTimers();
			try {
				const e = await playingEngine();
				e._paused = true; // 진행 중이던 AI 차례가 끼어들지 않게
				await new Promise(r => setTimeout(r, 0));
				e.aiPlayers.set(1, new AiPlayer(1 as SeatIndex, who, false));
				const round = e.state.round;
				const king = detectCombination([card('jade_13')])!;
				for (const p of e.state.players) p.hand = p.hand.filter((c: Card) => !BOMB_5.includes(c.id) && c.id !== 'jade_13');
				e.state.players[1].hand = cards(BOMB_5);
				round.trick = { plays: [{ seat: 1, combination: king }], passCount: 0, leadSeat: 1, currentSeat: 1 };
				const bombed = await e.checkAiBombInterrupts(1, king);
				expect(bombed).toBe(expected);
				expect(e.state.players[1].hand.length).toBe(expected ? 0 : 4);
				expect(e.state.players[1].finishOrder !== null).toBe(expected);
			} finally {
				restore();
			}
		});
	}
});

describe('개를 리드로 낼지', () => {
	const ctx = (handSize: number, partnerDeclared = false): AiDecisionContext => {
		const s = scene({ myHand: 'dog jade_7', oppPlay: 'jade_6', oppLeft: 9 });
		const extra = DECK.filter(c => c.type === 'normal' && c.rank >= 6 && c.id !== 'jade_7').slice(0, handSize - 2);
		s.context.players[0].hand = [...cards('dog jade_7'), ...extra];
		s.context.players[2].smallTichu = partnerDeclared;
		return { ...s.context, hand: s.context.players[0].hand, trick: null };
	};

	it('파트너가 티츄를 불렀으면 선을 넘긴다', () => {
		for (const who of ALL) {
			expect(decideDogLead(ctx(12, true), getBehaviorForStrategy(who).habits!, false), who).toBe(true);
		}
	});

	it('끝내기 구간(4장 이하)에서는 규칙 AI의 판단을 따른다', () => {
		const habits = getBehaviorForStrategy('aggressive').habits!;
		expect(decideDogLead(ctx(4), habits, true)).toBe(true);
		expect(decideDogLead(ctx(4), habits, false)).toBe(false);
	});

	it('손패가 많을 때는 아랭이 라미보다 자주, 중반에는 라미가 더 자주 낸다', () => {
		const rate = (who: AiStrategy, size: number) => {
			let yes = 0;
			const pool = DECK.filter(c => c.type === 'normal');
			for (let i = 0; i < 200; i++) {
				const c = ctx(size);
				// 손패를 바꿔 가며 (같은 손패면 늘 같은 판단이라 여러 손패로 본다)
				c.players[0].hand = [card('dog'), ...pool.slice(i % 30, (i % 30) + size - 2), pool[(i * 7) % 52]];
				if (decideDogLead({ ...c, hand: c.players[0].hand }, getBehaviorForStrategy(who).habits!, false)) yes++;
			}
			return yes / 200;
		};
		expect(rate('aggressive', 12)).toBeGreaterThan(rate('wild', 12));
		expect(rate('wild', 7)).toBeGreaterThan(rate('aggressive', 7));
	});
});

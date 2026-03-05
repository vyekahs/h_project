import type { Card, SeatIndex, TichuRoomState, RoundState } from '../types';
import type { TichuSaveData } from '../ai/localGameEngine';
import type { PersonalityWeights } from '../ai/types';
import type { TutorialInitialState } from './tutorialTypes';
import { createAllCards, getTeam } from '../constants';
import { createWishState } from '../wish';

const ALL_CARDS = createAllCards();

/** 카드 ID로 Card 객체를 찾는다 */
export function card(id: string): Card {
	const found = ALL_CARDS.find(c => c.id === id);
	if (!found) throw new Error(`Card not found: ${id}`);
	// 새 객체 반환 (원본 오염 방지)
	return { ...found } as Card;
}

/** 여러 카드 ID로 Card 배열을 만든다 */
export function cards(...ids: string[]): Card[] {
	return ids.map(card);
}

/** 기본 balanced AI 가중치 */
const TUTORIAL_AI_WEIGHTS: PersonalityWeights = {
	aggressiveness: 0.5,
	tichoPropensity: 0,
	bombHolding: 0.5,
	partnerAwareness: 0.6,
	riskTolerance: 0.5
};

/** TutorialInitialState로부터 TichuSaveData를 합성한다 */
export function buildTutorialSave(init: TutorialInitialState): TichuSaveData {
	const gtDecisions = init.grandTichuDecisions ?? [false, false, false, false];
	const players = [
		createTutorialPlayer(0 as SeatIndex, '나', init.hands[0], gtDecisions[0]),
		createTutorialPlayer(1 as SeatIndex, '상대1', init.hands[1], gtDecisions[1]),
		createTutorialPlayer(2 as SeatIndex, '파트너', init.hands[2], gtDecisions[2]),
		createTutorialPlayer(3 as SeatIndex, '상대2', init.hands[3], gtDecisions[3]),
	];

	const round: RoundState = {
		roundNumber: 1,
		players,
		trick: init.trick ?? null,
		wish: init.wish ?? createWishState(),
		currentSeat: init.currentSeat,
		finishedCount: 0,
		finishOrder: [],
		dragonGiftPending: false,
		dragonGiftSeat: null,
		turnDeadline: null
	};

	const state: TichuRoomState = {
		roomId: 'tutorial',
		phase: init.phase,
		config: { targetScore: 1000 },
		players,
		readyStatus: [true, true, true, true],
		round,
		completedRounds: [],
		cumulativeScoreA: 0,
		cumulativeScoreB: 0,
		winner: null,
		createdAt: Date.now()
	};

	return {
		version: 1,
		savedAt: Date.now(),
		state,
		aiWeights: {
			1: { ...TUTORIAL_AI_WEIGHTS },
			2: { ...TUTORIAL_AI_WEIGHTS },
			3: { ...TUTORIAL_AI_WEIGHTS },
		},
		aiPartnerFlags: {
			1: false,
			2: true,
			3: false
		},
		grandTichuDecisions: gtDecisions.map(d => d ?? false) as [boolean, boolean, boolean, boolean],
		exchangeSubmissions: [null, null, null, null],
		remainingCards: [],
		config: {
			partnerStrategy: 'balanced',
			targetScore: 1000,
			aiSpeed: 'normal',
			playerName: '나'
		}
	};
}

function createTutorialPlayer(seat: SeatIndex, name: string, hand: Card[], grandTichu: boolean | null = false) {
	return {
		userId: seat === 0 ? -1 : -(seat + 100),
		name,
		seat,
		team: getTeam(seat),
		hand: [...hand],
		wonCards: [] as Card[],
		grandTichu,
		smallTichu: false,
		hasPlayedFirstCard: false,
		finishOrder: null as number | null,
		connected: true
	};
}

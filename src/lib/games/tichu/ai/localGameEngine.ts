import type {
	TichuRoomState, TichuPlayer, GamePhase, SeatIndex, TeamId,
	Card, Combination, RoundState, Trick, ExchangeCards, TichuRoundResult, RoomConfig
} from '../types';
import { createShuffledDeck, dealFirst8, dealRemaining6, hasMahjong, findCardById, removeCardById } from '../deck';
import { detectCombination, canBeat, isBomb, resolvePhoenixSingleRank } from '../combinations';
import { calculateRoundResult, checkGameOver } from '../scoring';
import { canFulfillWish, mustPlayWishedRank, playFulfillsWish, canPlayWishedCombo, createWishState, isValidWishRank } from '../wish';
import { getTeam, getPartnerSeat, getLeftSeat, getRightSeat, DEFAULT_TARGET_SCORE } from '../constants';
import type { AiStrategy, AiSpeed, AiDecisionContext, PersonalityWeights } from './types';
import { AI_SPEED_DELAYS } from './types';
import { getRandomStrategy } from './presets';
import { AiPlayer } from './aiPlayer';

const HUMAN_SEAT = 0 as SeatIndex;

export type GameEvent =
	| { type: 'pass'; seat: SeatIndex }
	| { type: 'play'; seat: SeatIndex; combo: Combination }
	| { type: 'trick_won'; seat: SeatIndex }
	| { type: 'bomb'; seat: SeatIndex; combo: Combination }
	| { type: 'dog'; seat: SeatIndex; targetSeat: SeatIndex }
	| { type: 'dragon_gift'; seat: SeatIndex; targetSeat: SeatIndex };

export interface LocalGameConfig {
	partnerStrategy: AiStrategy;
	targetScore: number;
	aiSpeed: AiSpeed;
	playerName: string;
	onStateChange: () => void;
	onEvent?: (event: GameEvent) => void;
}

export interface ExchangeResultEntry {
	fromSeat: SeatIndex;
	fromName: string;
	card: Card;
}

export interface TichuSaveData {
	version: number;
	savedAt: number;
	state: TichuRoomState;
	aiWeights: Record<number, PersonalityWeights>;
	aiPartnerFlags: Record<number, boolean>;
	grandTichuDecisions: (boolean | null)[];
	exchangeSubmissions: (ExchangeCards | null)[];
	config: {
		partnerStrategy: AiStrategy;
		targetScore: number;
		aiSpeed: AiSpeed;
		playerName: string;
	};
}

const SAVE_KEY = 'tichu_save';

export function saveTichuGame(data: TichuSaveData): void {
	try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

export function loadTichuGame(): TichuSaveData | null {
	try {
		const raw = localStorage.getItem(SAVE_KEY);
		if (!raw) return null;
		const data = JSON.parse(raw) as TichuSaveData;
		if (data.version !== 1) return null;
		return data;
	} catch { return null; }
}

export function clearTichuSave(): void {
	try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

export function hasTichuSave(): boolean {
	try { return localStorage.getItem(SAVE_KEY) !== null; } catch { return false; }
}

export class LocalGameEngine {
	state: TichuRoomState;
	exchangeResult: ExchangeResultEntry[] | null = null;
	private aiPlayers: Map<SeatIndex, AiPlayer> = new Map();
	private aiSpeed: AiSpeed;
	private grandTichuDecisions: (boolean | null)[] = [null, null, null, null];
	private exchangeSubmissions: (ExchangeCards | null)[] = [null, null, null, null];
	private deck: Card[] = [];
	private remainingCards: Card[] = [];
	private onStateChange: () => void;
	private onEvent: (event: GameEvent) => void;
	private destroyed = false;
	private processingAi = false;
	private humanActionInProgress = false;

	constructor(config: LocalGameConfig) {
		this.aiSpeed = config.aiSpeed;
		this.onStateChange = config.onStateChange;
		this.onEvent = config.onEvent ?? (() => {});

		// Create AI players
		// Seat 0: Human (Team A)
		// Seat 1: AI opponent (Team B) - random strategy
		// Seat 2: AI partner (Team A) - user-chosen strategy
		// Seat 3: AI opponent (Team B) - random strategy
		this.aiPlayers.set(1 as SeatIndex, new AiPlayer(1 as SeatIndex, getRandomStrategy(), false));
		this.aiPlayers.set(2 as SeatIndex, new AiPlayer(2 as SeatIndex, config.partnerStrategy, true));
		this.aiPlayers.set(3 as SeatIndex, new AiPlayer(3 as SeatIndex, getRandomStrategy(), false));

		this.state = {
			roomId: 'local',
			phase: 'lobby',
			config: { targetScore: config.targetScore },
			players: [
				this.createPlayer(0 as SeatIndex, config.playerName),
				this.createPlayer(1 as SeatIndex, '수호'),
				this.createPlayer(2 as SeatIndex, '하나'),
				this.createPlayer(3 as SeatIndex, '민준')
			],
			readyStatus: [true, true, true, true],
			round: null,
			completedRounds: [],
			cumulativeScoreA: 0,
			cumulativeScoreB: 0,
			winner: null,
			createdAt: Date.now()
		};
	}

	private createPlayer(seat: SeatIndex, name: string): TichuPlayer {
		return {
			userId: seat === HUMAN_SEAT ? -1 : -(seat + 100),
			name,
			seat,
			team: getTeam(seat),
			hand: [],
			wonCards: [],
			grandTichu: null,
			smallTichu: false,
			hasPlayedFirstCard: false,
			finishOrder: null,
			connected: true
		};
	}

	destroy(): void {
		this.destroyed = true;
	}

	// ===== Save / Restore =====

	getSaveSnapshot(): TichuSaveData | null {
		const savablePhases: GamePhase[] = ['grand_tichu_window', 'exchange', 'playing', 'wish_declare', 'dragon_gift'];
		if (!savablePhases.includes(this.state.phase)) return null;
		if (this.state.phase === 'playing' && this.state.round?.currentSeat !== HUMAN_SEAT) return null;

		return {
			version: 1,
			savedAt: Date.now(),
			state: structuredClone(this.state),
			aiWeights: Object.fromEntries(
				[...this.aiPlayers.entries()].map(([seat, ai]) => [seat, ai.weights])
			),
			aiPartnerFlags: Object.fromEntries(
				[...this.aiPlayers.entries()].map(([seat, ai]) => [seat, ai.isPartner])
			),
			grandTichuDecisions: [...this.grandTichuDecisions],
			exchangeSubmissions: structuredClone(this.exchangeSubmissions),
			config: {
				partnerStrategy: 'balanced',
				targetScore: this.state.config.targetScore,
				aiSpeed: this.aiSpeed,
				playerName: this.state.players[0].name
			}
		};
	}

	static restore(
		save: TichuSaveData,
		onStateChange: () => void,
		onEvent?: (event: GameEvent) => void
	): LocalGameEngine {
		const engine = Object.create(LocalGameEngine.prototype) as LocalGameEngine;
		engine.state = save.state;
		engine.aiSpeed = save.config.aiSpeed;
		engine.onStateChange = onStateChange;
		engine.onEvent = onEvent ?? (() => {});
		engine.destroyed = false;
		engine.processingAi = false;
		engine.humanActionInProgress = false;
		engine.aiTurnQueued = false;
		engine.exchangeResult = null;
		engine.grandTichuDecisions = save.grandTichuDecisions;
		engine.exchangeSubmissions = save.exchangeSubmissions;
		engine.deck = [];
		engine.remainingCards = [];

		engine.aiPlayers = new Map();
		for (const [seatStr, weights] of Object.entries(save.aiWeights)) {
			const seat = Number(seatStr) as SeatIndex;
			const isPartner = save.aiPartnerFlags[seat] ?? (seat === 2);
			engine.aiPlayers.set(seat, AiPlayer.fromWeights(seat, weights, isPartner));
		}

		return engine;
	}

	resumeAfterRestore(): void {
		this.notifyStateChange();
	}

	// ===== Game Lifecycle =====

	startGame(): void {
		this.startDealing();
	}

	startNextRound(): void {
		this.startDealing();
	}

	private startDealing(): void {
		this.deck = createShuffledDeck();
		const { hands, remaining } = dealFirst8(this.deck);
		this.remainingCards = remaining;

		this.state.round = {
			roundNumber: this.state.completedRounds.length + 1,
			players: this.state.players,
			trick: null,
			wish: createWishState(),
			currentSeat: 0 as SeatIndex,
			finishedCount: 0,
			finishOrder: [],
			dragonGiftPending: false,
			dragonGiftSeat: null,
			turnDeadline: null
		};

		// Reset player state
		for (let i = 0; i < 4; i++) {
			const p = this.state.players[i];
			p.hand = hands[i];
			p.wonCards = [];
			p.grandTichu = null;
			p.smallTichu = false;
			p.hasPlayedFirstCard = false;
			p.finishOrder = null;
		}

		this.grandTichuDecisions = [null, null, null, null];
		this.exchangeSubmissions = [null, null, null, null];
		this.exchangeResult = null;

		this.setPhase('grand_tichu_window');
		this.notifyStateChange();

		// Process AI grand tichu decisions
		this.processAiGrandTichu();
	}

	// ===== Grand Tichu Phase =====

	humanDeclareGrandTichu(): boolean {
		if (this.state.phase !== 'grand_tichu_window') return false;
		const player = this.state.players[HUMAN_SEAT];
		if (player.grandTichu !== null) return false;

		player.grandTichu = true;
		this.grandTichuDecisions[HUMAN_SEAT] = true;
		this.checkGrandTichuComplete();
		this.notifyStateChange();
		return true;
	}

	humanPassGrandTichu(): boolean {
		if (this.state.phase !== 'grand_tichu_window') return false;
		const player = this.state.players[HUMAN_SEAT];
		if (player.grandTichu !== null) return false;

		player.grandTichu = false;
		this.grandTichuDecisions[HUMAN_SEAT] = false;
		this.checkGrandTichuComplete();
		this.notifyStateChange();
		return true;
	}

	private async processAiGrandTichu(): Promise<void> {
		for (let i = 0; i < 4; i++) {
			if (i === HUMAN_SEAT) continue;
			const seat = i as SeatIndex;
			const ai = this.aiPlayers.get(seat);
			if (!ai) continue;

			await this.delay();
			if (this.destroyed) return;
			if (this.state.phase !== 'grand_tichu_window') return; // Phase already changed

			const decide = ai.makeGrandTichuDecision(this.state.players[seat].hand);
			this.state.players[seat].grandTichu = decide;
			this.grandTichuDecisions[seat] = decide;
			this.notifyStateChange();
		}

		this.checkGrandTichuComplete();
	}

	private checkGrandTichuComplete(): void {
		if (this.grandTichuDecisions.every(d => d !== null)) {
			this.endGrandTichuWindow();
		}
	}

	private endGrandTichuWindow(): void {
		if (this.state.phase !== 'grand_tichu_window') return;

		// Auto-pass undecided
		for (let i = 0; i < 4; i++) {
			if (this.state.players[i].grandTichu === null) {
				this.state.players[i].grandTichu = false;
			}
		}

		// Deal remaining 6
		const extraHands = dealRemaining6(this.remainingCards);
		for (let i = 0; i < 4; i++) {
			this.state.players[i].hand.push(...extraHands[i]);
		}

		this.setPhase('exchange');
		this.notifyStateChange();

		// Process AI small tichu decisions and exchanges
		this.processAiExchange();
	}

	// ===== Exchange Phase =====

	humanSubmitExchange(exchange: ExchangeCards): boolean {
		if (this.state.phase !== 'exchange') return false;
		if (this.exchangeSubmissions[HUMAN_SEAT]) return false;

		const player = this.state.players[HUMAN_SEAT];
		const { toPartner, toLeft, toRight } = exchange;
		const ids = [toPartner, toLeft, toRight];
		if (new Set(ids).size !== 3) return false;

		for (const id of ids) {
			if (!findCardById(player.hand, id)) return false;
		}

		this.exchangeSubmissions[HUMAN_SEAT] = exchange;

		if (this.exchangeSubmissions.every(e => e !== null)) {
			this.processExchanges();
		}
		this.notifyStateChange();
		return true;
	}

	humanDeclareSmallTichu(): boolean {
		if (this.state.phase !== 'playing' && this.state.phase !== 'exchange') return false;
		const player = this.state.players[HUMAN_SEAT];
		if (player.hasPlayedFirstCard) return false;
		if (player.smallTichu) return false;
		if (player.grandTichu === true) return false;

		player.smallTichu = true;
		this.notifyStateChange();
		return true;
	}

	private async processAiExchange(): Promise<void> {
		for (let i = 0; i < 4; i++) {
			if (i === HUMAN_SEAT) continue;
			const seat = i as SeatIndex;
			const ai = this.aiPlayers.get(seat);
			if (!ai) continue;

			// AI small tichu decision
			const context = this.createAiContext(seat);
			if (!this.state.players[seat].grandTichu && ai.makeSmallTichuDecision(this.state.players[seat].hand, context)) {
				this.state.players[seat].smallTichu = true;
			}

			// AI exchange
			const exchange = ai.makeExchangeDecision(this.state.players[seat].hand);
			this.exchangeSubmissions[seat] = exchange;
		}

		// Wait for human exchange
		// (processExchanges will be called when human submits)
		this.notifyStateChange();
	}

	private processExchanges(): void {
		const received: Card[][] = [[], [], [], []];
		// Track what human receives and from whom
		const humanReceived: ExchangeResultEntry[] = [];

		for (let seat = 0; seat < 4; seat++) {
			const exchange = this.exchangeSubmissions[seat]!;
			const player = this.state.players[seat];

			const pSeat = getPartnerSeat(seat);
			const lSeat = getLeftSeat(seat);
			const rSeat = getRightSeat(seat);

			const partnerCard = findCardById(player.hand, exchange.toPartner)!;
			const leftCard = findCardById(player.hand, exchange.toLeft)!;
			const rightCard = findCardById(player.hand, exchange.toRight)!;

			player.hand = removeCardById(player.hand, exchange.toPartner);
			player.hand = removeCardById(player.hand, exchange.toLeft);
			player.hand = removeCardById(player.hand, exchange.toRight);

			received[pSeat].push(partnerCard);
			received[lSeat].push(leftCard);
			received[rSeat].push(rightCard);

			// Record cards sent to human (seat 0)
			if (seat !== HUMAN_SEAT) {
				const seatIdx = seat as SeatIndex;
				const name = this.state.players[seatIdx].name;
				if (pSeat === HUMAN_SEAT) humanReceived.push({ fromSeat: seatIdx, fromName: name, card: partnerCard });
				if (lSeat === HUMAN_SEAT) humanReceived.push({ fromSeat: seatIdx, fromName: name, card: leftCard });
				if (rSeat === HUMAN_SEAT) humanReceived.push({ fromSeat: seatIdx, fromName: name, card: rightCard });
			}
		}

		for (let i = 0; i < 4; i++) {
			this.state.players[i].hand.push(...received[i]);
		}

		// Store exchange result for UI display
		this.exchangeResult = humanReceived;

		// Find who has mahjong
		const mahjongIdx = this.state.players.findIndex(p => hasMahjong(p.hand));
		const startSeat = (mahjongIdx >= 0 ? mahjongIdx : 0) as SeatIndex;
		if (this.state.round) {
			this.state.round.currentSeat = startSeat;
		}

		this.setPhase('playing');
		this.notifyStateChange();

		// If AI goes first, process AI turns
		if (startSeat !== HUMAN_SEAT) {
			this.processAiTurns();
		}
	}

	// ===== Playing Phase =====

	async humanPlayCards(cardIds: string[]): Promise<{ success: boolean; error?: string }> {
		if (this.humanActionInProgress) return { success: false, error: '처리 중입니다' };
		this.humanActionInProgress = true;
		try {
			return await this.playCardsInternal(HUMAN_SEAT, cardIds, true);
		} finally {
			this.humanActionInProgress = false;
		}
	}

	humanPass(): { success: boolean; error?: string } {
		if (this.humanActionInProgress) return { success: false, error: '처리 중입니다' };
		return this.passInternal(HUMAN_SEAT, true);
	}

	async humanPlayBomb(cardIds: string[]): Promise<{ success: boolean; error?: string }> {
		if (this.humanActionInProgress) return { success: false, error: '처리 중입니다' };
		this.humanActionInProgress = true;
		try {
			return await this.playBombWithInterrupt(HUMAN_SEAT, cardIds, true);
		} finally {
			this.humanActionInProgress = false;
		}
	}

	humanSetWish(rank: number | null): boolean {
		if (this.state.phase !== 'wish_declare') return false;
		const round = this.state.round;
		if (!round || round.currentSeat !== HUMAN_SEAT) return false;

		if (rank !== null && !isValidWishRank(rank)) return false;

		if (rank !== null) {
			round.wish = { active: true, requestedRank: rank, requestedBy: HUMAN_SEAT };
		}

		const player = this.state.players[HUMAN_SEAT];
		if (player.hand.length === 0) {
			this.playerFinished(HUMAN_SEAT);
		}

		if (this.checkRoundEnd()) return true;

		this.setPhase('playing');
		this.advanceTurn();
		this.notifyStateChange();

		if (round.currentSeat !== HUMAN_SEAT) {
			this.processAiTurns();
		}
		return true;
	}

	humanGiftDragon(targetSeat: SeatIndex): boolean {
		if (this.state.phase !== 'dragon_gift') return false;
		const round = this.state.round;
		if (!round || round.dragonGiftSeat !== HUMAN_SEAT) return false;

		const myTeam = getTeam(HUMAN_SEAT);
		const targetTeam = getTeam(targetSeat);
		if (myTeam === targetTeam) return false;

		if (round.trick) {
			const allCards = round.trick.plays.flatMap(p => p.combination.cards);
			this.state.players[targetSeat].wonCards.push(...allCards);
		}

		this.emitEvent({ type: 'dragon_gift', seat: HUMAN_SEAT, targetSeat });

		round.trick = null;
		round.dragonGiftPending = false;
		round.dragonGiftSeat = null;

		if (this.checkRoundEnd()) return true;

		this.setPhase('playing');
		const player = this.state.players[HUMAN_SEAT];
		if (player.finishOrder !== null) {
			round.currentSeat = this.nextActiveSeat(HUMAN_SEAT);
		} else {
			round.currentSeat = HUMAN_SEAT;
		}
		this.notifyStateChange();

		if (round.currentSeat !== HUMAN_SEAT) {
			this.processAiTurns();
		}
		return true;
	}

	// ===== Internal Game Logic (ported from TichuRoom) =====

	private async playCardsInternal(seat: SeatIndex, cardIds: string[], triggerAi: boolean): Promise<{ success: boolean; error?: string }> {
		if (!Array.isArray(cardIds) || cardIds.length === 0 || cardIds.length > 14) {
			return { success: false, error: '유효하지 않은 카드 수입니다' };
		}
		if (this.state.phase !== 'playing') return { success: false, error: '지금은 카드를 낼 수 없습니다' };
		const round = this.state.round;
		if (!round) return { success: false, error: '라운드가 없습니다' };
		if (round.currentSeat !== seat) return { success: false, error: '당신의 차례가 아닙니다' };

		const player = this.state.players[seat];
		if (player.finishOrder !== null) return { success: false, error: '이미 완주했습니다' };

		const cards: Card[] = [];
		for (const id of cardIds) {
			const card = findCardById(player.hand, id);
			if (!card) return { success: false, error: `카드를 찾을 수 없습니다: ${id}` };
			cards.push(card);
		}

		// Dog: special handling
		if (cards.length === 1 && cards[0].type === 'special' && cards[0].special === 'dog') {
			return this.playDog(seat, cards[0], triggerAi);
		}

		const combo = detectCombination(cards);
		if (!combo) return { success: false, error: '유효하지 않은 카드 조합입니다' };

		if (round.trick && round.trick.plays.length > 0) {
			const lastPlay = round.trick.plays[round.trick.plays.length - 1];
			if (!canBeat(lastPlay.combination, combo)) {
				return { success: false, error: '현재 트릭을 이길 수 없는 조합입니다' };
			}
		}

		// Wish enforcement
		if (round.wish.active && round.wish.requestedRank !== null) {
			if (mustPlayWishedRank(player.hand, round.wish) && !playFulfillsWish(cards, round.wish)) {
				if (round.trick && round.trick.plays.length > 0) {
					const lastPlay = round.trick.plays[round.trick.plays.length - 1];
					if (canPlayWishedCombo(player.hand, round.wish, lastPlay.combination)) {
						return { success: false, error: `소원 카드(${round.wish.requestedRank})를 포함해야 합니다` };
					}
				} else {
					return { success: false, error: `소원 카드(${round.wish.requestedRank})를 포함해야 합니다` };
				}
			}
		}

		// Remove cards from hand
		for (const id of cardIds) {
			player.hand = removeCardById(player.hand, id);
		}
		player.hasPlayedFirstCard = true;

		// Add to trick
		if (!round.trick) {
			round.trick = { plays: [], passCount: 0, leadSeat: seat, currentSeat: seat };
		}

		const lastCombo = round.trick.plays.length > 0
			? round.trick.plays[round.trick.plays.length - 1].combination
			: null;
		const resolvedCombo = resolvePhoenixSingleRank(combo, lastCombo);
		round.trick.plays.push({ seat, combination: resolvedCombo });
		round.trick.passCount = 0;
		this.emitEvent(isBomb(resolvedCombo)
			? { type: 'bomb', seat, combo: resolvedCombo }
			: { type: 'play', seat, combo: resolvedCombo }
		);
		// Wish fulfillment check
		if (round.wish.active && playFulfillsWish(cards, round.wish)) {
			round.wish.active = false;
		}

		// Check mahjong wish trigger
		const hasMahjongCard = cards.some(c => c.type === 'special' && c.special === 'mahjong');
		if (hasMahjongCard && round.trick.plays.length === 1) {
			this.setPhase('wish_declare');
			this.notifyStateChange();

			// If AI played mahjong, auto-handle wish
			if (seat !== HUMAN_SEAT) {
				this.processAiWish(seat);
			}
			return { success: true };
		}

		// Check if player finished
		if (player.hand.length === 0) {
			this.playerFinished(seat);
		}

		if (this.checkRoundEnd()) return { success: true };

		// Check for AI bomb interrupts before advancing turn
		if (!isBomb(resolvedCombo)) {
			this.notifyStateChange(); // Show the play before bomb check
			const bombed = await this.checkAiBombInterrupts(seat, resolvedCombo);
			if (bombed) {
				if (this.checkRoundEnd()) return { success: true };
				this.advanceTurn();
				this.notifyStateChange();
				if (triggerAi && round.currentSeat !== HUMAN_SEAT) {
					this.processAiTurns();
				}
				return { success: true };
			}
		}

		this.advanceTurn();
		this.notifyStateChange();

		if (triggerAi && round.currentSeat !== HUMAN_SEAT) {
			this.processAiTurns();
		}

		return { success: true };
	}

	private passInternal(seat: SeatIndex, triggerAi: boolean): { success: boolean; error?: string } {
		if (this.state.phase !== 'playing') return { success: false, error: '지금은 패스할 수 없습니다' };
		const round = this.state.round;
		if (!round || !round.trick) return { success: false, error: '트릭이 없습니다' };
		if (round.currentSeat !== seat) return { success: false, error: '당신의 차례가 아닙니다' };

		const player = this.state.players[seat];

		// Wish enforcement
		if (round.wish.active && round.wish.requestedRank !== null) {
			if (mustPlayWishedRank(player.hand, round.wish)) {
				const lastPlay = round.trick.plays[round.trick.plays.length - 1];
				if (lastPlay && canPlayWishedCombo(player.hand, round.wish, lastPlay.combination)) {
					return { success: false, error: `소원 카드(${round.wish.requestedRank})를 낼 수 있으므로 패스할 수 없습니다` };
				}
			}
		}

		round.trick.passCount++;
		this.emitEvent({ type: 'pass', seat });

		const activePlayers = this.state.players.filter(p => p.finishOrder === null).length;
		const passesNeeded = activePlayers - 1;

		if (round.trick.passCount >= passesNeeded) {
			this.resolveTrick();
			return { success: true };
		}

		this.advanceTurn();
		this.notifyStateChange();

		if (triggerAi && round.currentSeat !== HUMAN_SEAT) {
			this.processAiTurns();
		}

		return { success: true };
	}

	private playDog(seat: SeatIndex, card: Card, triggerAi: boolean): { success: boolean; error?: string } {
		const round = this.state.round;
		if (!round) return { success: false, error: '라운드가 없습니다' };

		if (round.trick && round.trick.plays.length > 0) {
			return { success: false, error: '개는 리드할 때만 낼 수 있습니다' };
		}

		const player = this.state.players[seat];
		player.hand = removeCardById(player.hand, card.id);
		player.hasPlayedFirstCard = true;

		const partnerSeat = getPartnerSeat(seat) as SeatIndex;
		const partner = this.state.players[partnerSeat];

		if (partner.finishOrder !== null) {
			round.currentSeat = this.nextActiveSeat(partnerSeat);
		} else {
			round.currentSeat = partnerSeat;
		}

		this.emitEvent({ type: 'dog', seat, targetSeat: round.currentSeat });

		if (player.hand.length === 0) {
			this.playerFinished(seat);
		}

		if (this.checkRoundEnd()) return { success: true };

		this.notifyStateChange();

		if (triggerAi && round.currentSeat !== HUMAN_SEAT) {
			this.processAiTurns();
		}

		return { success: true };
	}

	private async playBombWithInterrupt(seat: SeatIndex, cardIds: string[], triggerAi: boolean): Promise<{ success: boolean; error?: string }> {
		if (!Array.isArray(cardIds) || cardIds.length < 4 || cardIds.length > 14) {
			return { success: false, error: '유효하지 않은 폭탄입니다' };
		}
		if (this.state.phase !== 'playing') return { success: false, error: '지금은 폭탄을 쓸 수 없습니다' };
		const round = this.state.round;
		if (!round) return { success: false, error: '라운드가 없습니다' };

		const player = this.state.players[seat];
		if (player.finishOrder !== null) return { success: false, error: '이미 완주했습니다' };

		const cards: Card[] = [];
		for (const id of cardIds) {
			const card = findCardById(player.hand, id);
			if (!card) return { success: false, error: '카드를 찾을 수 없습니다' };
			cards.push(card);
		}

		const combo = detectCombination(cards);
		if (!combo || !isBomb(combo)) return { success: false, error: '유효한 폭탄이 아닙니다' };

		if (round.trick && round.trick.plays.length > 0) {
			const lastPlay = round.trick.plays[round.trick.plays.length - 1];
			if (!canBeat(lastPlay.combination, combo)) {
				return { success: false, error: '더 강한 폭탄이 필요합니다' };
			}
		}

		for (const id of cardIds) {
			player.hand = removeCardById(player.hand, id);
		}
		player.hasPlayedFirstCard = true;

		if (!round.trick) {
			round.trick = { plays: [], passCount: 0, leadSeat: seat, currentSeat: seat };
		}

		round.trick.plays.push({ seat, combination: combo });
		round.trick.passCount = 0;
		round.currentSeat = seat;
		this.emitEvent({ type: 'bomb', seat, combo });

		if (round.wish.active && playFulfillsWish(cards, round.wish)) {
			round.wish.active = false;
		}

		if (player.hand.length === 0) {
			this.playerFinished(seat);
		}

		if (this.checkRoundEnd()) return { success: true };

		// Check for AI counter-bombs
		this.notifyStateChange();
		const counterBombed = await this.checkAiBombInterrupts(seat, combo);
		if (counterBombed) {
			if (this.checkRoundEnd()) return { success: true };
			// After counter-bomb, currentSeat is already set to the counter-bomber
			this.advanceTurn();
			this.notifyStateChange();
			if (triggerAi && round.currentSeat !== HUMAN_SEAT) {
				this.processAiTurns();
			}
			return { success: true };
		}

		this.advanceTurn();
		this.notifyStateChange();

		if (triggerAi && round.currentSeat !== HUMAN_SEAT) {
			this.processAiTurns();
		}

		return { success: true };
	}

	// ===== Trick Resolution =====

	private resolveTrick(): void {
		const round = this.state.round;
		if (!round || !round.trick) return;

		const lastPlay = round.trick.plays[round.trick.plays.length - 1];
		const winnerSeat = lastPlay.seat;
		const allCards = round.trick.plays.flatMap(p => p.combination.cards);

		// Dragon gift check
		const isDragonTrick = lastPlay.combination.cards.some(
			c => c.type === 'special' && c.special === 'dragon'
		);

		if (isDragonTrick) {
			round.dragonGiftPending = true;
			round.dragonGiftSeat = winnerSeat;
			this.setPhase('dragon_gift');
			this.notifyStateChange();

			if (winnerSeat !== HUMAN_SEAT) {
				this.processAiDragonGift(winnerSeat);
			}
			return;
		}

		// Normal trick
		this.state.players[winnerSeat].wonCards.push(...allCards);
		this.emitEvent({ type: 'trick_won', seat: winnerSeat });
		round.trick = null;

		if (this.checkRoundEnd()) return;

		// Trick winner leads next trick (if still active, otherwise next active player)
		const winner = this.state.players[winnerSeat];
		round.currentSeat = winner.finishOrder === null
			? winnerSeat
			: this.nextActiveSeat(winnerSeat);
		this.notifyStateChange();

		if (round.currentSeat !== HUMAN_SEAT) {
			this.processAiTurns();
		}
	}

	// ===== AI Turn Processing =====

	private aiTurnQueued = false;

	private async processAiTurns(): Promise<void> {
		if (this.processingAi) {
			// Queue a restart after current processing finishes
			this.aiTurnQueued = true;
			return;
		}
		if (this.destroyed) return;
		this.processingAi = true;
		this.aiTurnQueued = false;

		try {
			let safetyCounter = 0;
			while (!this.destroyed) {
				if (++safetyCounter > 200) {
					console.error('[Engine] AI turn loop safety limit reached');
					break;
				}

				const round = this.state.round;
				if (!round) break;
				if (this.state.phase !== 'playing') break;

				const currentSeat = round.currentSeat;
				if (currentSeat === HUMAN_SEAT) break;

				const ai = this.aiPlayers.get(currentSeat);
				if (!ai) break;

				await this.delay();
				if (this.destroyed) break;

				// Check for small tichu before first card
				const player = this.state.players[currentSeat];
				if (!player.hasPlayedFirstCard && !player.smallTichu && !player.grandTichu) {
					const context = this.createAiContext(currentSeat);
					if (ai.makeSmallTichuDecision(player.hand, context)) {
						player.smallTichu = true;
						this.notifyStateChange();
					}
				}

				const seatBefore = round.currentSeat;

				// Make play decision
				const context = this.createAiContext(currentSeat);
				const decision = ai.makePlayDecision(context);

				let actionSucceeded = false;

				if (decision === 'pass') {
					const result = this.passInternal(currentSeat, false);
					if (result.success) {
						actionSucceeded = true;
					} else {
						// If can't pass (wish enforcement), try to find a valid play
						const autoPlay = this.autoPlayForAi(currentSeat);
						if (autoPlay) {
							actionSucceeded = (await this.playCardsInternal(currentSeat, autoPlay, false)).success;
						}
					}
				} else {
					const result = await this.playCardsInternal(currentSeat, decision, false);
					if (result.success) {
						actionSucceeded = true;
					} else {
						// AI made an invalid play, try auto-play
						const autoPlay = this.autoPlayForAi(currentSeat);
						if (autoPlay) {
							actionSucceeded = (await this.playCardsInternal(currentSeat, autoPlay, false)).success;
						}
						if (!actionSucceeded) {
							// Try pass
							actionSucceeded = this.passInternal(currentSeat, false).success;
						}
					}
				}

				// If nothing worked AND seat didn't change, force advance to prevent infinite loop
				if (!actionSucceeded && round.currentSeat === seatBefore) {
					console.warn(`[Engine] AI seat ${currentSeat} stuck, forcing advance`);
					this.advanceTurn();
					this.notifyStateChange();
				}

				// Phase might have changed (wish_declare, dragon_gift, round_end, game_end)
				if (this.state.phase !== 'playing') break;
			}
		} catch (e) {
			console.error('[Engine] AI turn processing error:', e);
		} finally {
			this.processingAi = false;
			// If another call was queued while we were processing, restart
			if (this.aiTurnQueued && !this.destroyed) {
				this.aiTurnQueued = false;
				this.processAiTurns();
			}
		}
	}

	private async processAiWish(seat: SeatIndex): Promise<void> {
		try {
			const ai = this.aiPlayers.get(seat);
			if (!ai) return;

			await this.delay();
			if (this.destroyed) return;

			const context = this.createAiContext(seat);
			const wishRank = ai.makeWishDecision(this.state.players[seat].hand, context);

			const round = this.state.round;
			if (!round) return;

			if (wishRank !== null && isValidWishRank(wishRank)) {
				round.wish = { active: true, requestedRank: wishRank, requestedBy: seat };
			}

			const player = this.state.players[seat];
			if (player.hand.length === 0) {
				this.playerFinished(seat);
			}

			if (this.checkRoundEnd()) return;

			this.setPhase('playing');
			this.advanceTurn();
			this.notifyStateChange();

			if (round.currentSeat !== HUMAN_SEAT) {
				this.processAiTurns();
			}
		} catch (e) {
			console.error('[Engine] AI wish processing error:', e);
		}
	}

	private async processAiDragonGift(seat: SeatIndex): Promise<void> {
		try {
			const ai = this.aiPlayers.get(seat);
			if (!ai) return;

			await this.delay();
			if (this.destroyed) return;

			const round = this.state.round;
			if (!round) return;

			const context = this.createAiContext(seat);
			const targetSeat = ai.makeDragonGiftDecision(context);

			if (round.trick) {
				const allCards = round.trick.plays.flatMap(p => p.combination.cards);
				this.state.players[targetSeat].wonCards.push(...allCards);
			}

			this.emitEvent({ type: 'dragon_gift', seat, targetSeat });

			round.trick = null;
			round.dragonGiftPending = false;
			round.dragonGiftSeat = null;

			if (this.checkRoundEnd()) return;

			this.setPhase('playing');
			const player = this.state.players[seat];
			if (player.finishOrder !== null) {
				round.currentSeat = this.nextActiveSeat(seat);
			} else {
				round.currentSeat = seat;
			}
			this.notifyStateChange();

			if (round.currentSeat !== HUMAN_SEAT) {
				this.processAiTurns();
			}
		} catch (e) {
			console.error('[Engine] AI dragon gift processing error:', e);
		}
	}

	/**
	 * Check if any AI player wants to bomb the last play out of turn.
	 * Handles counter-bombs by looping (max 4 iterations).
	 * Returns true if any bomb was played.
	 */
	private async checkAiBombInterrupts(
		lastPlaySeat: SeatIndex,
		lastCombination: Combination
	): Promise<boolean> {
		const round = this.state.round;
		if (!round || !round.trick) return false;
		if (this.destroyed) return false;

		let currentLastPlaySeat = lastPlaySeat;
		let currentLastCombination = lastCombination;
		let anyBombPlayed = false;

		for (let iteration = 0; iteration < 4; iteration++) {
			if (this.destroyed) break;
			if (this.state.phase !== 'playing') break;
			if (!round.trick) break;

			let foundBomber = false;

			for (let i = 1; i <= 3; i++) {
				const seat = ((currentLastPlaySeat + i) % 4) as SeatIndex;

				if (seat === HUMAN_SEAT) continue;
				if (seat === currentLastPlaySeat) continue;

				const player = this.state.players[seat];
				if (player.finishOrder !== null) continue;
				if (player.hand.length === 0) continue;

				const ai = this.aiPlayers.get(seat);
				if (!ai) continue;

				const context = this.createAiContext(seat);
				const bombCombo = ai.checkBombInterrupt(context, {
					seat: currentLastPlaySeat,
					combination: currentLastCombination
				});

				if (bombCombo) {
					await this.delay();
					if (this.destroyed) return anyBombPlayed;

					// Inline bomb execution to avoid recursive async calls
					const bombCardIds = bombCombo.cards.map(c => c.id);
					const bombCards: Card[] = [];
					let valid = true;
					for (const id of bombCardIds) {
						const card = findCardById(player.hand, id);
						if (!card) { valid = false; break; }
						bombCards.push(card);
					}
					if (!valid) continue;

					const detectedCombo = detectCombination(bombCards);
					if (!detectedCombo || !isBomb(detectedCombo)) continue;

					if (round.trick.plays.length > 0) {
						const currentLast = round.trick.plays[round.trick.plays.length - 1];
						if (!canBeat(currentLast.combination, detectedCombo)) continue;
					}

					// Remove cards from hand
					for (const id of bombCardIds) {
						player.hand = removeCardById(player.hand, id);
					}
					player.hasPlayedFirstCard = true;

					// Add to trick
					round.trick.plays.push({ seat, combination: detectedCombo });
					round.trick.passCount = 0;
					round.currentSeat = seat;
					this.emitEvent({ type: 'bomb', seat, combo: detectedCombo });

					// Wish fulfillment
					if (round.wish.active && playFulfillsWish(bombCards, round.wish)) {
						round.wish.active = false;
					}

					// Check if player finished
					if (player.hand.length === 0) {
						this.playerFinished(seat);
					}

					anyBombPlayed = true;
					foundBomber = true;
					currentLastPlaySeat = seat;
					currentLastCombination = detectedCombo;

					this.notifyStateChange();
					break; // Restart counter-bomb check
				}
			}

			if (!foundBomber) break;
			if (this.checkRoundEnd()) return anyBombPlayed;
		}

		return anyBombPlayed;
	}

	/**
	 * Fallback auto-play for AI when its strategy returns an invalid move.
	 * Wish-aware: prefers cards matching the wished rank when leading.
	 */
	private autoPlayForAi(seat: SeatIndex): string[] | null {
		const player = this.state.players[seat];
		const round = this.state.round;
		if (!round || player.hand.length === 0) return null;

		const wishRank = (round.wish.active && round.wish.requestedRank !== null) ? round.wish.requestedRank : null;
		const hasWishedRank = wishRank !== null && mustPlayWishedRank(player.hand, round.wish);

		if (round.trick && round.trick.plays.length > 0) {
			// Following: try to play lowest single that beats
			const lastPlay = round.trick.plays[round.trick.plays.length - 1];
			const sorted = [...player.hand].sort((a, b) => this.getCardSortRank(a) - this.getCardSortRank(b));

			// If wish active, try wished-rank card first
			if (hasWishedRank) {
				for (const card of sorted) {
					if (card.type === 'normal' && card.rank === wishRank) {
						const combo = detectCombination([card]);
						if (combo && canBeat(lastPlay.combination, combo)) {
							return [card.id];
						}
					}
				}
			}

			for (const card of sorted) {
				const combo = detectCombination([card]);
				if (combo && canBeat(lastPlay.combination, combo)) {
					return [card.id];
				}
			}
			return null; // Can't beat, should pass
		} else {
			// Leading: if wish active and we have the wished rank, lead with it
			if (hasWishedRank) {
				const wishedCard = player.hand.find(c => c.type === 'normal' && c.rank === wishRank);
				if (wishedCard) return [wishedCard.id];
			}

			// Leading: play lowest card (skip dog if possible)
			const sorted = [...player.hand].sort((a, b) => {
				const aIsDog = a.type === 'special' && a.special === 'dog';
				const bIsDog = b.type === 'special' && b.special === 'dog';
				if (aIsDog && !bIsDog) return 1;
				if (!aIsDog && bIsDog) return -1;
				return this.getCardSortRank(a) - this.getCardSortRank(b);
			});
			return [sorted[0].id];
		}
	}

	// ===== Internal Helpers =====

	private playerFinished(seat: SeatIndex): void {
		const round = this.state.round;
		if (!round) return;
		round.finishedCount++;
		round.finishOrder.push(seat);
		this.state.players[seat].finishOrder = round.finishedCount;
	}

	private checkOneTwo(): boolean {
		const round = this.state.round;
		if (!round || round.finishOrder.length < 2) return false;
		return getTeam(round.finishOrder[0]) === getTeam(round.finishOrder[1]);
	}

	private checkRoundEnd(): boolean {
		const round = this.state.round;
		if (!round) return false;
		if (round.finishedCount >= 3 || this.checkOneTwo()) {
			this.resolveRound();
			return true;
		}
		return false;
	}

	private resolveRound(): void {
		const round = this.state.round;
		if (!round) return;

		// Resolve pending trick
		if (round.trick && round.trick.plays.length > 0) {
			const lastPlay = round.trick.plays[round.trick.plays.length - 1];
			const allCards = round.trick.plays.flatMap(p => p.combination.cards);
			this.state.players[lastPlay.seat].wonCards.push(...allCards);
			round.trick = null;
		}

		// Auto-finish remaining
		for (const player of this.state.players) {
			if (player.finishOrder === null) {
				round.finishedCount++;
				round.finishOrder.push(player.seat);
				player.finishOrder = round.finishedCount;
			}
		}

		const result = calculateRoundResult(this.state.players, round.finishOrder, round.roundNumber);
		this.state.completedRounds.push(result);
		this.state.cumulativeScoreA += result.teamAScore;
		this.state.cumulativeScoreB += result.teamBScore;

		const winner = checkGameOver(this.state.cumulativeScoreA, this.state.cumulativeScoreB, this.state.config.targetScore);

		if (winner) {
			this.state.winner = winner;
			this.setPhase('game_end');
		} else {
			this.setPhase('round_end');
		}

		this.notifyStateChange();
	}

	private advanceTurn(): void {
		const round = this.state.round;
		if (!round) return;
		round.currentSeat = this.nextActiveSeat(round.currentSeat);
	}

	private nextActiveSeat(from: SeatIndex): SeatIndex {
		for (let i = 1; i <= 4; i++) {
			const next = ((from + i) % 4) as SeatIndex;
			if (this.state.players[next].finishOrder === null) {
				return next;
			}
		}
		return from;
	}

	private setPhase(phase: GamePhase): void {
		this.state.phase = phase;
	}

	private getCardSortRank(card: Card): number {
		if (card.type === 'normal') return card.rank;
		switch (card.special) {
			case 'mahjong': return 1;
			case 'dog': return 0;
			case 'phoenix': return 1.5;
			case 'dragon': return 15;
			default: return 0;
		}
	}

	private createAiContext(seat: SeatIndex): AiDecisionContext {
		const round = this.state.round!;
		return {
			hand: this.state.players[seat].hand,
			trick: round.trick,
			wish: round.wish,
			currentSeat: seat,
			players: this.state.players,
			finishOrder: round.finishOrder,
			finishedCount: round.finishedCount,
			cumulativeScoreA: this.state.cumulativeScoreA,
			cumulativeScoreB: this.state.cumulativeScoreB,
			completedRounds: this.state.completedRounds,
			roundNumber: round.roundNumber
		};
	}

	private delay(): Promise<void> {
		const ms = AI_SPEED_DELAYS[this.aiSpeed];
		if (ms === 0) return Promise.resolve();
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	private notifyStateChange(): void {
		if (!this.destroyed) {
			this.onStateChange();
		}
	}

	private emitEvent(event: GameEvent): void {
		if (!this.destroyed) {
			this.onEvent(event);
		}
	}
}

import type {
	TichuRoomState, TichuPlayer, TichuClientState, GamePhase, SeatIndex, TeamId,
	Card, Combination, RoundState, Trick, ExchangeCards, TichuRoundResult, RoomConfig
} from '$lib/games/tichu/types';
import { createShuffledDeck, dealFirst8, dealRemaining6, hasMahjong, findCardById, removeCardById } from '$lib/games/tichu/deck';
import { detectCombination, canBeat, isBomb, resolvePhoenixSingleRank } from '$lib/games/tichu/combinations';
import { calculateRoundResult, checkGameOver } from '$lib/games/tichu/scoring';
import { canFulfillWish, mustPlayWishedRank, playFulfillsWish, canPlayWishedCombo, createWishState, isValidWishRank } from '$lib/games/tichu/wish';
import { getTeam, getPartnerSeat, getLeftSeat, getRightSeat, GRAND_TICHU_WINDOW_MS, TURN_TIMEOUT_MS, DEFAULT_TARGET_SCORE } from '$lib/games/tichu/constants';

export class TichuRoom {
	state: TichuRoomState;
	private grandTichuTimer: ReturnType<typeof setTimeout> | null = null;
	private autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;
	private turnTimer: ReturnType<typeof setTimeout> | null = null;
	private wishTimer: ReturnType<typeof setTimeout> | null = null;
	private dragonGiftTimer: ReturnType<typeof setTimeout> | null = null;
	private grandTichuDecisions: (boolean | null)[] = [null, null, null, null];
	private exchangeSubmissions: (ExchangeCards | null)[] = [null, null, null, null];
	private deck: Card[] = [];
	private remainingCards: Card[] = [];

	// Callbacks for emitting events
	onPhaseChange?: (phase: GamePhase) => void;
	onStateUpdate?: () => void;
	onCardsDealt?: (seat: SeatIndex, cards: Card[]) => void;
	onRemainingDealt?: (seat: SeatIndex, cards: Card[]) => void;
	onExchangeReceived?: (seat: SeatIndex, cards: Card[]) => void;
	onTrickWon?: (seat: SeatIndex, cards: Card[]) => void;
	onRoundEnd?: (result: TichuRoundResult) => void;
	onGameEnd?: (winner: TeamId) => void;
	onError?: (seat: SeatIndex, message: string) => void;

	constructor(roomId: string, config?: Partial<RoomConfig>) {
		this.state = {
			roomId,
			phase: 'lobby',
			config: {
				targetScore: config?.targetScore || DEFAULT_TARGET_SCORE
			},
			players: [],
			readyStatus: [false, false, false, false],
			round: null,
			completedRounds: [],
			cumulativeScoreA: 0,
			cumulativeScoreB: 0,
			winner: null,
			createdAt: Date.now()
		};
	}

	// ===== Player Management =====

	addPlayer(userId: number, name: string): SeatIndex | null {
		if (this.state.players.length >= 4) return null;
		if (this.state.players.some(p => p.userId === userId)) return null;

		// Find first empty seat (0~3)
		const usedSeats = new Set(this.state.players.map(p => p.seat));
		let seat: SeatIndex | null = null;
		for (let i = 0; i < 4; i++) {
			if (!usedSeats.has(i as SeatIndex)) { seat = i as SeatIndex; break; }
		}
		if (seat === null) return null;
		const team = getTeam(seat);

		this.state.players.push({
			userId,
			name,
			seat,
			team,
			hand: [],
			wonCards: [],
			grandTichu: null,
			smallTichu: false,
			hasPlayedFirstCard: false,
			finishOrder: null,
			connected: true
		});

		// Keep sorted by seat
		this.state.players.sort((a, b) => a.seat - b.seat);

		if (this.state.players.length === 4) {
			this.setPhase('ready_check');
		}

		return seat;
	}

	removePlayer(userId: number): boolean {
		if (this.state.phase !== 'lobby' && this.state.phase !== 'ready_check') return false;
		const idx = this.state.players.findIndex(p => p.userId === userId);
		if (idx === -1) return false;
		const removedSeat = this.state.players[idx].seat;
		this.state.players.splice(idx, 1);
		// Clear ready status for the removed seat (keep other seats intact)
		this.state.readyStatus[removedSeat] = false;
		if (this.state.players.length < 4) {
			this.setPhase('lobby');
		}
		return true;
	}

	swapSeat(userId: number, targetSeat: SeatIndex): boolean {
		if (this.state.phase !== 'lobby' && this.state.phase !== 'ready_check') return false;
		if (targetSeat < 0 || targetSeat > 3) return false;

		const player = this.findPlayer(userId);
		if (!player) return false;
		if (player.seat === targetSeat) return false;

		const targetPlayer = this.state.players.find(p => p.seat === targetSeat);

		if (targetPlayer) {
			// Swap seats
			targetPlayer.seat = player.seat;
			targetPlayer.team = getTeam(targetPlayer.seat);
			// Swap ready status too
			const tmpReady = this.state.readyStatus[player.seat];
			this.state.readyStatus[player.seat] = this.state.readyStatus[targetSeat];
			this.state.readyStatus[targetSeat] = tmpReady;
		} else {
			// Move to empty seat - clear old ready
			this.state.readyStatus[player.seat] = false;
		}

		player.seat = targetSeat;
		player.team = getTeam(targetSeat);

		// Re-sort players array by seat
		this.state.players.sort((a, b) => a.seat - b.seat);

		// Reset all ready when seats change
		this.state.readyStatus = [false, false, false, false];

		return true;
	}

	shuffleSeats(): boolean {
		if (this.state.phase !== 'lobby' && this.state.phase !== 'ready_check') return false;
		if (this.state.players.length < 2) return false;

		const count = this.state.players.length;
		// Always use contiguous seats 0~N-1
		const seats: SeatIndex[] = [];
		for (let i = 0; i < count; i++) seats.push(i as SeatIndex);

		// Fisher-Yates shuffle
		for (let i = seats.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[seats[i], seats[j]] = [seats[j], seats[i]];
		}

		this.state.players.forEach((p, i) => {
			p.seat = seats[i];
			p.team = getTeam(seats[i]);
		});

		this.state.players.sort((a, b) => a.seat - b.seat);
		this.state.readyStatus = [false, false, false, false];

		return true;
	}

	setReady(userId: number, ready: boolean): boolean {
		const player = this.findPlayer(userId);
		if (!player) return false;
		this.state.readyStatus[player.seat] = ready;
		return true;
	}

	setConnected(userId: number, connected: boolean): void {
		const player = this.findPlayer(userId);
		if (player) player.connected = connected;
	}

	findPlayer(userId: number): TichuPlayer | undefined {
		return this.state.players.find(p => p.userId === userId);
	}

	findSeat(userId: number): SeatIndex | null {
		const p = this.findPlayer(userId);
		return p ? p.seat : null;
	}

	// ===== Game Flow =====

	startDealing(): void {
		// Clear any pending auto-advance timer from previous round
		if (this.autoAdvanceTimer) {
			clearTimeout(this.autoAdvanceTimer);
			this.autoAdvanceTimer = null;
		}
		this.deck = createShuffledDeck();
		const { hands, remaining } = dealFirst8(this.deck);
		this.remainingCards = remaining;

		// Initialize round state
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

		// Reset player state for new round
		for (let i = 0; i < 4; i++) {
			const p = this.state.players[i];
			p.hand = hands[i];
			p.wonCards = [];
			p.grandTichu = null;
			p.smallTichu = false;
			p.hasPlayedFirstCard = false;
			p.finishOrder = null;
			this.onCardsDealt?.(i as SeatIndex, hands[i]);
		}

		this.grandTichuDecisions = [null, null, null, null];
		this.exchangeSubmissions = [null, null, null, null];

		this.setPhase('grand_tichu_window');

		// Start timer for grand tichu window
		this.grandTichuTimer = setTimeout(() => {
			this.endGrandTichuWindow();
		}, GRAND_TICHU_WINDOW_MS);
	}

	declareGrandTichu(seat: SeatIndex): boolean {
		if (this.state.phase !== 'grand_tichu_window') return false;
		const player = this.state.players[seat];
		if (!player || player.grandTichu !== null) return false;

		player.grandTichu = true;
		this.grandTichuDecisions[seat] = true;
		this.checkGrandTichuComplete();
		return true;
	}

	passGrandTichu(seat: SeatIndex): boolean {
		if (this.state.phase !== 'grand_tichu_window') return false;
		const player = this.state.players[seat];
		if (!player || player.grandTichu !== null) return false;

		player.grandTichu = false;
		this.grandTichuDecisions[seat] = false;
		this.checkGrandTichuComplete();
		return true;
	}

	private checkGrandTichuComplete(): void {
		if (this.grandTichuDecisions.every(d => d !== null)) {
			if (this.grandTichuTimer) {
				clearTimeout(this.grandTichuTimer);
				this.grandTichuTimer = null;
			}
			this.endGrandTichuWindow();
		}
	}

	private endGrandTichuWindow(): void {
		if (this.state.phase !== 'grand_tichu_window') return;

		// Auto-pass for undecided players
		for (let i = 0; i < 4; i++) {
			if (this.state.players[i].grandTichu === null) {
				this.state.players[i].grandTichu = false;
			}
		}

		// Deal remaining 6 cards
		const extraHands = dealRemaining6(this.remainingCards);
		for (let i = 0; i < 4; i++) {
			this.state.players[i].hand.push(...extraHands[i]);
			this.onRemainingDealt?.(i as SeatIndex, extraHands[i]);
		}

		this.setPhase('exchange');
	}

	// ===== Card Exchange =====

	submitExchange(seat: SeatIndex, exchange: ExchangeCards): boolean {
		if (this.state.phase !== 'exchange') return false;
		if (this.exchangeSubmissions[seat]) return false;

		const player = this.state.players[seat];
		const { toPartner, toLeft, toRight } = exchange;

		// Validate all three cards exist in hand
		const ids = [toPartner, toLeft, toRight];
		if (new Set(ids).size !== 3) return false; // must be 3 different cards
		for (const id of ids) {
			if (!findCardById(player.hand, id)) return false;
		}

		this.exchangeSubmissions[seat] = exchange;

		if (this.exchangeSubmissions.every(e => e !== null)) {
			this.processExchanges();
		}
		return true;
	}

	private processExchanges(): void {
		const received: Card[][] = [[], [], [], []];

		for (let seat = 0; seat < 4; seat++) {
			const exchange = this.exchangeSubmissions[seat]!;
			const player = this.state.players[seat];

			const partnerSeat = getPartnerSeat(seat);
			const leftSeat = getLeftSeat(seat);
			const rightSeat = getRightSeat(seat);

			const partnerCard = findCardById(player.hand, exchange.toPartner)!;
			const leftCard = findCardById(player.hand, exchange.toLeft)!;
			const rightCard = findCardById(player.hand, exchange.toRight)!;

			// Remove from hand
			player.hand = removeCardById(player.hand, exchange.toPartner);
			player.hand = removeCardById(player.hand, exchange.toLeft);
			player.hand = removeCardById(player.hand, exchange.toRight);

			// Add to recipients
			received[partnerSeat].push(partnerCard);
			received[leftSeat].push(leftCard);
			received[rightSeat].push(rightCard);
		}

		// Add received cards to hands
		for (let i = 0; i < 4; i++) {
			this.state.players[i].hand.push(...received[i]);
			this.onExchangeReceived?.(i as SeatIndex, received[i]);
		}

		// Find who has mahjong — they start
		const startSeat = this.state.players.findIndex(p => hasMahjong(p.hand)) as SeatIndex;
		if (this.state.round) {
			this.state.round.currentSeat = startSeat;
		}

		this.setPhase('playing');
		this.startTurnTimer();
	}

	// ===== Playing =====

	declareSmallTichu(seat: SeatIndex): boolean {
		if (this.state.phase !== 'playing' && this.state.phase !== 'exchange') return false;
		const player = this.state.players[seat];
		if (!player) return false;
		if (player.hasPlayedFirstCard) return false; // too late
		if (player.smallTichu) return false; // already declared
		if (player.grandTichu === true) return false; // already declared grand

		player.smallTichu = true;
		return true;
	}

	playCards(seat: SeatIndex, cardIds: string[]): { success: boolean; error?: string } {
		if (!Array.isArray(cardIds) || cardIds.length === 0 || cardIds.length > 14) {
			return { success: false, error: '유효하지 않은 카드 수입니다' };
		}
		if (this.state.phase !== 'playing') return { success: false, error: '지금은 카드를 낼 수 없습니다' };
		const round = this.state.round;
		if (!round) return { success: false, error: '라운드가 없습니다' };

		if (round.currentSeat !== seat) return { success: false, error: '당신의 차례가 아닙니다' };

		const player = this.state.players[seat];
		if (player.finishOrder !== null) return { success: false, error: '이미 완주했습니다' };

		// Find cards in hand
		const cards: Card[] = [];
		for (const id of cardIds) {
			const card = findCardById(player.hand, id);
			if (!card) return { success: false, error: `카드를 찾을 수 없습니다: ${id}` };
			cards.push(card);
		}

		// Dog: special handling
		if (cards.length === 1 && cards[0].type === 'special' && cards[0].special === 'dog') {
			return this.playDog(seat, cards[0]);
		}

		// Detect combination
		const combo = detectCombination(cards);
		if (!combo) return { success: false, error: '유효하지 않은 카드 조합입니다' };

		// Check if must beat current trick
		if (round.trick && round.trick.plays.length > 0) {
			const lastPlay = round.trick.plays[round.trick.plays.length - 1];
			if (!canBeat(lastPlay.combination, combo)) {
				return { success: false, error: '현재 트릭을 이길 수 없는 조합입니다' };
			}
		}

		// Wish enforcement: if wish is active and player has the wished rank,
		// they must include it ONLY IF a valid combination containing it can beat the current trick.
		if (round.wish.active && round.wish.requestedRank !== null) {
			if (mustPlayWishedRank(player.hand, round.wish) && !playFulfillsWish(cards, round.wish)) {
				// Only enforce if a valid combination with the wished rank can actually beat the trick
				if (round.trick && round.trick.plays.length > 0) {
					const lastPlay = round.trick.plays[round.trick.plays.length - 1];
					if (canPlayWishedCombo(player.hand, round.wish, lastPlay.combination)) {
						return { success: false, error: `소원 카드(${round.wish.requestedRank})를 포함해야 합니다` };
					}
				} else {
					// Leading: must include wished rank if possible
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
			round.trick = {
				plays: [],
				passCount: 0,
				leadSeat: seat,
				currentSeat: seat
			};
		}

		// Resolve Phoenix single rank (rank = previous card + 0.5)
		const lastCombo = round.trick.plays.length > 0
			? round.trick.plays[round.trick.plays.length - 1].combination
			: null;
		const resolvedCombo = resolvePhoenixSingleRank(combo, lastCombo);

		round.trick.plays.push({ seat, combination: resolvedCombo });
		round.trick.passCount = 0;

		// Check wish fulfillment
		if (round.wish.active && playFulfillsWish(cards, round.wish)) {
			round.wish.active = false;
		}

		// Check mahjong wish trigger
		const hasMahjongCard = cards.some(c => c.type === 'special' && c.special === 'mahjong');
		if (hasMahjongCard && round.trick.plays.length === 1) {
			// Will need wish declaration — handled by client sending wish event
			this.clearTurnTimer();
			this.setPhase('wish_declare');
			this.startWishTimer(seat);
			this.onStateUpdate?.();
			return { success: true };
		}

		// Check if player finished
		if (player.hand.length === 0) {
			this.playerFinished(seat);
		}

		// Check if round is over
		if (round.finishedCount >= 3 || this.checkOneTwo()) {
			this.resolveRound();
			return { success: true };
		}

		// Advance turn
		this.advanceTurn();
		this.onStateUpdate?.();
		return { success: true };
	}

	pass(seat: SeatIndex): { success: boolean; error?: string } {
		if (this.state.phase !== 'playing') return { success: false, error: '지금은 패스할 수 없습니다' };
		const round = this.state.round;
		if (!round || !round.trick) return { success: false, error: '트릭이 없습니다' };
		if (round.currentSeat !== seat) return { success: false, error: '당신의 차례가 아닙니다' };

		const player = this.state.players[seat];
		// Note: advanceTurn()/nextActiveSeat() skips finished players,
		// so pass() is only called by active (non-finished) players.

		// Wish enforcement: if wish is active and player has the wished rank,
		// check if any valid combination containing the wished rank can beat the current trick
		if (round.wish.active && round.wish.requestedRank !== null) {
			if (mustPlayWishedRank(player.hand, round.wish)) {
				const lastPlay = round.trick.plays[round.trick.plays.length - 1];
				if (lastPlay && canPlayWishedCombo(player.hand, round.wish, lastPlay.combination)) {
					return { success: false, error: `소원 카드(${round.wish.requestedRank})를 낼 수 있으므로 패스할 수 없습니다` };
				}
			}
		}
		round.trick.passCount++;

		// Check if trick is won (3 consecutive passes or all remaining players passed)
		const activePlayers = this.state.players.filter(p => p.finishOrder === null).length;
		const passesNeeded = activePlayers - 1; // everyone except trick winner

		if (round.trick.passCount >= passesNeeded || round.trick.passCount >= 3) {
			this.resolveTrick();
			return { success: true };
		}

		this.advanceTurn();
		this.onStateUpdate?.();
		return { success: true };
	}

	private playDog(seat: SeatIndex, card: Card): { success: boolean; error?: string } {
		const round = this.state.round;
		if (!round) return { success: false, error: '라운드가 없습니다' };

		// Dog can only be played when leading (no active trick or new trick)
		if (round.trick && round.trick.plays.length > 0) {
			return { success: false, error: '개는 리드할 때만 낼 수 있습니다' };
		}

		const player = this.state.players[seat];
		player.hand = removeCardById(player.hand, card.id);
		player.hasPlayedFirstCard = true;

		// Pass lead to partner
		const partnerSeat = getPartnerSeat(seat) as SeatIndex;
		const partner = this.state.players[partnerSeat];

		if (partner.finishOrder !== null) {
			// Partner already finished, lead passes to next active player
			round.currentSeat = this.nextActiveSeat(partnerSeat);
		} else {
			round.currentSeat = partnerSeat;
		}

		// Check if player finished
		if (player.hand.length === 0) {
			this.playerFinished(seat);
		}

		// Check if round is over (e.g. 1-2 finish or 3 players done)
		if (round.finishedCount >= 3 || this.checkOneTwo()) {
			this.resolveRound();
			return { success: true };
		}

		// Start turn timer for the next player
		this.startTurnTimer();
		this.onStateUpdate?.();
		return { success: true };
	}

	setWish(seat: SeatIndex, rank: number | null): boolean {
		if (this.state.phase !== 'wish_declare') return false;
		const round = this.state.round;
		if (!round) return false;

		// Only the player who played the mahjong (sparrow) card can set a wish
		if (round.currentSeat !== seat) return false;

		this.clearWishTimer();

		if (rank !== null) {
			if (!isValidWishRank(rank)) return false;
			round.wish = {
				active: true,
				requestedRank: rank,
				requestedBy: seat
			};
		}
		// null means no wish

		// Check if player finished
		const player = this.state.players[seat];
		if (player.hand.length === 0) {
			this.playerFinished(seat);
		}

		// Check round end
		if (round.finishedCount >= 3 || this.checkOneTwo()) {
			this.resolveRound();
			return true;
		}

		this.setPhase('playing');
		this.advanceTurn();
		this.onStateUpdate?.();
		return true;
	}

	giftDragon(seat: SeatIndex, targetSeat: SeatIndex): boolean {
		if (this.state.phase !== 'dragon_gift') return false;
		if (targetSeat < 0 || targetSeat > 3) return false;
		const round = this.state.round;
		if (!round) return false;
		if (round.dragonGiftSeat !== seat) return false;

		this.clearDragonGiftTimer();

		// Target must be on opposing team
		const myTeam = getTeam(seat);
		const targetTeam = getTeam(targetSeat);
		if (myTeam === targetTeam) return false;

		// Give trick cards to target
		if (round.trick) {
			const allCards = round.trick.plays.flatMap(p => p.combination.cards);
			this.state.players[targetSeat].wonCards.push(...allCards);
		}

		round.trick = null;
		round.dragonGiftPending = false;
		round.dragonGiftSeat = null;

		// Check round end
		if (round.finishedCount >= 3 || this.checkOneTwo()) {
			this.resolveRound();
			return true;
		}

		this.setPhase('playing');
		// Dragon trick winner leads next
		const winner = this.state.players[seat];
		if (winner.finishOrder !== null) {
			round.currentSeat = this.nextActiveSeat(seat);
		} else {
			round.currentSeat = seat;
		}
		this.startTurnTimer();
		this.onStateUpdate?.();
		return true;
	}

	playBomb(seat: SeatIndex, cardIds: string[]): { success: boolean; error?: string } {
		if (!Array.isArray(cardIds) || cardIds.length < 4 || cardIds.length > 14) {
			return { success: false, error: '유효하지 않은 폭탄입니다' };
		}
		// Bombs can be played out of turn
		if (this.state.phase !== 'playing') return { success: false, error: '지금은 폭탄을 쓸 수 없습니다' };
		const round = this.state.round;
		if (!round) return { success: false, error: '라운드가 없습니다' };

		const player = this.state.players[seat];
		if (player.finishOrder !== null) return { success: false, error: '이미 완주했습니다' };

		const cards: Card[] = [];
		for (const id of cardIds) {
			const card = findCardById(player.hand, id);
			if (!card) return { success: false, error: `카드를 찾을 수 없습니다` };
			cards.push(card);
		}

		const combo = detectCombination(cards);
		if (!combo || !isBomb(combo)) return { success: false, error: '유효한 폭탄이 아닙니다' };

		// If there's a current trick, bomb must beat it
		if (round.trick && round.trick.plays.length > 0) {
			const lastPlay = round.trick.plays[round.trick.plays.length - 1];
			if (!canBeat(lastPlay.combination, combo)) {
				return { success: false, error: '더 강한 폭탄이 필요합니다' };
			}
		}

		// Remove cards from hand
		for (const id of cardIds) {
			player.hand = removeCardById(player.hand, id);
		}
		player.hasPlayedFirstCard = true;

		if (!round.trick) {
			round.trick = {
				plays: [],
				passCount: 0,
				leadSeat: seat,
				currentSeat: seat
			};
		}

		round.trick.plays.push({ seat, combination: combo });
		round.trick.passCount = 0;
		round.currentSeat = seat; // Bomber takes the turn

		// Check wish fulfillment
		if (round.wish.active && playFulfillsWish(cards, round.wish)) {
			round.wish.active = false;
		}

		if (player.hand.length === 0) {
			this.playerFinished(seat);
		}

		this.advanceTurn();
		this.onStateUpdate?.();
		return { success: true };
	}

	// ===== Internal Helpers =====

	private resolveTrick(): void {
		this.clearTurnTimer();
		const round = this.state.round;
		if (!round || !round.trick) return;

		const lastPlay = round.trick.plays[round.trick.plays.length - 1];
		const winnerSeat = lastPlay.seat;
		const allCards = round.trick.plays.flatMap(p => p.combination.cards);

		// Check if dragon won the trick
		const isDragonTrick = lastPlay.combination.cards.some(
			c => c.type === 'special' && c.special === 'dragon'
		);

		if (isDragonTrick) {
			// Dragon gift required
			round.dragonGiftPending = true;
			round.dragonGiftSeat = winnerSeat;
			this.setPhase('dragon_gift');
			this.startDragonGiftTimer(winnerSeat);
			this.onStateUpdate?.();
			return;
		}

		// Normal trick: winner takes cards
		this.state.players[winnerSeat].wonCards.push(...allCards);
		this.onTrickWon?.(winnerSeat, allCards);

		round.trick = null;

		// Check round end
		if (round.finishedCount >= 3 || this.checkOneTwo()) {
			this.resolveRound();
			return;
		}

		// Winner leads next (or next active player if winner finished)
		round.currentSeat = this.nextActiveSeat(winnerSeat);
		this.startTurnTimer();
		this.onStateUpdate?.();
	}

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

		const first = getTeam(round.finishOrder[0]);
		const second = getTeam(round.finishOrder[1]);
		return first === second;
	}

	private resolveRound(): void {
		this.clearTurnTimer();
		const round = this.state.round;
		if (!round) return;

		// Resolve any pending trick cards before scoring
		// (e.g. when 1-2 or 3 finishes trigger resolveRound directly)
		if (round.trick && round.trick.plays.length > 0) {
			const lastPlay = round.trick.plays[round.trick.plays.length - 1];
			const allCards = round.trick.plays.flatMap(p => p.combination.cards);
			this.state.players[lastPlay.seat].wonCards.push(...allCards);
			round.trick = null;
		}

		// Auto-finish remaining players
		for (const player of this.state.players) {
			if (player.finishOrder === null) {
				round.finishedCount++;
				round.finishOrder.push(player.seat);
				player.finishOrder = round.finishedCount;
			}
		}

		const result = calculateRoundResult(
			this.state.players,
			round.finishOrder,
			round.roundNumber
		);

		this.state.completedRounds.push(result);
		this.state.cumulativeScoreA += result.teamAScore;
		this.state.cumulativeScoreB += result.teamBScore;

		this.onRoundEnd?.(result);

		// Check game over
		const winner = checkGameOver(
			this.state.cumulativeScoreA,
			this.state.cumulativeScoreB,
			this.state.config.targetScore
		);

		if (winner) {
			this.state.winner = winner;
			this.setPhase('game_end');
			this.onGameEnd?.(winner);
		} else {
			this.setPhase('round_end');
			// Auto-start next round after a brief delay
			if (this.autoAdvanceTimer) {
				clearTimeout(this.autoAdvanceTimer);
			}
			this.autoAdvanceTimer = setTimeout(() => {
				this.autoAdvanceTimer = null;
				if (this.state.phase === 'round_end') {
					this.state.readyStatus = [false, false, false, false];
					this.setPhase('ready_check');
				}
			}, 3000);
		}
	}

	private advanceTurn(): void {
		const round = this.state.round;
		if (!round) return;
		round.currentSeat = this.nextActiveSeat(round.currentSeat);
		this.startTurnTimer();
	}

	private startTurnTimer(): void {
		this.clearTurnTimer();
		const round = this.state.round;
		if (!round) return;

		round.turnDeadline = Date.now() + TURN_TIMEOUT_MS;
		const seat = round.currentSeat;

		this.turnTimer = setTimeout(() => {
			this.turnTimer = null;
			if (!this.state.round || this.state.round.currentSeat !== seat) return;
			if (this.state.phase !== 'playing') return;
			if (this.state.players[seat].finishOrder !== null) return;

			if (this.state.round.trick && this.state.round.trick.plays.length > 0) {
				// Following: auto-pass
				this.pass(seat);
			} else {
				// Leading: auto-play lowest single card
				this.autoPlayLowest(seat);
			}
		}, TURN_TIMEOUT_MS);
	}

	private clearTurnTimer(): void {
		if (this.turnTimer) {
			clearTimeout(this.turnTimer);
			this.turnTimer = null;
		}
		if (this.state.round) {
			this.state.round.turnDeadline = null;
		}
	}

	private autoPlayLowest(seat: SeatIndex): void {
		const player = this.state.players[seat];
		if (player.hand.length === 0) return;

		// Sort by effective rank, play lowest (skip dog if possible)
		const sorted = [...player.hand].sort((a, b) => {
			const aIsDog = a.type === 'special' && a.special === 'dog';
			const bIsDog = b.type === 'special' && b.special === 'dog';
			if (aIsDog && !bIsDog) return 1;
			if (!aIsDog && bIsDog) return -1;
			return this.getCardSortRank(a) - this.getCardSortRank(b);
		});

		this.playCards(seat, [sorted[0].id]);
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

	private nextActiveSeat(from: SeatIndex): SeatIndex {
		for (let i = 1; i <= 4; i++) {
			const next = ((from + i) % 4) as SeatIndex;
			if (this.state.players[next].finishOrder === null) {
				return next;
			}
		}
		return from; // all finished
	}

	private setPhase(phase: GamePhase): void {
		this.state.phase = phase;
		this.onPhaseChange?.(phase);
	}

	// ===== State Views =====

	getClientState(seat: SeatIndex): TichuClientState {
		const round = this.state.round;
		return {
			roomId: this.state.roomId,
			phase: this.state.phase,
			config: this.state.config,
			mySeat: seat,
			myHand: this.state.players.find(p => p.seat === seat)?.hand || [],
			players: this.state.players.map(p => ({
				seat: p.seat,
				name: p.name,
				team: p.team,
				cardCount: p.hand.length,
				grandTichu: p.grandTichu,
				smallTichu: p.smallTichu,
				hasPlayedFirstCard: p.hasPlayedFirstCard,
				finishOrder: p.finishOrder,
				connected: p.connected
			})),
			readyStatus: this.state.readyStatus,
			trick: round?.trick ? {
				plays: round.trick.plays,
				passCount: round.trick.passCount,
				leadSeat: round.trick.leadSeat,
				currentSeat: round.trick.currentSeat
			} : null,
			wish: round?.wish || createWishState(),
			currentSeat: round?.currentSeat || (0 as SeatIndex),
			completedRounds: this.state.completedRounds,
			cumulativeScoreA: this.state.cumulativeScoreA,
			cumulativeScoreB: this.state.cumulativeScoreB,
			winner: this.state.winner,
			dragonGiftPending: round?.dragonGiftPending || false,
			dragonGiftSeat: round?.dragonGiftSeat || null,
			turnDeadline: round?.turnDeadline || null
		};
	}

	// ===== Serialization =====

	toJSON(): string {
		return JSON.stringify({
			state: this.state,
			grandTichuDecisions: this.grandTichuDecisions,
			exchangeSubmissions: this.exchangeSubmissions
		});
	}

	static fromJSON(json: string): TichuRoom {
		const data = JSON.parse(json);
		if (!data?.state?.roomId || !data?.state?.phase || !Array.isArray(data?.state?.players)) {
			throw new Error('Invalid snapshot: missing required fields (roomId, phase, players)');
		}
		const room = new TichuRoom(data.state.roomId, data.state.config);
		room.state = data.state;
		// Restore round.players reference to state.players (they must be the same object)
		if (room.state.round) {
			room.state.round.players = room.state.players;
		}
		room.grandTichuDecisions = data.grandTichuDecisions || [null, null, null, null];
		room.exchangeSubmissions = data.exchangeSubmissions || [null, null, null, null];
		return room;
	}

	/** Resume turn timer after reconnection or snapshot restore */
	resumeTurnTimer(): void {
		// Always clear existing timer first to prevent double execution
		if (this.turnTimer) {
			clearTimeout(this.turnTimer);
			this.turnTimer = null;
		}

		if (this.state.phase !== 'playing' || !this.state.round) return;
		const round = this.state.round;
		const seat = round.currentSeat;
		if (this.state.players[seat].finishOrder !== null) return;

		// If turnDeadline already passed, trigger immediate auto-action
		if (round.turnDeadline && round.turnDeadline <= Date.now()) {
			round.turnDeadline = null;
			if (round.trick && round.trick.plays.length > 0) {
				this.pass(seat);
			} else {
				this.autoPlayLowest(seat);
			}
			return;
		}

		// If deadline exists, resume with remaining time
		if (round.turnDeadline) {
			const remaining = round.turnDeadline - Date.now();
			this.turnTimer = setTimeout(() => {
				this.turnTimer = null;
				if (!this.state.round || this.state.round.currentSeat !== seat) return;
				if (this.state.phase !== 'playing') return;
				if (this.state.players[seat].finishOrder !== null) return;

				if (this.state.round.trick && this.state.round.trick.plays.length > 0) {
					this.pass(seat);
				} else {
					this.autoPlayLowest(seat);
				}
			}, remaining);
		} else {
			// No deadline set, start fresh
			this.startTurnTimer();
		}
	}

	private startWishTimer(seat: SeatIndex): void {
		this.clearWishTimer();
		this.wishTimer = setTimeout(() => {
			this.wishTimer = null;
			if (this.state.phase !== 'wish_declare') return;
			// Auto-decline wish (null = no wish)
			this.setWish(seat, null);
		}, TURN_TIMEOUT_MS);
	}

	private clearWishTimer(): void {
		if (this.wishTimer) {
			clearTimeout(this.wishTimer);
			this.wishTimer = null;
		}
	}

	private startDragonGiftTimer(seat: SeatIndex): void {
		this.clearDragonGiftTimer();
		this.dragonGiftTimer = setTimeout(() => {
			this.dragonGiftTimer = null;
			if (this.state.phase !== 'dragon_gift') return;
			// Auto-gift to the left opponent
			const leftOpponent = getLeftSeat(seat) as SeatIndex;
			const rightOpponent = getRightSeat(seat) as SeatIndex;
			// Pick whichever opponent is on the opposing team
			const myTeam = getTeam(seat);
			const target = getTeam(leftOpponent) !== myTeam ? leftOpponent : rightOpponent;
			this.giftDragon(seat, target);
		}, TURN_TIMEOUT_MS);
	}

	private clearDragonGiftTimer(): void {
		if (this.dragonGiftTimer) {
			clearTimeout(this.dragonGiftTimer);
			this.dragonGiftTimer = null;
		}
	}

	cleanup(): void {
		if (this.grandTichuTimer) {
			clearTimeout(this.grandTichuTimer);
			this.grandTichuTimer = null;
		}
		if (this.autoAdvanceTimer) {
			clearTimeout(this.autoAdvanceTimer);
			this.autoAdvanceTimer = null;
		}
		this.clearTurnTimer();
		this.clearWishTimer();
		this.clearDragonGiftTimer();
		// Release callback references to prevent memory leaks
		this.onPhaseChange = undefined;
		this.onStateUpdate = undefined;
		this.onCardsDealt = undefined;
		this.onRemainingDealt = undefined;
		this.onExchangeReceived = undefined;
		this.onTrickWon = undefined;
		this.onRoundEnd = undefined;
		this.onGameEnd = undefined;
		this.onError = undefined;
	}
}

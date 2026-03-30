import type { Card, Enemy, Suit, VictoryTier } from './types.js';
import {
	SUITS,
	RANKS,
	MAX_HAND_SIZE,
	TOTAL_ENEMIES,
	JESTER_COUNT,
	CARD_VALUE,
	ENEMY_STATS,
	getCardValue,
	isEnemyRank
} from './types.js';

// ─────────────────────────────────────────────────────────────
// Shuffle
// ─────────────────────────────────────────────────────────────

/** Fisher-Yates shuffle. Mutates and returns the array. */
export function shuffleArray<T>(arr: T[]): T[] {
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr;
}

// ─────────────────────────────────────────────────────────────
// Deck creation
// ─────────────────────────────────────────────────────────────

/** Create the tavern deck: A-10 of all 4 suits (40 cards), shuffled. */
export function createTavernDeck(): Card[] {
	const cards: Card[] = [];

	for (let suitIdx = 0; suitIdx < SUITS.length; suitIdx++) {
		const suit = SUITS[suitIdx];
		for (let rankIdx = 0; rankIdx < RANKS.length; rankIdx++) {
			const rank = RANKS[rankIdx];
			if (!isEnemyRank(rank)) {
				cards.push({ id: suitIdx * 13 + rankIdx, suit, rank });
			}
		}
	}

	return shuffleArray(cards);
}

/**
 * Create the castle deck: 4 Jacks on top, 4 Queens in middle, 4 Kings at bottom.
 * Each tier is independently shuffled. Top of deck = index 0.
 */
export function createCastleDeck(): Card[] {
	const jacks: Card[] = [];
	const queens: Card[] = [];
	const kings: Card[] = [];

	for (let suitIdx = 0; suitIdx < SUITS.length; suitIdx++) {
		const suit = SUITS[suitIdx];
		const jIdx = RANKS.indexOf('J');
		const qIdx = RANKS.indexOf('Q');
		const kIdx = RANKS.indexOf('K');
		jacks.push({ id: suitIdx * 13 + jIdx, suit, rank: 'J' });
		queens.push({ id: suitIdx * 13 + qIdx, suit, rank: 'Q' });
		kings.push({ id: suitIdx * 13 + kIdx, suit, rank: 'K' });
	}

	shuffleArray(jacks);
	shuffleArray(queens);
	shuffleArray(kings);

	// Top of deck (index 0) = Jacks first, then Queens, then Kings at bottom
	return [...jacks, ...queens, ...kings];
}

/**
 * Draw cards from the top of the tavern deck into the hand,
 * respecting MAX_HAND_SIZE.
 */
export function drawCards(
	tavern: Card[],
	count: number,
	currentHand: Card[]
): { hand: Card[]; tavern: Card[] } {
	const available = Math.min(count, tavern.length, MAX_HAND_SIZE - currentHand.length);
	const drawn = tavern.splice(0, available);
	return {
		hand: [...currentHand, ...drawn],
		tavern
	};
}

// ─────────────────────────────────────────────────────────────
// Play validation
// ─────────────────────────────────────────────────────────────

/**
 * Check if a set of cards is a valid play:
 * - Single card: always valid
 * - Same-rank combo: 2-4 cards of same rank, total value <= 10
 * - Ace pair: exactly 1 Ace + 1 non-Ace card
 * - Two Aces: valid (A+A = 2)
 */
export function isValidPlay(cards: Card[]): boolean {
	if (cards.length === 0) return false;
	if (cards.length === 1) return true;

	const totalValue = cards.reduce((sum, c) => sum + getCardValue(c), 0);
	const aceCount = cards.filter((c) => c.rank === 'A').length;

	// Aces: can only PAIR (exactly 2 cards). Cannot form combos of 3+.
	// Valid: A+A, A+non-ace
	if (aceCount > 0) {
		if (cards.length !== 2) return false;
		return true; // A+A or A+other (any single card)
	}

	// Same-rank combo (non-ace): 2-4 cards, total value <= 10
	const allSameRank = cards.every((c) => c.rank === cards[0].rank);
	if (allSameRank && cards.length >= 2 && cards.length <= 4) {
		return totalValue <= 10;
	}

	return false;
}

/** Sum of all card values in the play. */
export function getAttackValue(cards: Card[]): number {
	return cards.reduce((sum, c) => sum + getCardValue(c), 0);
}

/** Get deduplicated suits from the played cards. */
export function getUniqueSuits(cards: Card[]): Suit[] {
	const seen = new Set<Suit>();
	for (const card of cards) {
		seen.add(card.suit);
	}
	return Array.from(seen);
}

// ─────────────────────────────────────────────────────────────
// Immunity
// ─────────────────────────────────────────────────────────────

/** A suit power is immune (nullified) if the enemy's suit matches the card suit. */
export function isImmune(enemySuit: Suit, cardSuit: Suit): boolean {
	return enemySuit === cardSuit;
}

// ─────────────────────────────────────────────────────────────
// Suit powers
// ─────────────────────────────────────────────────────────────

/**
 * Hearts: Shuffle discard pile, move up to `attackVal` cards from discard
 * to the BOTTOM of the tavern deck.
 */
export function applyHeartsPower(
	attackVal: number,
	discardPile: Card[],
	tavernDeck: Card[]
): { discardPile: Card[]; tavernDeck: Card[] } {
	if (discardPile.length === 0) return { discardPile, tavernDeck };

	shuffleArray(discardPile);
	const moveCount = Math.min(attackVal, discardPile.length);
	const moved = discardPile.splice(0, moveCount);
	tavernDeck.push(...moved);

	return { discardPile, tavernDeck };
}

/**
 * Diamonds: Draw up to `attackVal` cards from tavern to hand,
 * respecting MAX_HAND_SIZE.
 */
export function applyDiamondsPower(
	attackVal: number,
	hand: Card[],
	tavernDeck: Card[]
): { hand: Card[]; tavernDeck: Card[] } {
	const drawCount = Math.min(attackVal, tavernDeck.length, MAX_HAND_SIZE - hand.length);
	const drawn = tavernDeck.splice(0, drawCount);
	hand.push(...drawn);
	return { hand, tavernDeck };
}

/** Clubs: Return doubled damage value. */
export function applyClubsPower(attackVal: number): number {
	return attackVal * 2;
}

/** Spades: Return new cumulative shield value. */
export function applySpadesPower(attackVal: number, currentShield: number): number {
	return currentShield + attackVal;
}

// ─────────────────────────────────────────────────────────────
// Combo suit power resolution
// ─────────────────────────────────────────────────────────────

export interface SuitPowerResult {
	hand: Card[];
	tavernDeck: Card[];
	discardPile: Card[];
	newShield: number;
	damageMultiplier: number;
	immuneSuits: Suit[];
	activatedPowers: Suit[];
}

/**
 * Resolve all suit powers from the played cards against the current enemy.
 *
 * Order: Hearts (heal) -> Diamonds (draw) -> Clubs (double) -> Spades (shield).
 * Each unique suit fires once at the TOTAL attack value.
 * Enemy immunity: if enemy suit === card suit, that power is skipped.
 */
export function resolveSuitPowers(
	cards: Card[],
	enemy: Enemy,
	currentShield: number,
	discardPile: Card[],
	tavernDeck: Card[],
	hand: Card[]
): SuitPowerResult {
	const uniqueSuits = getUniqueSuits(cards);
	const attackVal = getAttackValue(cards);
	const immuneSuits: Suit[] = [];
	const activatedPowers: Suit[] = [];
	let newShield = currentShield;
	let damageMultiplier = 1;

	// Ordered resolution: hearts, diamonds, clubs, spades
	const orderedSuits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];

	for (const suit of orderedSuits) {
		if (!uniqueSuits.includes(suit)) continue;

		if (isImmune(enemy.card.suit, suit)) {
			immuneSuits.push(suit);
			continue;
		}

		activatedPowers.push(suit);

		switch (suit) {
			case 'hearts': {
				const result = applyHeartsPower(attackVal, discardPile, tavernDeck);
				discardPile = result.discardPile;
				tavernDeck = result.tavernDeck;
				break;
			}
			case 'diamonds': {
				const result = applyDiamondsPower(attackVal, hand, tavernDeck);
				hand = result.hand;
				tavernDeck = result.tavernDeck;
				break;
			}
			case 'clubs': {
				damageMultiplier = 2;
				break;
			}
			case 'spades': {
				newShield = applySpadesPower(attackVal, newShield);
				break;
			}
		}
	}

	return {
		hand,
		tavernDeck,
		discardPile,
		newShield,
		damageMultiplier,
		immuneSuits,
		activatedPowers
	};
}

// ─────────────────────────────────────────────────────────────
// Damage
// ─────────────────────────────────────────────────────────────

export interface DamageResult {
	enemy: Enemy;
	defeated: boolean;
	exactKill: boolean;
}

/** Deal damage to the enemy. Returns updated enemy and defeat status. */
export function dealDamage(enemy: Enemy, totalDamage: number): DamageResult {
	const newHp = enemy.currentHp - totalDamage;
	enemy.currentHp = newHp;
	const defeated = newHp <= 0;
	const exactKill = newHp === 0;
	return { enemy, defeated, exactKill };
}

// ─────────────────────────────────────────────────────────────
// Enemy defeat
// ─────────────────────────────────────────────────────────────

/**
 * Handle enemy defeat:
 * - Exact kill: enemy card goes to TOP of tavern deck
 * - Overkill: enemy card goes to discard pile
 * - Played cards always go to discard pile
 */
export function defeatEnemy(
	enemyCard: Card,
	exactKill: boolean,
	tavernDeck: Card[],
	discardPile: Card[],
	playedCards: Card[]
): { tavernDeck: Card[]; discardPile: Card[] } {
	if (exactKill) {
		tavernDeck.unshift(enemyCard);
	} else {
		discardPile.push(enemyCard);
	}

	discardPile.push(...playedCards);

	return { tavernDeck, discardPile };
}

// ─────────────────────────────────────────────────────────────
// Flip next enemy
// ─────────────────────────────────────────────────────────────

export interface FlipResult {
	enemy: Enemy;
	castleDeck: Card[];
}

/** Flip the next enemy from the castle deck. Returns null if no enemies left. */
export function flipNextEnemy(castleDeck: Card[]): FlipResult | null {
	if (castleDeck.length === 0) return null;

	const card = castleDeck.shift()!;
	const rank = card.rank as 'J' | 'Q' | 'K';
	const stats = ENEMY_STATS[rank];

	const enemy: Enemy = {
		card,
		maxHp: stats.hp,
		currentHp: stats.hp,
		attack: stats.attack,
		shieldReduction: 0
	};

	return { enemy, castleDeck };
}

// ─────────────────────────────────────────────────────────────
// Enemy attack
// ─────────────────────────────────────────────────────────────

/** Get effective attack after shield reduction. */
export function getEffectiveAttack(enemy: Enemy): number {
	return Math.max(0, enemy.attack - enemy.shieldReduction);
}

/** Sum of all card values in a hand. */
export function getHandValue(hand: Card[]): number {
	return hand.reduce((sum, c) => sum + getCardValue(c), 0);
}

/** Check if the hand has enough total value to survive the enemy attack. */
export function canSurviveAttack(hand: Card[], effectiveAttack: number): boolean {
	if (effectiveAttack <= 0) return true;
	return getHandValue(hand) >= effectiveAttack;
}

/** Validate that the selected discard cards have enough value to absorb the attack. */
export function validateDiscard(selectedCards: Card[], effectiveAttack: number): boolean {
	const totalValue = selectedCards.reduce((sum, c) => sum + getCardValue(c), 0);
	return totalValue >= effectiveAttack;
}

// ─────────────────────────────────────────────────────────────
// Jester (solo mode)
// ─────────────────────────────────────────────────────────────

/**
 * Use a jester: discard entire hand, draw MAX_HAND_SIZE fresh cards.
 */
export function useJester(
	hand: Card[],
	tavernDeck: Card[],
	discardPile: Card[]
): { hand: Card[]; tavernDeck: Card[]; discardPile: Card[] } {
	// Move all hand cards to discard
	discardPile.push(...hand);
	hand = [];

	// Draw MAX_HAND_SIZE cards from tavern
	const drawCount = Math.min(MAX_HAND_SIZE, tavernDeck.length);
	const drawn = tavernDeck.splice(0, drawCount);
	hand = drawn;

	return { hand, tavernDeck, discardPile };
}

// ─────────────────────────────────────────────────────────────
// Win / Lose conditions
// ─────────────────────────────────────────────────────────────

/** Check if all 12 enemies have been defeated. */
export function checkWin(enemiesDefeated: number): boolean {
	return enemiesDefeated >= TOTAL_ENEMIES;
}

/** In solo mode, no yielding allowed. Lose if hand empty AND no jesters left. */
export function checkCanPlay(hand: Card[], jestersRemaining: number): boolean {
	return hand.length > 0 || jestersRemaining > 0;
}

/** Victory tier based on jesters used: 0 = gold, 1 = silver, 2 = bronze. */
export function getVictoryTier(jestersUsed: number): VictoryTier {
	if (jestersUsed === 0) return 'gold';
	if (jestersUsed === 1) return 'silver';
	return 'bronze';
}

// ─────────────────────────────────────────────────────────────
// Game setup
// ─────────────────────────────────────────────────────────────

export interface GameState {
	castleDeck: Card[];
	tavernDeck: Card[];
	discardPile: Card[];
	playerHand: Card[];
	currentEnemy: Enemy | null;
	enemiesDefeated: number;
	currentShield: number;
	jestersRemaining: number;
	jestersUsed: number;
	turnNumber: number;
	playedCardsThisEnemy: Card[];
}

/** Initialize a new game of Regicide (solo mode). */
export function initGame(): GameState {
	const tavernDeck = createTavernDeck();
	let castleDeck = createCastleDeck();

	// Deal initial hand of 8 cards
	const { hand, tavern } = drawCards(tavernDeck, MAX_HAND_SIZE, []);

	// Flip first enemy
	const flipResult = flipNextEnemy(castleDeck);
	const currentEnemy = flipResult ? flipResult.enemy : null;
	castleDeck = flipResult ? flipResult.castleDeck : castleDeck;

	return {
		castleDeck,
		tavernDeck: tavern,
		discardPile: [],
		playerHand: hand,
		currentEnemy,
		enemiesDefeated: 0,
		currentShield: 0,
		jestersRemaining: JESTER_COUNT,
		jestersUsed: 0,
		turnNumber: 1,
		playedCardsThisEnemy: []
	};
}

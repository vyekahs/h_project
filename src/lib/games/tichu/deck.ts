import type { Card } from './types';
import { createAllCards } from './constants';

// Fisher-Yates shuffle
export function shuffle<T>(arr: T[]): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

export function createShuffledDeck(): Card[] {
	return shuffle(createAllCards());
}

// Deal: 8 cards to each player, then 6 more
export function dealFirst8(deck: Card[]): { hands: Card[][]; remaining: Card[] } {
	const hands: Card[][] = [[], [], [], []];
	for (let i = 0; i < 32; i++) {
		hands[i % 4].push(deck[i]);
	}
	return { hands, remaining: deck.slice(32) };
}

export function dealRemaining6(remaining: Card[]): Card[][] {
	const hands: Card[][] = [[], [], [], []];
	for (let i = 0; i < 24; i++) {
		hands[i % 4].push(remaining[i]);
	}
	return hands;
}

export function findCardById(cards: Card[], id: string): Card | undefined {
	return cards.find(c => c.id === id);
}

export function removeCardById(cards: Card[], id: string): Card[] {
	return cards.filter(c => c.id !== id);
}

export function hasMahjong(hand: Card[]): boolean {
	return hand.some(c => c.type === 'special' && c.special === 'mahjong');
}

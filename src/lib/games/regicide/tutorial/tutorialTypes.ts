import type { Card, Enemy, TurnPhase } from '../types';

export interface TutorialStep {
	id: string;
	guidance: {
		title: string;
		message: string; // supports HTML
		position: 'top' | 'center' | 'bottom';
	};
	/** Card IDs to highlight with pulse in player hand */
	highlightCardIds?: number[];
	/** What the player must do */
	expectedAction: TutorialAction;
	/** Override game state at the START of this step (before player acts) */
	stateOverride?: Partial<TutorialGameState>;
}

export type TutorialAction =
	| { type: 'tap_next' }
	| { type: 'play_cards'; cardIds: number[] }
	| { type: 'any_play' }
	| { type: 'discard_cards'; cardIds: number[] }
	| { type: 'any_discard' }
	| { type: 'use_jester' };

export interface TutorialGameState {
	playerHand: Card[];
	currentEnemy: Enemy;
	castleDeck: Card[];
	tavernDeck: Card[];
	discardPile: Card[];
	currentShield: number;
	jestersRemaining: number;
	playedCardsThisEnemy: Card[];
	turnPhase: TurnPhase;
	enemiesDefeated: number;
	turnNumber: number;
}

export interface TutorialScenario {
	title: string;
	initialState: TutorialGameState;
	steps: TutorialStep[];
}

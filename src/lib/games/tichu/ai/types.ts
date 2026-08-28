import type { Card, Combination, SeatIndex, TichuPlayer, TichuRoundResult, WishState, Trick } from '../types';

// ===== AI Strategy Presets =====

/** Strategy presets the user can assign to their partner AI */
export type AiStrategy = 'aggressive' | 'balanced' | 'defensive' | 'tricky' | 'wild';

/** AI turn processing speed */
export type AiSpeed = 'fast' | 'normal' | 'slow' | 'very_slow';

/** Delay in ms for each AI speed setting */
export const AI_SPEED_DELAYS: Record<AiSpeed, number> = {
	fast: 800,
	normal: 1500,
	slow: 2500,
	very_slow: 4000
};

// ===== Personality Weights =====

/** Internal weights that determine AI behavior. All values 0.0 ~ 1.0 */
export interface PersonalityWeights {
	aggressiveness: number;   // Play strong cards early vs save them
	tichoPropensity: number;  // Likelihood to declare tichu
	bombHolding: number;      // Hold bombs for strategic moments vs play early
	partnerAwareness: number; // Prioritize helping partner finish
	riskTolerance: number;    // Take risks vs play safe
}

// ===== AI Decision Context =====

/** All game information an AI needs to make a decision */
export interface AiDecisionContext {
	hand: Card[];
	trick: Trick | null;
	wish: WishState;
	currentSeat: SeatIndex;
	players: TichuPlayer[];
	finishOrder: SeatIndex[];
	finishedCount: number;
	cumulativeScoreA: number;
	cumulativeScoreB: number;
	completedRounds: TichuRoundResult[];
	roundNumber: number;
}

// ===== Strategy Preset Info (for UI) =====

export interface StrategyPresetInfo {
	id: AiStrategy;
	name: string;
	characterName: string;
	description: string;
	icon: string;
}

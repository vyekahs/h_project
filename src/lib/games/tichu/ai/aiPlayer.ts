import type { Card, SeatIndex, ExchangeCards, Combination } from '../types';
import type { AiStrategy, AiDecisionContext, PersonalityWeights } from './types';
import { getWeightsForStrategy, applyWildVariance } from './presets';
import {
	decideGrandTichu,
	decideSmallTichu,
	selectExchangeCards,
	decidePlay,
	decideWish,
	decideDragonGift,
	shouldPlayBomb
} from './strategy';

export class AiPlayer {
	readonly seat: SeatIndex;
	readonly weights: PersonalityWeights;
	readonly isPartner: boolean;

	constructor(seat: SeatIndex, strategy: AiStrategy, isPartner: boolean) {
		this.seat = seat;
		this.isPartner = isPartner;

		let weights = getWeightsForStrategy(strategy);
		// Apply random variance for the 'wild' strategy
		if (strategy === 'wild') {
			weights = applyWildVariance(weights);
		}
		this.weights = weights;
	}

	makeGrandTichuDecision(hand8: Card[]): boolean {
		return decideGrandTichu(hand8, this.weights);
	}

	makeSmallTichuDecision(hand: Card[], context: AiDecisionContext): boolean {
		return decideSmallTichu(hand, this.weights, context);
	}

	makeExchangeDecision(hand: Card[]): ExchangeCards {
		return selectExchangeCards(hand, this.seat, this.weights);
	}

	makePlayDecision(context: AiDecisionContext): string[] | 'pass' {
		return decidePlay(context, this.weights);
	}

	makeWishDecision(hand: Card[], context: AiDecisionContext): number | null {
		return decideWish(hand, this.weights, context);
	}

	makeDragonGiftDecision(context: AiDecisionContext): SeatIndex {
		return decideDragonGift(context, this.seat, this.weights);
	}

	checkBombInterrupt(
		context: AiDecisionContext,
		lastPlay: { seat: SeatIndex; combination: Combination }
	): Combination | null {
		return shouldPlayBomb(context, this.weights, lastPlay);
	}
}

import type { Card, SeatIndex, ExchangeCards, Combination } from '../types';
import type { AiStrategy, AiDecisionContext, PersonalityWeights } from './types';
import type { PresetBehavior } from './presets/types';
import { getWeightsForStrategy, applyWildVariance, getBehaviorForStrategy } from './presets';
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
	readonly behavior: PresetBehavior;
	/** 교환 때 상대에게 준 카드 랭크 기록 (wish 결정에 사용) */
	givenToOpponents: number[] = [];

	static fromWeights(seat: SeatIndex, weights: PersonalityWeights, isPartner: boolean, behavior?: PresetBehavior): AiPlayer {
		const player = Object.create(AiPlayer.prototype) as AiPlayer;
		(player as any).seat = seat;
		(player as any).weights = weights;
		(player as any).isPartner = isPartner;
		(player as any).behavior = behavior ?? {};
		(player as any).givenToOpponents = [];
		return player;
	}

	constructor(seat: SeatIndex, strategy: AiStrategy, isPartner: boolean) {
		this.seat = seat;
		this.isPartner = isPartner;
		this.behavior = getBehaviorForStrategy(strategy);

		let weights = getWeightsForStrategy(strategy);
		// Apply random variance for the 'wild' strategy
		if (strategy === 'wild') {
			weights = applyWildVariance(weights);
		}
		this.weights = weights;
	}

	makeGrandTichuDecision(hand8: Card[]): boolean {
		return decideGrandTichu(hand8, this.weights, this.behavior);
	}

	makeSmallTichuDecision(hand: Card[], context: AiDecisionContext): boolean {
		return decideSmallTichu(hand, this.weights, context, this.behavior);
	}

	makeExchangeDecision(hand: Card[], partnerDeclaredTichu: boolean = false): ExchangeCards {
		return selectExchangeCards(hand, this.seat, this.weights, this.behavior, partnerDeclaredTichu);
	}

	makePlayDecision(context: AiDecisionContext): string[] | 'pass' {
		return decidePlay(context, this.weights, this.behavior);
	}

	makeWishDecision(hand: Card[], context: AiDecisionContext): number | null {
		return decideWish(hand, this.weights, context, this.behavior, this.givenToOpponents);
	}

	makeDragonGiftDecision(context: AiDecisionContext): SeatIndex {
		return decideDragonGift(context, this.seat, this.weights, this.behavior);
	}

	checkBombInterrupt(
		context: AiDecisionContext,
		lastPlay: { seat: SeatIndex; combination: Combination }
	): Combination | null {
		return shouldPlayBomb(context, this.weights, lastPlay, this.behavior);
	}
}

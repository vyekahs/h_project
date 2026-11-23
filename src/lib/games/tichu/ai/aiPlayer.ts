import type { Card, SeatIndex, ExchangeCards, Combination } from '../types';
import type { AiStrategy, AiDecisionContext, PersonalityWeights } from './types';
import type { PresetBehavior } from './presets/types';
import { getWeightsForStrategy, applyWildVariance, getBehaviorForStrategy } from './presets';
import { __deterministic } from './strategy';
import { decideHumanPlay, getHumanModel, loadHumanModel } from './humanModel';
import { decideOwnTrickBomb } from './habits';
import { refineWithLogic, defersBombToTurn, soleActiveOpponent } from './certain';
import { DEFAULT_HABITS } from './presets/types';
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
	readonly strategy: AiStrategy;
	readonly weights: PersonalityWeights;
	readonly isPartner: boolean;
	readonly behavior: PresetBehavior;
	/** 교환 때 상대에게 준 카드 랭크 기록 (wish 결정에 사용) */
	givenToOpponents: number[] = [];

	/**
	 * 저장된 weights로부터 AiPlayer를 복원 (variance가 적용된 wild 등도 그대로 복원).
	 * behavior는 항상 strategy 기준으로 다시 로드하여 프리셋 고유 행동을 보존한다.
	 */
	static fromWeights(seat: SeatIndex, strategy: AiStrategy, weights: PersonalityWeights, isPartner: boolean): AiPlayer {
		void loadHumanModel();
		const player = Object.create(AiPlayer.prototype) as AiPlayer;
		(player as any).seat = seat;
		(player as any).strategy = strategy;
		(player as any).weights = weights;
		(player as any).isPartner = isPartner;
		(player as any).behavior = getBehaviorForStrategy(strategy);
		(player as any).givenToOpponents = [];
		return player;
	}

	constructor(seat: SeatIndex, strategy: AiStrategy, isPartner: boolean) {
		void loadHumanModel();
		this.seat = seat;
		this.strategy = strategy;
		this.isPartner = isPartner;
		this.behavior = getBehaviorForStrategy(strategy);

		let weights = getWeightsForStrategy(strategy);
		// Apply random variance for the 'wild' strategy
		if (strategy === 'wild' && !__deterministic.on) {
			weights = applyWildVariance(weights);
		}
		this.weights = weights;
	}

	makeGrandTichuDecision(hand8: Card[], context?: AiDecisionContext): boolean {
		return decideGrandTichu(hand8, this.weights, this.behavior, context);
	}

	makeSmallTichuDecision(hand: Card[], context: AiDecisionContext): boolean {
		return decideSmallTichu(hand, this.weights, context, this.behavior);
	}

	makeExchangeDecision(hand: Card[], partnerDeclaredTichu: boolean = false, selfDeclaredTichu: boolean = false, selfDeclaredGrandTichu: boolean = false, grandTichuOpponent: 'left' | 'right' | null = null): ExchangeCards {
		return selectExchangeCards(hand, this.seat, this.weights, this.behavior, partnerDeclaredTichu, selfDeclaredTichu, selfDeclaredGrandTichu, grandTichuOpponent);
	}

	makePlayDecision(context: AiDecisionContext): string[] | 'pass' {
		// 계산으로 답이 정해지는 순간(둘만 남았을 때, 확실한 마무리)에는 고른 수를 검산한다 (certain.ts)
		return refineWithLogic(context, this.pickPlay(context));
	}

	private pickPlay(context: AiDecisionContext): string[] | 'pass' {
		// 카드 내기는 사람 기록으로 학습한 모델이 고른다 (humanModel.ts).
		// 모델이 아직 안 왔거나 다루지 않는 경우(소원 강제 등)는 규칙 AI.
		const model = getHumanModel();
		if (model) {
			const d = decideHumanPlay(context, model, this.strategy);
			if (d !== null) return d;
		}
		return decidePlay(context, this.weights, this.behavior);
	}

	makeWishDecision(hand: Card[], context: AiDecisionContext): number | null {
		return decideWish(hand, this.weights, context, this.behavior, this.givenToOpponents);
	}

	makeDragonGiftDecision(context: AiDecisionContext): SeatIndex {
		return soleActiveOpponent(context, this.seat) ?? decideDragonGift(context, this.seat, this.weights, this.behavior);
	}

	/** 방금 내가 낸 카드 위에 폭탄을 얹어 바로 나갈지 (habits.ts) */
	checkOwnTrickBomb(hand: Card[]): Combination | null {
		return decideOwnTrickBomb(hand, this.behavior.habits ?? DEFAULT_HABITS);
	}

	checkBombInterrupt(
		context: AiDecisionContext,
		lastPlay: { seat: SeatIndex; combination: Combination }
	): Combination | null {
		if (defersBombToTurn(context, lastPlay.seat)) return null;
		return shouldPlayBomb(context, this.weights, lastPlay, this.behavior);
	}
}

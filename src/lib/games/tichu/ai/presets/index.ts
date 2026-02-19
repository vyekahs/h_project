import type { AiStrategy, PersonalityWeights, StrategyPresetInfo } from '../types';
import type { PresetBehavior } from './types';
import { wildBehavior } from './wild';
import { defensiveBehavior } from './defensive';
import { trickyBehavior } from './tricky';
import { aggressiveBehavior } from './aggressive';
import { balancedBehavior } from './balanced';

/** Maps each strategy preset to its personality weights */
const STRATEGY_WEIGHTS: Record<AiStrategy, PersonalityWeights> = {
	aggressive: {
		aggressiveness: 0.9,
		tichoPropensity: 0.8,
		bombHolding: 0.3,
		partnerAwareness: 0.4,
		riskTolerance: 0.85
	},
	balanced: {
		aggressiveness: 0.5,
		tichoPropensity: 0.5,
		bombHolding: 0.5,
		partnerAwareness: 0.6,
		riskTolerance: 0.5
	},
	defensive: {
		aggressiveness: 0.2,
		tichoPropensity: 0.15,
		bombHolding: 0.8,
		partnerAwareness: 0.7,
		riskTolerance: 0.2
	},
	tricky: {
		aggressiveness: 0.6,
		tichoPropensity: 0.5,
		bombHolding: 0.9,
		partnerAwareness: 0.8,
		riskTolerance: 0.6
	},
	wild: {
		aggressiveness: 0.7,
		tichoPropensity: 0.6,
		bombHolding: 0.4,
		partnerAwareness: 0.3,
		riskTolerance: 0.9
	}
};

/** Preset-specific behavior overrides */
const BEHAVIORS: Partial<Record<AiStrategy, PresetBehavior>> = {
	wild: wildBehavior,
	defensive: defensiveBehavior,
	tricky: trickyBehavior,
	aggressive: aggressiveBehavior,
	balanced: balancedBehavior
};

/** Get personality weights for a strategy preset */
export function getWeightsForStrategy(strategy: AiStrategy): PersonalityWeights {
	return { ...STRATEGY_WEIGHTS[strategy] };
}

/** Get behavior overrides for a strategy (empty object = all default) */
export function getBehaviorForStrategy(strategy: AiStrategy): PresetBehavior {
	return BEHAVIORS[strategy] ?? {};
}

/** Get a random strategy for opponent AI (exclude already-used strategies) */
export function getRandomStrategy(exclude: AiStrategy[] = []): AiStrategy {
	const all: AiStrategy[] = ['aggressive', 'balanced', 'defensive', 'tricky', 'wild'];
	const available = all.filter(s => !exclude.includes(s));
	const pool = available.length > 0 ? available : all;
	return pool[Math.floor(Math.random() * pool.length)];
}

/** Add random variance to weights for the 'wild' strategy */
export function applyWildVariance(weights: PersonalityWeights): PersonalityWeights {
	const vary = (v: number) => Math.max(0, Math.min(1, v + (Math.random() - 0.5) * 0.4));
	return {
		aggressiveness: vary(weights.aggressiveness),
		tichoPropensity: vary(weights.tichoPropensity),
		bombHolding: vary(weights.bombHolding),
		partnerAwareness: vary(weights.partnerAwareness),
		riskTolerance: vary(weights.riskTolerance)
	};
}

/** 프리셋별 캐릭터 이름 */
const STRATEGY_NAMES: Record<AiStrategy, string> = {
	aggressive: '아랭',
	balanced: '모피',
	defensive: '이리',
	tricky: '메모',
	wild: 'Q'
};

/** Get character name for a strategy preset */
export function getNameForStrategy(strategy: AiStrategy): string {
	return STRATEGY_NAMES[strategy];
}

/** Strategy preset info for the setup UI (가나다순) */
export const STRATEGY_PRESETS: StrategyPresetInfo[] = [
	{
		id: 'tricky',
		name: '전략적',
		characterName: '메모',
		description: '점수를 계산하며 효율적으로 플레이합니다',
		icon: '🎯'
	},
	{
		id: 'balanced',
		name: '밸런스',
		characterName: '모피',
		description: '상황에 따라 균형 잡힌 플레이를 합니다',
		icon: '⚖️'
	},
	{
		id: 'aggressive',
		name: '공격적',
		characterName: '아랭',
		description: '티츄를 적극 선언하고 빠르게 나갑니다',
		icon: '⚔️'
	},
	{
		id: 'defensive',
		name: '수비적',
		characterName: '이리',
		description: '파트너를 서포트하며 안전하게 플레이합니다',
		icon: '🛡️'
	},
	{
		id: 'wild',
		name: '변칙적',
		characterName: 'Q',
		description: '자기 위주로 플레이하며 파트너를 무시합니다',
		icon: '🎲'
	}
];

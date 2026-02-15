import type { AiStrategy, PersonalityWeights, StrategyPresetInfo } from './types';

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
	cautious: {
		aggressiveness: 0.3,
		tichoPropensity: 0.2,
		bombHolding: 0.6,
		partnerAwareness: 0.5,
		riskTolerance: 0.15
	},
	wild: {
		aggressiveness: 0.7,
		tichoPropensity: 0.6,
		bombHolding: 0.4,
		partnerAwareness: 0.3,
		riskTolerance: 0.9
	}
};

/** Get personality weights for a strategy preset */
export function getWeightsForStrategy(strategy: AiStrategy): PersonalityWeights {
	return { ...STRATEGY_WEIGHTS[strategy] };
}

/** Get a random strategy for opponent AI */
export function getRandomStrategy(): AiStrategy {
	const strategies: AiStrategy[] = ['aggressive', 'balanced', 'defensive', 'tricky', 'cautious', 'wild'];
	return strategies[Math.floor(Math.random() * strategies.length)];
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

/** Strategy preset info for the setup UI */
export const STRATEGY_PRESETS: StrategyPresetInfo[] = [
	{
		id: 'aggressive',
		name: '공격적',
		description: '강한 카드를 먼저 내고, 티츄를 자주 선언합니다',
		icon: '⚔️'
	},
	{
		id: 'balanced',
		name: '밸런스',
		description: '상황에 따라 균형 잡힌 플레이를 합니다',
		icon: '⚖️'
	},
	{
		id: 'defensive',
		name: '수비적',
		description: '강한 카드를 아끼고 안전하게 플레이합니다',
		icon: '🛡️'
	},
	{
		id: 'tricky',
		name: '전략적',
		description: '폭탄을 전략적으로 사용하고 파트너를 적극 도웁니다',
		icon: '🎯'
	},
	{
		id: 'cautious',
		name: '신중한',
		description: '확실한 수만 두고 리스크를 최소화합니다',
		icon: '🔍'
	},
	{
		id: 'wild',
		name: '변칙적',
		description: '예측 불가능한 플레이로 상대를 혼란시킵니다',
		icon: '🎲'
	}
];

/**
 * Deal director: 라운드 시작 딜을 "여러 번 공정하게 섞은 뒤 고르는" 방식으로 연출.
 * 카드를 개별 조작하지 않으므로 모든 딜은 실제로 가능한 정상 셔플이다.
 *
 * 정책 1 — 접전 유도(양방향 러버밴드): 점수차에 비례해 플레이어 손패 강도의 목표
 * 백분위를 이동. 지고 있으면 강한 패 쪽으로, 크게 이기고 있으면 약한 패 쪽으로
 * 기울여 게임이 접전으로 흐르게 한다. 확정이 아니라 확률적 편향(지터 포함)이라
 * 지고 있어도 나쁜 패가 나올 수 있다 — 역전이 "진짜 역전"으로 느껴지려면 필요.
 *
 * 정책 2 — 화끈한 패 이벤트: 낮은 확률로 큰 후보 풀에서 최강 패를 뽑아주는 별미.
 * 점수 상황과 무관하게 발동하며, 연속 발동 방지 쿨다운만 있다.
 */
import type { Card } from './types';
import { createShuffledDeck } from './deck';
import { evaluateHandStrength } from './ai/handEvaluator';

export interface DirectedDeal {
	deck: Card[];
	/** 화끈한 패 이벤트로 뽑힌 딜인지 (쿨다운 추적용) */
	special: boolean;
}

/** 접전 유도용 후보 셔플 수 */
const CANDIDATES = 15;
/** 화끈한 패 이벤트용 후보 셔플 수 (풀이 클수록 최강 패가 더 화끈해짐) */
const SPECIAL_CANDIDATES = 30;
/** 라운드당 화끈한 패 이벤트 발동 확률 */
const SPECIAL_CHANCE = 0.08;
/** 이벤트 후 최소 이 라운드 수만큼 지나야 재발동 */
const SPECIAL_COOLDOWN_ROUNDS = 3;
/** 뽑힌 최강 패가 이 강도 미만이면 이벤트 취소하고 일반 편향으로 폴백.
 *  무작위 14장 강도 분포(3000회 실측): 중앙값 22, p95=43, p99=51, 최대 64 —
 *  45는 상위 3~4%로 폭탄/그랜드티츄급 손패에 해당 */
const SPECIAL_MIN_STRENGTH = 45;
/** 점수차가 이 값일 때 백분위 편향이 최대에 도달 */
const GAP_SCALE = 400;
/** 최대 백분위 편향 (0.5 ± 0.3 → [0.2, 0.8]) */
const MAX_BIAS = 0.3;
/** 목표 백분위에 더해지는 무작위 지터 폭 (±0.15) */
const JITTER = 0.3;

/**
 * dealFirst8/dealRemaining6 모두 i%4 순환 배분이므로,
 * 덱에서 인덱스 ≡ 0 (mod 4)인 카드가 최종적으로 seat 0(인간)의 14장이 된다.
 */
function humanHandOf(deck: Card[]): Card[] {
	return deck.filter((_, i) => i % 4 === 0);
}

/**
 * @param scoreGap 우리팀 누적점수 − 상대팀 누적점수 (양수 = 이기는 중)
 * @param roundsSinceSpecial 마지막 화끈한 패 이벤트 후 지난 라운드 수
 */
export function pickDirectedDeck(scoreGap: number, roundsSinceSpecial: number): DirectedDeal {
	// 정책 2: 화끈한 패 이벤트 (점수 상황 무관, 쿨다운만 적용)
	if (roundsSinceSpecial >= SPECIAL_COOLDOWN_ROUNDS && Math.random() < SPECIAL_CHANCE) {
		let bestDeck: Card[] | null = null;
		let bestStrength = -1;
		for (let i = 0; i < SPECIAL_CANDIDATES; i++) {
			const deck = createShuffledDeck();
			const strength = evaluateHandStrength(humanHandOf(deck));
			if (strength > bestStrength) {
				bestStrength = strength;
				bestDeck = deck;
			}
		}
		if (bestDeck && bestStrength >= SPECIAL_MIN_STRENGTH) {
			return { deck: bestDeck, special: true };
		}
		// 임계 미달 → 일반 접전 유도로 폴백
	}

	// 정책 1: 접전 유도
	const candidates: { deck: Card[]; strength: number }[] = [];
	for (let i = 0; i < CANDIDATES; i++) {
		const deck = createShuffledDeck();
		candidates.push({ deck, strength: evaluateHandStrength(humanHandOf(deck)) });
	}
	candidates.sort((a, b) => a.strength - b.strength);

	const bias = Math.max(-1, Math.min(1, scoreGap / GAP_SCALE));
	const target = 0.5 - bias * MAX_BIAS;
	const jitter = (Math.random() - 0.5) * JITTER;
	const percentile = Math.max(0, Math.min(1, target + jitter));
	const idx = Math.round(percentile * (candidates.length - 1));
	return { deck: candidates[idx].deck, special: false };
}

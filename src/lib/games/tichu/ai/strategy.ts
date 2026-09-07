import type { Card, Combination, SeatIndex, ExchangeCards, WishState, NormalCard } from '../types';
import type { AiDecisionContext, PersonalityWeights } from './types';
import type { PresetBehavior } from './presets/types';
import { getTeam, getPartnerSeat, getLeftSeat, getRightSeat, getNextActiveSeat } from '../constants';
import { canBeat, isBomb, detectCombination } from '../combinations';
import { mustPlayWishedRank, playFulfillsWish, canPlayWishedCombo } from '../wish';
import {
	evaluateHandStrength,
	findAllPlayableCombinations,
	findBeatablePlays,
	findBombs,
	findOptimalPartition,
	getCardSortRank
} from './handEvaluator';
import {
	buildCardTracker,
	comboLikelyToWin,
	hasOpponentDeclaredTichu,
	type CardTracker
} from './cardTracker';
import { searchBestPlay, calcExitRate, isForcedOutIfLeading } from './playSearchGrid';
import { buildSampleWorlds, evaluateLeadSafety, evaluateTwoTurnFinish, getUnseenCards, type SampledWorld } from './monteCarlo';

// ===== Hand Analysis Helpers =====

interface HandPlan {
	/** All possible combinations from hand */
	allCombos: Combination[];
	/** Multi-card combos (pairs, triples, straights, stairs, full houses) */
	multiCombos: Combination[];
	/** Singles */
	singles: Combination[];
	/** Bombs */
	bombs: Combination[];
	/** Count of cards that are "singletons" (rank appears only once, not in any multi-combo) */
	singletonCount: number;
	/** The worst cards (low singletons) */
	weakSingles: Combination[];
	/** Strong single cards (A, K, dragon, phoenix) */
	strongSingles: Combination[];
	/** Estimated number of turns to empty hand (lower = better) */
	turnsToEmpty: number;
	/** Cards that only exist as singletons (not part of any multi-combo) */
	singletonCards: Card[];
}

function analyzeHand(hand: Card[]): HandPlan {
	const allCombos = findAllPlayableCombinations(hand);
	const singles = allCombos.filter(c => c.type === 'single');
	const bombs = allCombos.filter(c => isBomb(c));
	const multiCombos = allCombos.filter(c => !isBomb(c) && c.type !== 'single');

	// Find cards that appear in multi-card combos
	const cardsInMulti = new Set<string>();
	for (const combo of multiCombos) {
		for (const card of combo.cards) {
			cardsInMulti.add(card.id);
		}
	}

	// Singletons: cards not part of any multi-card combo
	const singletonCards = hand.filter(c => !cardsInMulti.has(c.id));
	const singletonCount = singletonCards.filter(c => {
		if (c.type === 'special') return c.special !== 'dragon' && c.special !== 'phoenix';
		return true;
	}).length;

	const weakSingles = singles
		.filter(c => {
			const card = c.cards[0];
			if (card.type === 'special') return card.special === 'mahjong';
			return card.rank <= 8;
		})
		.sort((a, b) => a.rank - b.rank);

	const strongSingles = singles
		.filter(c => {
			const card = c.cards[0];
			if (card.type === 'special') return card.special === 'dragon' || card.special === 'phoenix';
			return card.rank >= 12;
		})
		.sort((a, b) => b.rank - a.rank);

	// Rough estimate: biggest combos first, then remaining as singles
	const turnsToEmpty = estimateTurnsToEmpty(hand, multiCombos, bombs);

	return { allCombos, multiCombos, singles, bombs, singletonCount, weakSingles, strongSingles, turnsToEmpty, singletonCards };
}

function estimateTurnsToEmpty(hand: Card[], multiCombos: Combination[], bombs: Combination[]): number {
	if (hand.length === 0) return 0;

	// Greedy: pick largest combos first, count turns
	const usedCards = new Set<string>();
	let turns = 0;

	// Sort multi-combos by size descending, then by rank ascending (prefer getting rid of low combos)
	const sorted = [...multiCombos, ...bombs].sort((a, b) => {
		if (b.cards.length !== a.cards.length) return b.cards.length - a.cards.length;
		return a.rank - b.rank;
	});

	for (const combo of sorted) {
		if (combo.cards.every(c => !usedCards.has(c.id))) {
			for (const c of combo.cards) usedCards.add(c.id);
			turns++;
		}
	}

	// Remaining cards are played as singles
	const remainingCount = hand.length - usedCards.size;
	turns += remainingCount;

	return turns;
}

/** Get trick point value */
function getTrickPoints(cards: Card[]): number {
	let points = 0;
	for (const card of cards) {
		if (card.type === 'special') {
			if (card.special === 'dragon') points += 25;
			if (card.special === 'phoenix') points -= 25;
		} else {
			if (card.rank === 5) points += 5;
			if (card.rank === 10 || card.rank === 13) points += 10;
		}
	}
	return points;
}

// ===== Grand Tichu Decision =====

/**
 * Decide whether to declare Grand Tichu based on 8-card hand.
 */
export function decideGrandTichu(hand8: Card[], weights: PersonalityWeights, behavior: PresetBehavior = {}): boolean {
	// Behavior hook
	const override = behavior.shouldDeclareGrandTichu?.(hand8);
	if (override !== null && override !== undefined) return override;

	const strength = evaluateHandStrength(hand8);
	// 임계값은 evaluateHandStrength의 **실제 분포**에 맞춰 보정한 값이다.
	// 무작위 8장 손패 5000회 실측: 중앙값 11.7 / p90 29.9 / p95 35.1 / p99 46.8 / 최대 67.6.
	// 기존 공식(70 - p*25 → 50~66)은 상위 0.5% 이내여야 도달 가능해 사실상 선언이
	// 발생하지 않았음(148라운드 실측 0회). 사람의 그랜드 티츄 선언 빈도는 대략 5~10%.
	// 이후 실측으로 **성공률** 기준 재보정: 선언 시점 손패 강도별 성공률을 모아보니
	// 강도 30 이상 전체는 60.2%인데 38 이상은 65.2%, 42 이상은 67.5%였다.
	// 그랜드는 ±200점이라 60%도 기대값은 양수지만, 부르는 값어치를 내려면 65% 선이 맞다.
	// 48 - p*14 → 공격적 36.8 / 변칙적 39.6 / 밸런스·전략적 41 / 수비적 45.9
	const threshold = 48 - weights.tichoPropensity * 14;
	return strength >= threshold;
}

// ===== Small Tichu Decision =====

/** 스몰 티츄 선언에 요구하는 최소 나가기 효율 */
const SMALL_TICHU_MIN_EXIT_RATE = 0.5;

/**
 * Decide whether to declare Small Tichu based on full 14-card hand.
 */
export function decideSmallTichu(hand: Card[], weights: PersonalityWeights, context: AiDecisionContext, behavior: PresetBehavior = {}): boolean {
	// === 하드 거부: 파트너가 이미 선언함 ===
	// 이 검사는 **프리셋 훅보다 먼저** 와야 한다. 훅이 true를 반환하면 아래 기본 판단이
	// 통째로 건너뛰어지므로, 아래에 두면 '변칙적'처럼 true를 반환하는 프리셋이 파트너의
	// 선언을 무시하고 같이 부른다(실제 발생한 버그).
	// 한 팀이 둘 다 부르면 위험만 두 배가 되고, 한쪽이 먼저 나가는 순간 다른 쪽은
	// 확정 실패라 상방이 없다.
	const partner = context.players.find(p => p.seat === getPartnerSeat(context.currentSeat));
	if (partner?.grandTichu === true || partner?.smallTichu) return false;

	// Behavior hook
	const override = behavior.shouldDeclareSmallTichu?.(hand, context);
	if (override !== null && override !== undefined) return override;

	const strength = evaluateHandStrength(hand);
	// 그랜드 티츄와 동일하게 실제 분포 기준으로 보정.
	// 무작위 14장 손패 5000회 실측: 중앙값 22 / p75 31 / p90 39 / p95 44 / 최대 68.
	// 그 뒤 "선언 빈도"가 아니라 **성공률**로 다시 맞췄다. 41 - p*12.3은 사람과 비슷한
	// 빈도(좌석당 13.9%)를 만들었지만 성공률이 50.6%였다 — 스몰 티츄는 ±100점이므로
	// 50%는 기대값 0, 즉 불러도 그만 안 불러도 그만이다.
	// 그 뒤 실게임에서 임계값을 5씩 올려가며 성공률/빈도 곡선을 직접 측정했다
	// (설정당 1300라운드):
	//   실효 42~48.5 → 54.7% (좌석당 선언율 4.67%)
	//   실효 47~53.5 → 65.0% (2.20%)
	//   실효 52~58.5 → 67.2% (1.06%)
	//   실효 57~63.5 → 85.7% (0.26%, n=14로 신뢰 불가)
	// 성공률을 크게 올리려면 선언 빈도가 사실상 0으로 수렴한다. 65% 지점을 택했다 —
	// ±100점이므로 기대값이 뚜렷하게 양수이면서, 라운드당 누군가 부를 확률이 약 8.5%로
	// 게임에서 티츄가 여전히 보인다.
	// 55 - p*10 → 공격적 47 / 변칙적 49 / 밸런스 50 / 수비적 53.5
	const threshold = 55 - weights.tichoPropensity * 10;

	// Don't declare if someone on opposing team already declared
	const myTeam = getTeam(context.currentSeat);
	const opponentDeclared = context.players.some(
		p => getTeam(p.seat) !== myTeam && (p.grandTichu === true || p.smallTichu)
	);
	if (opponentDeclared && weights.riskTolerance < 0.7) return false;

	// Additional check: analyze hand structure
	const plan = analyzeHand(hand);
	// If too many singletons, hand is weak even if raw score is high
	if (plan.singletonCount >= 5 && weights.riskTolerance < 0.8) return false;
	// If we can empty in few turns, boost confidence
	// 할인폭이 -10이면 임계값이 통째로 무너져(실효 21~29) 약한 손패 선언이 대량으로
	// 새어나왔다. 빨리 비울 수 있다는 건 분명 이점이지만 그 정도는 아니다.
	// === 판정의 주축은 강도가 아니라 나가기 효율(exitRate)이다 ===
	//
	// 스몰 티츄는 14장을 다 보고 부르는데 8장 블라인드인 그랜드보다 성공률이 낮았다
	// (67.4% vs 79.0%). 더 많은 정보를 쥐고 더 못 맞히는 건 판정이 그 정보를
	// 안 쓰고 있다는 뜻이다. 실제로 두 판정 모두 evaluateHandStrength 하나만 봤다.
	//
	// 선언 후 플레이를 exitRate 최대화로 바꾼 뒤부터는(TICHU_EXIT_WEIGHT) 선언 시점의
	// exitRate가 곧 "이 손패로 실제 낼 수 있는 계획의 품질"이 됐다. 그래서 강도는
	// 최소 조건으로만 두고 exitRate를 주 기준으로 삼는다.
	//
	// 실측(설정당 약 1500라운드, 두 번 재현):
	//   현재 방식               70.9% (좌석당 2.74%)
	//   exitRate>=0.46          67.5% (3.28%)
	//   exitRate>=0.50          77.9% (2.45%)  ← 채택. 그랜드(73.3%)를 앞선다
	//   exitRate>=0.54          75.3% (1.33%)
	//   강도 문턱 -18로 완화     65.7% (4.27%)
	//   강도 문턱 -6로 강화      69.0% (0.96%)
	if (strength < threshold - 12) return false;
	// 문턱을 성향에 따라 움직인다. 고정값(0.5)으로 두면 이 게이트가 판정을 지배해서
	// 프리셋별 tichoPropensity가 묻힌다 — 실제로 '공격적'(0.8)과 '밸런스'(0.5)의
	// 선언율이 5.2%로 같아져 "티츄를 적극 선언합니다"라는 설명과 어긋났다.
	const exitGate = SMALL_TICHU_MIN_EXIT_RATE - (weights.tichoPropensity - 0.5) * 0.12;
	if (calcExitRate(hand, buildCardTracker(context)).rate < exitGate) return false;
	return true;
}

// ===== Exchange Card Selection =====

/** 리드를 이겨 선을 되찾을 수 있는 카드 수 (용 · A · 폭탄) */
function countLeadWinners(hand: Card[]): number {
	let n = 0;
	for (const c of hand) {
		if (c.type === 'special' && c.special === 'dragon') n++;
		else if (c.type === 'normal' && (c as NormalCard).rank === 14) n++;
	}
	n += findBombs(hand).length; // 폭탄은 어떤 리드든 되찾을 수 있으므로 1회분
	return n;
}

/**
 * 티츄를 부른 플레이어가 파트너에게 넘길 카드를 고른다.
 *
 * 두 가지를 동시에 지켜야 한다.
 *  1) **구조**: 페어·트리플·스트레이트 등 다장 조합을 깨면 나가는 데 필요한 턴이 늘어난다.
 *  2) **주도권**: T턴 만에 나가려면 그 T번을 실제로 낼 수 있어야 하고, 그러려면
 *     상위 T장의 높은 카드가 필요하다. 턴 수만 보고 고르면 A 싱글처럼
 *     "빼면 턴이 줄어드는" 카드를 넘기게 되는데, 그건 티츄에 가장 필요한 카드다.
 *
 * 둘 다에 걸리지 않는 카드를 "필요 없는 카드"로 보고 그중 가장 높은 것을 반환한다.
 * (파트너에게 가는 카드이므로 높을수록 팀에 이롭다.)
 */
function pickDispensableCardForTichu(hand: Card[], isGrand: boolean): Card | null {
	const partition = findOptimalPartition(hand);

	// === 개(dog) 예외 ===
	// 개는 파트너에게 선을 넘기는 카드라, 티츄를 부른 쪽이 들고 있으면 한 턴이 통째로
	// 낭비된다. 파트너에게 넘기면 파트너가 그걸 내서 나에게 선을 돌려줄 수 있어
	// 교과서적으로는 좋은 수지만, 매번 넘기면 "개를 상납한다"는 인상이 강하다.
	// 그래서 **그랜드 티츄**를 부르고, **개를 넘겨야만 턴 수가 맞아떨어질 때**로 한정한다.
	if (isGrand) {
		const dog = hand.find(c => c.type === 'special' && c.special === 'dog');
		if (dog) {
			// T턴에 나가려면 중간에 선을 T-1번 되찾아야 하고, 그건 리드를 이길 수 있는
			// 카드(용·A·폭탄) 수로 가늠한다.
			const control = countLeadWinners(hand);
			const needWith = partition.turns - 1;      // 개를 든 채로 필요한 선 확보 횟수
			const needWithout = partition.turns - 2;   // 개를 넘기면 턴이 하나 줄어든다
			// 든 채로는 부족하고, 넘기면 충족되는 경우에만 넘긴다
			if (control < needWith && control >= needWithout) return dog;
		}
	}

	const needed = new Set<string>();

	// 1) 다장 조합에 속한 카드는 구조상 필요
	for (const combo of partition.combos) {
		if (combo.cards.length >= 2) {
			for (const c of combo.cards) needed.add(c.id);
		}
	}

	// 2) 선을 잡기 위한 상위 T장은 필요
	const byRank = [...hand].sort((a, b) => getCardSortRank(b) - getCardSortRank(a));
	for (let i = 0; i < Math.min(partition.turns, byRank.length); i++) {
		needed.add(byRank[i].id);
	}

	// 마작은 소원 권한 때문에 유지
	const mahjong = hand.find(c => c.type === 'special' && c.special === 'mahjong');
	if (mahjong) needed.add(mahjong.id);

	// 개는 위 예외 경로로만 넘긴다. 여기서 빼두지 않으면 "필요 없는 카드 중 최고"
	// 규칙에 그대로 걸려서(개의 정렬 순위가 낮은 숫자패보다 높다) 예외를 좁게 만든
	// 의미가 사라진다.
	const dogCard = hand.find(c => c.type === 'special' && c.special === 'dog');
	if (dogCard) needed.add(dogCard.id);

	const dispensable = hand.filter(c => !needed.has(c.id));
	if (dispensable.length === 0) return null; // 호출부가 기본 로직으로 폴백

	dispensable.sort((a, b) => getCardSortRank(b) - getCardSortRank(a));
	return dispensable[0];
}


/**
 * Select 3 cards to exchange: one to partner, one to left, one to right.
 * Strategy: analyze hand structure and get rid of cards that hurt hand cohesion.
 */
export function selectExchangeCards(
	hand: Card[],
	seat: SeatIndex,
	weights: PersonalityWeights,
	behavior: PresetBehavior = {},
	partnerDeclaredTichu: boolean = false,
	/**
	 * 내가 티츄(그랜드 포함)를 선언했는지.
	 * 이전에는 이 정보가 교환 결정에 전혀 전달되지 않아서, 티츄를 부른 AI가
	 * 자기 용/봉/A를 그대로 파트너에게 넘기고 스스로 나갈 수단을 잃었다.
	 */
	selfDeclaredTichu: boolean = false,
	/** 그랜드 티츄인지 — 개(dog)를 넘기는 예외 판단에만 쓴다 */
	selfDeclaredGrandTichu: boolean = false
): ExchangeCards {
	const normalCards = hand.filter(c => c.type === 'normal') as NormalCard[];
	const rankGroups = new Map<number, NormalCard[]>();
	for (const card of normalCards) {
		const group = rankGroups.get(card.rank) || [];
		group.push(card);
		rankGroups.set(card.rank, group);
	}

	// Identify singletons (rank with only 1 card) - these are hard to get rid of
	const singletons = normalCards.filter(c => (rankGroups.get(c.rank)?.length ?? 0) === 1);
	const lowSingletons = singletons
		.filter(c => c.rank <= 9)
		.sort((a, b) => a.rank - b.rank);

	// Cards NOT to give away
	const protectedIds = new Set<string>();
	// Protect dragon, phoenix
	for (const c of hand) {
		if (c.type === 'special' && (c.special === 'dragon' || c.special === 'phoenix')) {
			protectedIds.add(c.id);
		}
	}
	// Protect cards in bombs (four of a kind)
	for (const [, cards] of rankGroups) {
		if (cards.length === 4) {
			for (const c of cards) protectedIds.add(c.id);
		}
	}
	// Protect pairs of high cards (A, K, Q)
	for (const [rank, cards] of rankGroups) {
		if (rank >= 12 && cards.length >= 2) {
			for (const c of cards) protectedIds.add(c.id);
		}
	}

	// === Mahjong protection: 마작은 교환 대상에서 제외 ===
	const mahjongCard = hand.find(c => c.type === 'special' && c.special === 'mahjong');
	if (mahjongCard) {
		protectedIds.add(mahjongCard.id);
	}

	// === Card to give to partner ===
	let toPartner: Card | null = null;

	// Behavior hook: 마작을 파트너에게 줄지 결정 (변칙적만 해당)
	if (mahjongCard && behavior.shouldGiveMahjongToPartner?.(hand)) {
		toPartner = mahjongCard;
		protectedIds.delete(mahjongCard.id); // 마작을 주기로 했으므로 보호 해제
	}

	// === 내가 티츄를 부른 경우 ===
	// 최고 카드를 넘기면 "내가 먼저 나간다"는 계획 자체가 깨진다.
	// 손패를 비우는 최소 턴 수(T)를 실제로 계산해서, 그 계획에 필요 없는 카드 중
	// 가장 높은 것을 준다. 파트너에게도 쓸모 있는 카드가 가고, 내 계획은 유지된다.
	if (!toPartner && selfDeclaredTichu) {
		toPartner = pickDispensableCardForTichu(hand, selfDeclaredGrandTichu);
	}

	// 파트너에게는 무조건 최고 카드를 줌 (페어/트리플이든 상관없이)
	// 용 > 봉 > A > K 순서 (protectedIds 무시)
	if (!toPartner) {
		const dragon = hand.find(c => c.type === 'special' && c.special === 'dragon');
		if (dragon) toPartner = dragon;
	}
	if (!toPartner) {
		const phoenix = hand.find(c => c.type === 'special' && c.special === 'phoenix');
		if (phoenix) toPartner = phoenix;
	}
	if (!toPartner) {
		// A가 있으면 무조건 1장 줌 (페어여도 파트너 지원이 더 중요)
		const aceGroup = rankGroups.get(14);
		if (aceGroup && aceGroup.length > 0) toPartner = aceGroup[0];
	}
	if (!toPartner) {
		// K가 있으면 무조건 1장 줌
		const kingGroup = rankGroups.get(13);
		if (kingGroup && kingGroup.length > 0) toPartner = kingGroup[0];
	}
	if (!toPartner) {
		// Fallback: 가장 강한 카드 (개, 마작 제외)
		const candidates = [...hand]
			.filter(c => !(c.type === 'special' && (c.special === 'dog' || c.special === 'mahjong')))
			.sort((a, b) => getCardSortRank(b) - getCardSortRank(a));
		if (candidates.length > 0) toPartner = candidates[0];
		else toPartner = hand[0];
	}

	// === Cards to give to opponents ===
	// 전략: 5점 카드(5) 선호, 낮은 싱글톤 → 상대에게 줘서 우리 핸드 정리
	const remaining = hand.filter(c => c.id !== toPartner!.id);
	const giveToOpponent: Card[] = [];

	// 5점 카드 싱글톤 우선: 콤보에 속하지 않는 5점 카드만 상대에게 줌
	const fivePointCards = remaining.filter(
		c => c.type === 'normal' && c.rank === 5
			&& !protectedIds.has(c.id)
			&& singletons.some(s => s.id === c.id)
	);
	for (const card of fivePointCards) {
		if (giveToOpponent.length >= 2) break;
		giveToOpponent.push(card);
	}

	// Low singletons
	for (const card of lowSingletons) {
		if (card.id === toPartner!.id) continue;
		if (protectedIds.has(card.id)) continue;
		if (giveToOpponent.some(g => g.id === card.id)) continue;
		if (giveToOpponent.length >= 2) break;
		giveToOpponent.push(card);
	}

	// Fill rest with lowest value cards (연속 랭크 피하기: 스트레이트 도움 방지)
	if (giveToOpponent.length < 2) {
		const sorted = remaining
			.filter(c => !giveToOpponent.some(g => g.id === c.id) && !protectedIds.has(c.id))
			.sort((a, b) => getCardSortRank(a) - getCardSortRank(b));
		// 연속 랭크 피하기: 이미 준 카드 랭크와 인접한 랭크 비선호
		const givenRanks = new Set<number>(giveToOpponent.filter(c => c.type === 'normal').map(c => (c as NormalCard).rank));
		const nonAdjacentFirst = sorted.sort((a, b) => {
			const aRank: number = a.type === 'normal' ? a.rank : 0;
			const bRank: number = b.type === 'normal' ? b.rank : 0;
			const aAdj = givenRanks.has(aRank - 1) || givenRanks.has(aRank + 1) ? 1 : 0;
			const bAdj = givenRanks.has(bRank - 1) || givenRanks.has(bRank + 1) ? 1 : 0;
			if (aAdj !== bAdj) return aAdj - bAdj; // 비인접 우선
			return getCardSortRank(a) - getCardSortRank(b);
		});
		for (const card of nonAdjacentFirst) {
			if (card.type === 'special' && (card.special === 'dragon' || card.special === 'phoenix' || card.special === 'mahjong')) continue;
			if (giveToOpponent.length >= 2) break;
			giveToOpponent.push(card);
		}
	}

	// Final fallback
	if (giveToOpponent.length < 2) {
		const sorted = remaining
			.filter(c => !giveToOpponent.some(g => g.id === c.id))
			.sort((a, b) => getCardSortRank(a) - getCardSortRank(b));
		while (giveToOpponent.length < 2 && sorted.length > 0) {
			giveToOpponent.push(sorted.shift()!);
		}
	}

	return {
		toPartner: toPartner!.id,
		toLeft: giveToOpponent[0].id,
		toRight: giveToOpponent[1].id
	};
}

// ===== Play Decision (Core) =====

/**
 * Decide what to play during the playing phase.
 * Returns card IDs to play, or 'pass'.
 */
export function decidePlay(
	context: AiDecisionContext,
	weights: PersonalityWeights,
	behavior: PresetBehavior = {}
): string[] | 'pass' {
	const { hand, trick, wish, currentSeat, players } = context;
	const myTeam = getTeam(currentSeat);
	const partnerSeat = getPartnerSeat(currentSeat);

	if (!trick || trick.plays.length === 0) {
		// === LEADING ===
		return decideLead(hand, wish, weights, context, behavior);
	}

	// === FOLLOWING ===
	const lastPlay = trick.plays[trick.plays.length - 1];
	const lastCombo = lastPlay.combination;
	const trickLeaderTeam = getTeam(lastPlay.seat);

	const partner = players[partnerSeat];
	const partnerWinning = lastPlay.seat === partnerSeat;

	// If partner is winning the trick
	if (partnerWinning && !isBomb(lastCombo)) {
		// Must play wish if enforced
		if (wish.active && wish.requestedRank !== null && mustPlayWishedRank(hand, wish)) {
			if (canPlayWishedCombo(hand, wish, lastCombo)) {
				return findWishedPlay(hand, wish, lastCombo);
			}
		}

		// 파트너 티츄 선언 → 손패가 1장이어도 양보하고 패스.
		// 기존에는 hand.length > 1 조건이 붙어 있어서, 1장 남은 상태로 파트너의 트릭을
		// 덮어 내며 **내가 먼저 나가버리는** 구멍이 있었다(바로 아래 hand.length === 1 분기).
		// 파트너가 티츄를 불렀으면 파트너가 1등으로 나가야 하므로 내가 먼저 나가면
		// 그 티츄는 확정 실패다.
		const partnerDeclaredTichu = partner.grandTichu === true || partner.smallTichu;
		if (partner.finishOrder === null && partnerDeclaredTichu) {
			return 'pass';
		}
		// 파트너 카드 ≤3장: 티츄가 걸린 게 아니므로 내가 1장이면 같이 나가는 편이 낫다
		// (원투 성립) → 기존대로 hand.length > 1 일 때만 양보
		if (hand.length > 1 && partner.finishOrder === null && partner.hand.length <= 3) {
			return 'pass';
		}

		// If I can finish by playing on partner's trick, do it
		if (hand.length === 1) {
			const myCombo = detectCombination([hand[0]]);
			if (myCombo && canBeat(lastCombo, myCombo)) {
				return [hand[0].id];
			}
		}

		// Behavior hook: 파트너가 이기고 있을 때 행동 오버라이드
		const partnerOverride = behavior.onPartnerWinning?.(hand, lastCombo, context);
		if (partnerOverride !== null && partnerOverride !== undefined) {
			return partnerOverride;
		}

		// partnerAwareness 기반 임계값: 높을수록 파트너 트릭을 더 존중 (낮은 threshold = 더 많이 패스)
		// 0.3(wild)→11, 0.4(aggressive)→10, 0.6(balanced)→8, 0.8(tricky)→6
		const passThreshold = Math.round(14 - weights.partnerAwareness * 10);
		if (lastCombo.rank >= passThreshold) {
			return 'pass';
		}

		// passThreshold 통과: 파트너 트릭을 뺏되, A/K 포함 콤보 및 봉황 포함 콤보는 사용 금지
		const beatableForPartner = findBeatablePlays(hand, lastCombo)
			.filter(c => !isBomb(c))
			.filter(c => !c.cards.some(card => card.type === 'normal' && (card as NormalCard).rank >= 13))
			.filter(c => !c.cards.some(card => card.type === 'special' && card.special === 'phoenix'));

		if (beatableForPartner.length === 0) {
			return 'pass';
		}
		// 뺏되 "지킬 수 있는" 카드로만 뺏는다.
		// 기존에는 무조건 가장 약한 카드로 뺏었는데, 그러면 바로 다음 상대가 손쉽게
		// 다시 뺏어가 파트너가 이기고 있던 트릭을 통째로 상대에게 넘겨주게 된다.
		// (파트너 존중도가 낮은 프리셋일수록 이 경로를 자주 타므로 손해가 누적됐다 —
		//  변칙적 팀 라운드 평균 21점 vs 밸런스 52점)
		const trackerForSteal = buildCardTracker(context);
		const holdable = beatableForPartner
			.filter(c => comboLikelyToWin(c, trackerForSteal, hand) >= 0.6)
			.sort((a, b) => a.rank - b.rank);
		if (holdable.length === 0) {
			return 'pass'; // 지킬 수 없으면 파트너 트릭을 그대로 둔다
		}
		return holdable[0].cards.map(c => c.id);
	}

	// Must play wish if active
	const wishEnforced = wish.active && wish.requestedRank !== null && mustPlayWishedRank(hand, wish);
	if (wishEnforced && canPlayWishedCombo(hand, wish, lastCombo)) {
		const wishedPlay = findWishedPlay(hand, wish, lastCombo);
		if (wishedPlay.length > 0) return wishedPlay;
	}

	// Find all plays that can beat the current trick
	let beatablePlays = findBeatablePlays(hand, lastCombo);
	if (beatablePlays.length === 0) return 'pass';

	// If wish enforcement active, prefer plays that include the wished rank
	if (wishEnforced && canPlayWishedCombo(hand, wish, lastCombo)) {
		const wishedPlays = beatablePlays.filter(c => playFulfillsWish(c.cards, wish));
		if (wishedPlays.length > 0) {
			beatablePlays = wishedPlays;
		}
	}

	// Filter out bombs (handle separately)
	// 파트너 티츄 선언 시 내가 먼저 나가기 억제
	const partnerTichuInFollow = partner.finishOrder === null &&
		(partner.grandTichu === true || partner.smallTichu);
	const iAmCloseToFinishing = hand.length <= 3 && !partnerTichuInFollow;
	// A 트리플/풀하우스는 나갈 수 있는 상황이 아니면 제외
	const nonBombPlays = beatablePlays.filter(c => {
		if (isBomb(c)) return false;
		if (!iAmCloseToFinishing && c.rank === 14 && (c.type === 'triple' || c.type === 'full_house' || c.type === 'stairs' || c.type === 'straight')) return false;
		return true;
	});
	// A 폭탄은 가능하면 사용하지 않음 (A는 싱글 선먹기용으로 보존)
	const allBombPlays = beatablePlays.filter(c => isBomb(c));
	const nonAceBombs = allBombPlays.filter(c => c.rank !== 14);
	const bombPlays = nonAceBombs.length > 0 ? nonAceBombs : allBombPlays;

	// === Situational awareness ===
	const opponentAboutToFinish = players.some(
		p => getTeam(p.seat) !== myTeam && p.finishOrder === null && p.hand.length <= 2
	);
	const partnerAboutToFinish = partner.finishOrder === null && partner.hand.length <= 2;

	// Calculate trick point value
	const trickCards = trick.plays.flatMap(p => p.combination.cards);
	const trickPoints = getTrickPoints(trickCards);

	// Is the opponent who played the last card about to finish?
	const lastPlayer = players[lastPlay.seat];

	// 상대팀 원투(1·2등 동시 완주) 위협: 상대 팀원이 이미 1등으로 나갔고 이 트릭을 리드한
	// 다른 상대가 아직 안 나갔으면, 이 상대가 계속 선을 잡을수록 원투에 가까워진다.
	// 원투는 즉시 라운드 종료 + 200점 손실이라 일반 "곧 나감"보다 훨씬 낮은 문턱으로 막아야 함.
	const oneTwoThreat = trickLeaderTeam !== myTeam &&
		context.finishOrder.length > 0 &&
		getTeam(context.finishOrder[0]) === trickLeaderTeam &&
		lastPlayer.finishOrder === null;
	const lastPlayerAboutToFinish = lastPlayer.finishOrder === null &&
		lastPlayer.hand.length <= (oneTwoThreat ? 5 : 2);

	// 상대(트릭 리더)가 티츄 선언 중인지 — 진행 중인 리드를 그냥 넘겨주면 그 상대의
	// 티츄 성공 가능성이 계속 유지됨
	const lastPlayerTichuActive = lastPlayer.finishOrder === null &&
		(lastPlayer.grandTichu === true || lastPlayer.smallTichu);

	// 우리 팀(나 또는 파트너) 티츄가 살아있는지 — 상대에게 계속 선을 내주면
	// 우리 쪽 티츄 완주 타이밍이 밀릴 수 있음
	const iDeclaredTichuInFollow = players[currentSeat].finishOrder === null &&
		(players[currentSeat].grandTichu === true || players[currentSeat].smallTichu);
	const ourTichuActiveInFollow = iDeclaredTichuInFollow || partnerTichuInFollow;

	// === Bomb decisions ===
	// 주의: "어떤 상대든 손패 2장 이하"라는 이유만으로 이 트릭을 폭탄으로 따는 건 의미가 없다 —
	// 그 상대가 지금 이 트릭의 리더가 아니면(다른 좌석의 카드 상황일 뿐) 이 트릭을 폭탄으로 이겨봤자
	// 그 상대를 막는 것과 전혀 무관하고, 이미 일반 카드(nonBombPlays)로 이길 수 있는 트릭이면
	// 굳이 폭탄을 낭비할 이유가 없다. 실제로 막아야 할 대상은 "지금 이 트릭을 리드한 사람"뿐이므로
	// 아래 lastPlayerAboutToFinish(트릭 리더 특정, 원투 위협 시 문턱 완화) 체크만 사용한다.

	// Use bomb if the last player is about to go out (or about to complete a one-two) and winning the trick
	if (lastPlayerAboutToFinish && trickLeaderTeam !== myTeam && bombPlays.length > 0) {
		return bombPlays.sort((a, b) => a.rank - b.rank)[0].cards.map(c => c.id);
	}

	// Use bomb if trick has very high points AND opponent is winning
	if (trickPoints >= 20 && trickLeaderTeam !== myTeam && bombPlays.length > 0 && weights.aggressiveness > 0.3) {
		return bombPlays.sort((a, b) => a.rank - b.rank)[0].cards.map(c => c.id);
	}

	// === 봉황 싱글 팔로우 제한 ===
	// 봉황 싱글은 "봉황이 탑(이길 카드가 게임에 없음)"일 때만 허용
	const isPhoenixSingle = (c: Combination) =>
		c.type === 'single' && c.cards[0].type === 'special' && c.cards[0].special === 'phoenix';

	let playsForFollow = nonBombPlays;
	if (nonBombPlays.some(isPhoenixSingle)) {
		let phoenixAllowed = hand.length === 1; // 마지막 카드면 무조건 허용

		if (!phoenixAllowed) {
			if (partnerWinning) {
				// 파트너가 이기고 있으면 봉황 싱글 금지 (파트너 트릭 보호)
				phoenixAllowed = false;
			} else {
				// 봉황이 탑인지 확인: 봉황 rank 이상의 카드가 다른 손에 없고 드래곤도 없어야 함
				const tracker = buildCardTracker(context);
				const phoenixRank = Math.ceil(lastCombo.rank + 0.5);
				let higherCardsOut = 0;
				for (let r = phoenixRank; r <= 14; r++) {
					higherCardsOut += tracker.remainingByRank.get(r) || 0;
				}
				if (!tracker.dragonPlayed && !tracker.dragonInMyHand) higherCardsOut++;
				phoenixAllowed = higherCardsOut === 0;
			}
		}

		if (!phoenixAllowed) {
			const filtered = nonBombPlays.filter(c => !isPhoenixSingle(c));
			playsForFollow = filtered;
		}
	}

	if (playsForFollow.length === 0) {
		// Only bombs available — 일반 카드로는 아무도 못 이기는 패
		if (bombPlays.length > 0) {
			// 티츄가 걸린 상황(상대가 선언했거나, 우리 쪽이 선언했거나, 내가 직접 선언)에서는
			// "나중을 위해 아낀다"는 명분이 약해짐 — 상대 티츄면 그 상대의 선을 계속 열어주는 셈이고,
			// 우리 티츄면 계속 상대에게 주도권을 내주는 게 우리 완주 타이밍에 불리하다.
			// 내가 직접 선언한 경우엔 폭탄 사용이 트릭 승리 + 내 손패 4장 이상 소모(완주 전진)를
			// 동시에 달성하므로 더더욱 아낄 이유가 없다.
			const tichuOverridesHold = lastPlayerTichuActive || ourTichuActiveInFollow;
			if (weights.bombHolding > 0.7 && !opponentAboutToFinish && trickPoints < 15 && !tichuOverridesHold) {
				return 'pass'; // Hold bomb for later
			}
			return bombPlays.sort((a, b) => a.rank - b.rank)[0].cards.map(c => c.id);
		}
		return 'pass';
	}

	// === Pick which non-bomb play to make ===
	return pickBestFollow(playsForFollow, hand, weights, context, iAmCloseToFinishing, partnerAboutToFinish, behavior);
}

/**
 * Pick the best card to play when following a trick.
 * Enhanced with situational awareness: seat position, card strength, opponent threat.
 */
function pickBestFollow(
	plays: Combination[],
	hand: Card[],
	weights: PersonalityWeights,
	context: AiDecisionContext,
	iAmClose: boolean,
	partnerClose: boolean,
	behavior: PresetBehavior = {}
): string[] | 'pass' {
	const myTeam = getTeam(context.currentSeat);
	const trick = context.trick!;
	const lastPlay = trick.plays[trick.plays.length - 1];
	const opponentWinning = getTeam(lastPlay.seat) !== myTeam;

	// Sort by rank ascending (weakest first)
	const sorted = [...plays].sort((a, b) => a.rank - b.rank);

	// If I can finish with this play, always play strongest to guarantee the win
	if (iAmClose) {
		const finishingPlays = sorted.filter(p => p.cards.length >= hand.length);
		if (finishingPlays.length > 0) {
			return finishingPlays[finishingPlays.length - 1].cards.map(c => c.id);
		}
		// 1장만 남는 경우: 남는 카드가 리드로 이길 수 있으면 약한 카드로 팔로우
		if (hand.length - sorted[0].cards.length === 1) {
			for (let i = 0; i < sorted.length; i++) {
				const remaining = hand.filter(c => !sorted[i].cards.some(pc => pc.id === c.id));
				if (remaining.length !== 1) continue;
				const lastCard = remaining[0];
				const lastRank = lastCard.type === 'normal'
					? lastCard.rank
					: (lastCard.type === 'special' && lastCard.special === 'dragon') ? 16
					: 0; // Phoenix/Mahjong/Dog은 리드용으로 약함
				// 남는 카드가 A/K/Dragon이면 약한 것으로 팔로우하고 강한 카드 보존
				if (lastRank >= 13) return sorted[i].cards.map(c => c.id);
			}
			// 남는 카드가 약하면 가장 강한 카드로 팔로우 (이번 트릭이라도 확실히 이김)
			return sorted[sorted.length - 1].cards.map(c => c.id);
		}
	}

	// If partner is about to finish, play weakest to let partner get the lead
	if (partnerClose && !opponentWinning) {
		return sorted[0].cards.map(c => c.id);
	}

	// === 그리드 확률 탐색: 팔로우 후보 평가 ===
	const tracker = buildCardTracker(context);
	const gridResults = searchBestPlay(hand, plays, tracker, context, weights, behavior, 'follow');

	if (gridResults.length === 0) {
		return sorted[0].cards.map(c => c.id); // fallback: 가장 약한 카드
	}

	// 근소한 차이의 후보 중 무작위 선택 (사람처럼 매번 같은 수를 두지 않도록)
	const bestResult = pickAmongNearBest(gridResults, weights);

	// 파트너 티츄가 살아있는데 이 수로 내 손패가 비면 패스한다.
	// 아래 mustPlay(상대 차단·고득점 트릭) 예외보다도 우선한다: 상대가 먼저 나가도
	// 파트너 티츄는 실패하지만 그건 어디까지나 **가능성**이고, 내가 나가는 것은
	// **확정 실패**다. 패스는 파트너가 먼저 나갈 여지를 남기므로 지배적이다.
	const partnerTichuLive = context.players[getPartnerSeat(context.currentSeat)].finishOrder === null &&
		(context.players[getPartnerSeat(context.currentSeat)].grandTichu === true ||
			context.players[getPartnerSeat(context.currentSeat)].smallTichu);
	if (partnerTichuLive) {
		const rem = hand.filter(c => !bestResult.combo.cards.some(cc => cc.id === c.id));
		// 손패가 비거나, 남은 패가 "선을 잡으면 나갈 수밖에 없는" 상태면 트릭을 먹지 않는다.
		// 이 트릭을 이겨서 선을 잡는 순간 다음 리드가 강제되기 때문이다.
		if (rem.length === 0 || isForcedOutIfLeading(rem, tracker)) {
			return 'pass';
		}
	}

	// 나갈 수 있으면 무조건 냄
	if (iAmClose) {
		return bestResult.combo.cards.map(c => c.id);
	}

	// === 전략적 패스: 확률이 낮으면 패스 ===
	// 티츄를 부른 쪽은 패스할 때마다 카드를 한 장도 못 뺀다. 먼저 나가야 하는 쪽이
	// 스스로 기회를 버리는 셈이라 문턱을 크게 낮춘다.
	const meForPass = context.players[context.currentSeat];
	const iDeclaredForPass = meForPass.finishOrder === null &&
		(meForPass.grandTichu === true || meForPass.smallTichu);
	const passThreshold = (0.15 + weights.aggressiveness * 0.1) * (iDeclaredForPass ? 0.25 : 1);

	if (bestResult.totalScore < passThreshold) {
		// 단, 패스하면 안 되는 상황 체크
		const trickCards = context.trick!.plays.flatMap(p => p.combination.cards);
		const trickPoints = getTrickPoints(trickCards);

		const mustPlay =
			// 상대가 나가기 직전이면 뺏어야 함 (4장 이하로 확대)
			context.players.some(p => getTeam(p.seat) !== myTeam && p.finishOrder === null && p.hand.length <= 4) ||
			// 티츄 선언 상대가 있으면 반드시 차단
			context.players.some(p =>
				getTeam(p.seat) !== myTeam &&
				(p.grandTichu === true || p.smallTichu) &&
				p.finishOrder === null
			) ||
			// 트릭 포인트가 높으면 뺏어야 함
			(trickPoints >= 15 && getTeam(lastPlay.seat) !== myTeam);

		if (!mustPlay) {
			return 'pass';
		}
	}

	return bestResult.combo.cards.map(c => c.id);
}

/**
 * Decide what to lead with when starting a new trick.
 *
 * Key principles:
 * 1. Get rid of weak combos first (low pairs, short straights)
 * 2. Lead singletons from bottom (low singles) so you don't get stuck with them
 * 3. Save strong cards (A, K, dragon) to take tricks when needed
 * 4. Play dog to give lead to partner when strategic
 * 5. Play large combos to clear hand efficiently
 * 6. Consider what cards opponents likely still have
 */
function decideLead(
	hand: Card[],
	wish: WishState,
	weights: PersonalityWeights,
	context: AiDecisionContext,
	behavior: PresetBehavior = {}
): string[] {
	const partnerSeat = getPartnerSeat(context.currentSeat);
	const partner = context.players[partnerSeat];
	const plan = analyzeHand(hand);
	const tracker = buildCardTracker(context);

	// If wish is active, must lead with wished rank if possible
	if (wish.active && wish.requestedRank !== null && mustPlayWishedRank(hand, wish)) {
		const wishedCards = hand.filter(c => c.type === 'normal' && c.rank === wish.requestedRank);
		if (wishedCards.length > 0) {
			const allCombos = findAllPlayableCombinations(hand);
			const wishedCombos = allCombos.filter(c => playFulfillsWish(c.cards, wish));
			if (wishedCombos.length > 0) {
				// Pick combo that uses the most cards (empty hand faster)
				const sorted = wishedCombos.sort((a, b) => b.cards.length - a.cards.length);
				return sorted[0].cards.map(c => c.id);
			}
			return [wishedCards[0].id];
		}
	}

	// === 마작 최우선 소모: 개(dog)보다 먼저 처리 ===
	const hasMahjong = hand.some(c => c.type === 'special' && c.special === 'mahjong');
	if (hasMahjong) {
		// 마작이 포함된 스트레이트가 있으면 그것을 우선 사용
		const mahjongStraights = plan.allCombos.filter(
			c => c.type === 'straight' && c.cards.some(card => card.type === 'special' && card.special === 'mahjong')
		);
		if (mahjongStraights.length > 0) {
			// 가장 긴 스트레이트 선택 (카드 많이 처리)
			mahjongStraights.sort((a, b) => b.cards.length - a.cards.length);
			return mahjongStraights[0].cards.map(c => c.id);
		}
		// 스트레이트가 없으면 마작 싱글
		const mahjongCard = hand.find(c => c.type === 'special' && c.special === 'mahjong')!;
		return [mahjongCard.id];
	}

	// === Dog play: give lead to partner ===
	const dogCard = hand.find(c => c.type === 'special' && c.special === 'dog');
	if (dogCard && partner && partner.finishOrder === null) {
		// Behavior hook: dog 플레이 오버라이드
		const dogOverride = behavior.shouldPlayDog?.(hand, partner, context);
		if (dogOverride === true) {
			return [dogCard.id];
		} else if (dogOverride === false) {
			// Don't play dog — skip to normal lead
		} else {
			// null = default logic
			const partnerDeclaredTichu = partner.grandTichu === true || partner.smallTichu;
			const partnerHasFewCards = partner.hand.length <= 5;
			const myHandIsBad = plan.singletonCount >= 4;

			// Play dog when partner declared tichu
			if (partnerDeclaredTichu) {
				return [dogCard.id];
			}
			// Play dog when partner has few cards and we're aware
			if (partnerHasFewCards && weights.partnerAwareness > 0.3) {
				return [dogCard.id];
			}
			// Play dog when our hand is bad and we trust partner
			if (myHandIsBad && weights.partnerAwareness > 0.5 && hand.length > 3) {
				return [dogCard.id];
			}
			// Play dog when we have many cards and partner has fewer (partner is in better position)
			if (hand.length >= 10 && partner.hand.length <= 8 && weights.partnerAwareness > 0.4) {
				return [dogCard.id];
			}
		}
	}

	// === Close to finishing: play the combo that empties our hand ===
	// 파트너가 티츄 선언하고 아직 안 나갔으면 → 내가 먼저 나가지 않음
	const partnerForEndgame = context.players[getPartnerSeat(context.currentSeat)];
	const partnerTichuActive = partnerForEndgame.finishOrder === null &&
		(partnerForEndgame.grandTichu === true || partnerForEndgame.smallTichu);
	if (hand.length <= 5 && !partnerTichuActive) {
		const endgameResult = decideLeadEndgame(hand, plan, weights, context, behavior);
		if (endgameResult.length > 0) return endgameResult;
	}

	// Behavior hook: 드래곤 리드 사용 조건
	const dragonLeadAllowed = behavior.shouldLeadDragon?.(hand, context);

	// === 다음 플레이어가 상대이고 카드 1장 남았으면: 이길 확률 낮은 일반 싱글은 리드에서 원천 배제 ===
	// (playSearchGrid의 소프트 페널티만으로는 "약한 카드부터 리드"라는 기본 성향에 밀려
	//  실제로 걸러지지 않는 경우가 있어, 리드 후보 단계에서 하드 필터로 확실히 막음)
	const myTeamForLead = getTeam(context.currentSeat);
	const nextSeatForLead = getNextActiveSeat(context.currentSeat, context.players) as SeatIndex;
	const nextPlayerForLead = context.players[nextSeatForLead];
	const nextPlayerCanFinish = getTeam(nextSeatForLead) !== myTeamForLead &&
		nextPlayerForLead.finishOrder === null && nextPlayerForLead.hand.length === 1;

	// Get all lead candidates (exclude dog, handled above; exclude bombs unless aggressive)
	const canFinishSoon = hand.length <= 5;
	let candidates = plan.allCombos.filter(c => {
		if (isDogCombo(c)) return false;
		if (isBomb(c) && weights.bombHolding > 0.3) return false;
		// A 포함 트리플/풀하우스/연속페어 리드 금지 (나갈 수 있는 상황 제외)
		if (!canFinishSoon && c.rank === 14 && (c.type === 'triple' || c.type === 'full_house' || c.type === 'stairs' || c.type === 'straight')) return false;
		// 드래곤 리드 금지 시 드래곤 싱글 제외
		if (dragonLeadAllowed === false &&
			c.type === 'single' &&
			c.cards[0].type === 'special' &&
			c.cards[0].special === 'dragon') return false;
		// 봉황 싱글 리드 금지: 봉황은 팔로우에서 선 먹기용으로만 사용
		if (c.type === 'single' &&
			c.cards[0].type === 'special' &&
			c.cards[0].special === 'phoenix') return false;
		// 다음 상대가 1장 남았으면, 이길 확률 낮은 일반 싱글(예: 2)로 리드해서 바로 내주는 것 금지
		if (nextPlayerCanFinish && c.type === 'single' && c.cards[0].type !== 'special') {
			if (comboLikelyToWin(c, tracker, hand) < 0.5) return false;
		}
		return true;
	});

	if (candidates.length === 0) {
		candidates = plan.allCombos.filter(c => !isDogCombo(c));
	}
	if (candidates.length === 0) candidates = plan.allCombos;
	if (candidates.length === 0) return [hand[0].id]; // ultimate fallback

	// === 그리드 확률 탐색: 각 후보의 winProb × exitRate + contextMod ===
	const gridResults = searchBestPlay(hand, candidates, tracker, context, weights, behavior, 'lead');
	if (gridResults.length === 0) return [hand[0].id]; // fallback
	return pickAmongNearBest(gridResults, weights).combo.cards.map(c => c.id);
}

/**
 * Lead decision when close to finishing (5 or fewer cards).
 * Uses CardTracker to evaluate win probability and find optimal play sequences.
 */
export function decideLeadEndgame(
	hand: Card[],
	plan: HandPlan,
	weights: PersonalityWeights,
	context: AiDecisionContext,
	behavior: PresetBehavior = {}
): string[] {
	const tracker = buildCardTracker(context);

	// If we can play all remaining cards in one combo, do it!
	const allAtOnce = plan.allCombos.find(c => c.cards.length === hand.length && !isDogCombo(c));
	if (allAtOnce) {
		return allAtOnce.cards.map(c => c.id);
	}

	// === 프리셋 성격 반영 ===
	// 엔드게임은 손패 5장 이하에서 매 라운드 반드시 거치는 경로인데, 기존에는 weights를
	// 인자로 받기만 하고 쓰지 않았고 behavior는 전달조차 되지 않아 5개 프리셋이 사실상
	// 동일하게 플레이했다(4장 리드 150건 실측: 88% 완전 일치, 공격적=전략적 100% 일치).
	// 아래 편향값을 각 후보 점수에 더해 성격을 되살린다.
	const presetBias = (combo: Combination): number => {
		let bias = 0;
		// 프리셋 고유 리드 선호 (일반 리드 경로와 동일한 훅을 재사용)
		const hookScore = behavior.scoreLeadCandidate?.(combo, hand, context);
		if (hookScore !== null && hookScore !== undefined) {
			bias += Math.max(-0.25, Math.min(0.25, hookScore * 0.008));
		}
		// 공격성: 한 번에 많은 카드를 처리하는 콤보 선호
		bias += (combo.cards.length - 1) * weights.aggressiveness * 0.05;
		// 위험 감수도가 낮으면 확실히 이기는 리드를 선호
		const winProb = comboLikelyToWin(combo, tracker, hand);
		bias += (winProb - 0.5) * (1 - weights.riskTolerance) * 0.2;
		return bias;
	};

	// === 위협 감지: 일반 리드 스코어링(playSearchGrid)에만 있던 방어 로직을
	// 엔드게임 경로에서도 반영 ===
	// 1) 다음 플레이어(상대)가 카드 1장만 남았으면, 쉽게 뺏길 약한 싱글 리드는 위험
	// 2) 상대가 티츄를 선언한 상태면 확실히 이기는 리드를 선호
	const myTeam = getTeam(context.currentSeat);
	// 이미 나간 플레이어는 건너뛰고 실제로 다음에 낼 좌석을 찾음
	const nextSeat = getNextActiveSeat(context.currentSeat, context.players) as SeatIndex;
	const nextPlayer = context.players[nextSeat];
	const nextPlayerCanFinish = getTeam(nextSeat) !== myTeam &&
		nextPlayer.finishOrder === null && nextPlayer.hand.length === 1;
	const opponentTichuThreat = context.players.some(p =>
		getTeam(p.seat) !== myTeam &&
		(p.grandTichu === true || p.smallTichu) &&
		p.finishOrder === null
	);

	// === 몬테카를로 샘플링: 안 보이는 손패를 여러 번 무작위로 나눠 실제 안전성 추정 ===
	// 이 호출 1회당 한 번만 생성해 아래 모든 후보 평가에 재사용 (공통 난수 기법)
	const partnerSeatForMc = getPartnerSeat(context.currentSeat) as SeatIndex;
	const worlds = buildSampleWorlds(context);

	// 상대가 1장 남은 상황의 위협 확률은 샘플링이 필요 없음 — 그 좌석의 카드는 unseen 중
	// 균등 1장이므로 "unseen 중 내 리드를 이기는 카드의 비율"이 정확한 확률
	const unseenForThreat = nextPlayerCanFinish ? getUnseenCards(context) : [];
	const leadThreatPenalty = (combo: Combination): number => {
		if (!nextPlayerCanFinish && !opponentTichuThreat) return 0;
		// 일반 싱글(특수카드 제외)만 위험 — 멀티카드 콤보는 카드 1장인 상대가 따라올 수 없음
		if (combo.type !== 'single' || combo.cards[0].type === 'special') return 0;
		let penalty = 0;
		// 상대가 1장 남은 상황은 이 리드 하나로 게임을 내줄 수 있는 치명적 위험이라
		// "약한 카드부터 리드"라는 기본 성향(다른 스코어 요인)을 확실히 압도하도록 크게 잡음
		if (nextPlayerCanFinish) {
			if (unseenForThreat.length > 0) {
				let beatCount = 0;
				for (const uc of unseenForThreat) {
					const single = detectCombination([uc]);
					if (single && canBeat(combo, single)) beatCount++;
				}
				penalty += 2.0 * (beatCount / unseenForThreat.length);
			} else if (comboLikelyToWin(combo, tracker, hand) < 0.5) {
				penalty += 2.0;
			}
		}
		if (opponentTichuThreat && comboLikelyToWin(combo, tracker, hand) < 0.5) {
			penalty += 0.3;
		}
		return penalty;
	};

	// Find all valid 2-turn finishes and score them by win probability
	const twoTurnFinishes = findAllTwoTurnFinishes(hand, plan, tracker, worlds, partnerSeatForMc);
	if (twoTurnFinishes.length > 0) {
		// Sort by combined win probability (lead * remainder), adjusted for threats + 성격
		const adjusted = (f: { lead: Combination; score: number }) =>
			f.score - leadThreatPenalty(f.lead) + presetBias(f.lead);
		twoTurnFinishes.sort((a, b) => adjusted(b) - adjusted(a));
		return twoTurnFinishes[0].lead.cards.map(c => c.id);
	}

	// Try 3-turn finishes (위협 페널티에 성격 편향을 합쳐 전달 — 부호가 반대이므로 차감)
	const twoStepPenalty = (combo: Combination) => leadThreatPenalty(combo) - presetBias(combo);
	const twoStepResult = findTwoStepFinishScored(hand, plan, tracker, twoStepPenalty, worlds, partnerSeatForMc);
	if (twoStepResult) {
		return twoStepResult.cards.map(c => c.id);
	}

	// Fallback: 이기기 어려운 콤보부터 처리, 강한 카드는 팔로우용으로 보존
	// 멀티카드 콤보(페어, 스트레이트 등)는 같은 타입의 더 높은 조합이 필요하므로
	// 나중에 리드해서 이기기가 싱글보다 훨씬 어려움 → 먼저 처리
	const nonDog = plan.allCombos.filter(c => !isDogCombo(c) && !isBomb(c));
	if (nonDog.length > 0) {
		const scored = nonDog.map(c => {
			let score = 0;
			const winProb = comboLikelyToWin(c, tracker, hand);
			// 이길 확률이 낮은 콤보 = 먼저 내야 함 (나중에 이기기 더 어려우니까)
			score += (1 - winProb) * 10;
			// 멀티카드 콤보 보너스: 여러 장 한번에 처리
			score += c.cards.length * 2;
			// 남은 패 나가기 효율 평가: 이 콤보를 내고 남은 패가 효율적인지
			const remaining = hand.filter(card => !c.cards.some(cc => cc.id === card.id));
			if (remaining.length > 0) {
				const exitInfo = calcExitRate(remaining, tracker);
				score += exitInfo.rate * 8;       // 효율 높으면 보너스
				score -= exitInfo.turns * 1.5;    // 턴 많으면 페널티
			} else {
				score += 15; // 이 콤보로 나갈 수 있음
			}
			// 드래곤/봉황 싱글 리드 강한 페널티 (보존해야 할 강한 카드)
			if (c.type === 'single' && c.cards[0].type === 'special') {
				if (c.cards[0].special === 'dragon') score -= 20;
				if (c.cards[0].special === 'phoenix') score -= 15;
			}
			// 상대 위협 페널티 (0~0.45 범위를 fallback 스코어 스케일에 맞게 확대)
			score -= leadThreatPenalty(c) * 10;
			// 프리셋 성격 (위 두 경로와 동일 스케일로 확대)
			score += presetBias(c) * 10;
			return { combo: c, score };
		});
		scored.sort((a, b) => b.score - a.score);
		return scored[0].combo.cards.map(c => c.id);
	}

	return [hand[0].id];
}

/**
 * Find all 2-turn finishes and score them by win probability.
 * Each result: lead combo → remainder combo, scored by how likely both will win.
 */
export function findAllTwoTurnFinishes(
	hand: Card[],
	plan: HandPlan,
	tracker: CardTracker,
	worlds: SampledWorld[] = [],
	partnerSeat?: SeatIndex
): { lead: Combination; remainder: Combination; score: number }[] {
	const results: { lead: Combination; remainder: Combination; score: number }[] = [];
	const useMc = worlds.length > 0 && partnerSeat !== undefined;

	for (const combo of plan.allCombos) {
		if (isDogCombo(combo)) continue;
		if (isBomb(combo)) continue;

		const remainingCards = hand.filter(c => !combo.cards.some(cc => cc.id === c.id));
		if (remainingCards.length === 0) continue; // handled before this function

		// Check if remaining forms a single valid combo
		const remainderCombo = detectCombination(remainingCards);
		if (!remainderCombo) continue;

		// 리드의 실제 안전성(누가 이길 수 있는지)은 몬테카를로로 추정 가능하면 그것을 쓰고,
		// 아니면(데이터 불일치 등) 기존 정적 확률로 폴백
		let leadWinProb: number;
		let remainderWinProb: number;
		if (useMc) {
			const mc = evaluateTwoTurnFinish(combo, remainderCombo, worlds, partnerSeat!);
			leadWinProb = mc.effectiveWinProb;
			remainderWinProb = mc.remainderSafeRate;
		} else {
			leadWinProb = comboLikelyToWin(combo, tracker, hand);
			remainderWinProb = comboLikelyToWin(remainderCombo, tracker, remainingCards);
		}

		// Strategy: lead with the one that WILL win, then play remainder.
		// Score = leadWinProb * (1 + remainderWinProb)
		const score = leadWinProb * (1 + remainderWinProb * 0.8);

		results.push({ lead: combo, remainder: remainderCombo, score });
	}

	return results;
}

/**
 * Try 3-turn finishes with win probability scoring.
 *
 * 3턴 완성(X → 중간 → 마지막)에는 두 가지 플랜이 있음:
 * - 체인 플랜: X를 리드해 이기고 선 유지 → 중간 콤보 리드해 이기고 → 마지막 콤보로 나감.
 *   마지막 콤보는 내는 순간 손패가 비어 나가는 것이므로 이길 필요가 없음 — 중간까지만 이기면 됨.
 * - 덤프 플랜: 약한 X를 일부러 버려 선을 내주고, 나중에 강한 재진입 콤보로 팔로우해서
 *   선을 되찾은 뒤 마지막 콤보로 나감. 약한 카드를 마지막까지 쥐고 갇히는 것보다,
 *   먼저 버리고 강한 카드를 "선 탈환 수단"으로 아끼는 쪽이 더 안전한 경우가 많음.
 * 두 플랜 중 높은 점수를 그 X의 점수로 사용.
 */
export function findTwoStepFinishScored(
	hand: Card[],
	plan: HandPlan,
	tracker: CardTracker,
	leadPenalty: (combo: Combination) => number = () => 0,
	worlds: SampledWorld[] = [],
	partnerSeat?: SeatIndex
): Combination | null {
	const candidates: { combo: Combination; score: number }[] = [];
	const useMc = worlds.length > 0 && partnerSeat !== undefined;

	for (const combo of plan.allCombos) {
		if (isDogCombo(combo)) continue;
		if (isBomb(combo)) continue;

		const remainingCards = hand.filter(c => !combo.cards.some(cc => cc.id === c.id));
		if (remainingCards.length <= 1) continue;

		const remainingCombos = findAllPlayableCombinations(remainingCards);
		let bestMiddleWinProb = -Infinity;
		let bestReentryScore = -Infinity;
		let validSplit = false;

		for (const rc of remainingCombos) {
			const afterFirst = remainingCards.filter(c => !rc.cards.some(cc => cc.id === c.id));
			if (afterFirst.length === 0) continue;

			const lastCombo = detectCombination(afterFirst);
			if (!lastCombo) continue;
			validSplit = true;

			// 체인 플랜: rc(중간)만 이기면 됨 — lastCombo는 내는 순간 나가므로 승률 무관
			// (중간 단계는 성능/범위 절충으로 기존 정적 확률 유지)
			const rcProb = comboLikelyToWin(rc, tracker, remainingCards);
			bestMiddleWinProb = Math.max(bestMiddleWinProb, rcProb);

			// 덤프 플랜: rc를 재진입 콤보로 사용 — 재진입 성공 확률이 플랜의 성패를 가르므로
			// 첫 리드와 같은 급으로 취급해 몬테카를로 적용 (폴백 시 정적 확률)
			const reentryProb = useMc
				? evaluateLeadSafety(rc, worlds, partnerSeat!).effectiveWinProb
				: rcProb;
			// 싱글은 팔로우 기회가 흔하지만, 페어/스트레이트 등은 같은 타입 트릭이 와야만
			// 재진입할 수 있어 훨씬 불확실함
			const reentryTypeFactor = rc.type === 'single' ? 0.85 : 0.4;
			bestReentryScore = Math.max(bestReentryScore, reentryProb * reentryTypeFactor);
		}

		if (validSplit) {
			const leadScore = useMc
				? evaluateLeadSafety(combo, worlds, partnerSeat!).effectiveWinProb
				: comboLikelyToWin(combo, tracker, hand);
			const chainScore = leadScore * (0.3 + 0.7 * bestMiddleWinProb);
			// 덤프 플랜에서 X 자체의 승률은 무관 (버리는 카드) — 대신 약한 카드를 먼저
			// 버리는 쪽을 미세하게 선호 (강한 카드는 재진입/마지막 용도로 보존)
			const dumpScore = bestReentryScore + (1 - leadScore) * 0.02;
			candidates.push({ combo, score: Math.max(chainScore, dumpScore) - leadPenalty(combo) });
		}
	}

	if (candidates.length === 0) return null;
	candidates.sort((a, b) => b.score - a.score);
	return candidates[0].combo;
}

/**
 * 최상위 점수와 근소한 차이 안에 있는 후보 중 하나를 무작위로 고른다.
 *
 * 기존에는 항상 1위 후보를 그대로 냈기 때문에, 같은 상황을 20번 주면 20번 모두
 * 똑같은 카드가 나왔다. 사람은 그렇게 두지 않으므로 상대하는 입장에서 기계처럼
 * 느껴지고, 한 번 파악하면 그대로 읽힌다.
 *
 * 점수가 사실상 동률인 후보들만 대상으로 하므로 실력 손실은 거의 없다.
 * 허용 폭은 riskTolerance에 비례 — 안정적인 성격(수비적 0.2)은 거의 최선만 두고,
 * 변칙적(0.9)은 폭이 넓어 실제로 '변칙적'으로 보인다.
 */
function pickAmongNearBest<T extends { totalScore: number }>(
	sortedDesc: T[],
	weights: PersonalityWeights
): T {
	if (sortedDesc.length <= 1) return sortedDesc[0];
	// 허용 폭 주의: totalScore의 실질 범위는 약 0~1.3이다. 처음에 0.03~0.07로 잡았더니
	// "근소한 차이"가 아니라 명백히 나쁜 수까지 포함되어 실력이 크게 떨어졌다
	// (riskTolerance에 비례해 하락: 수비적 -3.7, 공격적 -35.9 점/라운드).
	// 전체 범위의 1% 안쪽만 동률로 취급한다.
	const epsilon = 0.004 + weights.riskTolerance * 0.012; // 0.006 ~ 0.016
	const best = sortedDesc[0].totalScore;
	let count = 1;
	while (count < sortedDesc.length && best - sortedDesc[count].totalScore <= epsilon) count++;
	return sortedDesc[Math.floor(Math.random() * count)];
}

function isDogCombo(combo: Combination): boolean {
	return combo.cards.length === 1 && combo.cards[0].type === 'special' && combo.cards[0].special === 'dog';
}

/**
 * Find a play containing the wished rank that beats the current combo.
 */
function findWishedPlay(hand: Card[], wish: WishState, currentCombo: Combination): string[] {
	if (!wish.requestedRank) return [];

	const allCombos = findAllPlayableCombinations(hand);
	const wishedBeatable = allCombos.filter(c =>
		playFulfillsWish(c.cards, wish) && canBeat(currentCombo, c)
	);

	if (wishedBeatable.length > 0) {
		// Play the weakest combo that fulfills the wish
		const sorted = wishedBeatable.sort((a, b) => a.rank - b.rank);
		return sorted[0].cards.map(c => c.id);
	}

	return [];
}

// ===== Wish Decision =====

/**
 * Decide what rank to wish for after playing the Mahjong.
 * Strategy: Wish for a rank that forces opponents to waste cards
 * while being unlikely to hurt us or our partner.
 */
export function decideWish(
	hand: Card[],
	weights: PersonalityWeights,
	context: AiDecisionContext,
	behavior: PresetBehavior = {},
	givenToOpponents: number[] = []
): number | null {
	// Behavior hook: wish 오버라이드
	const wishOverride = behavior.decideWishOverride?.(hand, context, givenToOpponents);
	if (wishOverride !== 'default' && wishOverride !== undefined) {
		return wishOverride;
	}

	// 참새를 조합(스트레이트 등)으로 냈을 때만 확률로 소원 스킵
	// 싱글로 냈으면 무조건 소원 선언
	const mahjongPlay = context.trick?.plays[0]?.combination;
	if (mahjongPlay && mahjongPlay.type !== 'single') {
		// 조합: aggressiveness 기반 확률로 스킵 가능
		if (Math.random() > weights.aggressiveness + 0.3) return null;
	}

	const tracker = buildCardTracker(context);

	const myRanks = new Set(
		hand.filter(c => c.type === 'normal').map(c => (c as NormalCard).rank as number)
	);

	const normalCards = hand.filter(c => c.type === 'normal') as NormalCard[];
	const rankCounts = new Map<number, number>();
	for (const c of normalCards) {
		rankCounts.set(c.rank, (rankCounts.get(c.rank) || 0) + 1);
	}

	// Strategy 1: 내가 가진 랭크 + 상대도 가지고 있을 가능성 높은 랭크
	const goodWishRanks: { rank: number; score: number }[] = [];
	for (const [rank, count] of rankCounts) {
		if (rank <= 3) continue; // 2,3은 너무 낮아서 제외
		const stillOut = tracker.remainingByRank.get(rank) || 0;
		if (count >= 1 && stillOut >= 1) {
			// 높은 랭크 + 내가 많이 가진 + 밖에 많이 남은 → 좋은 소원
			goodWishRanks.push({ rank, score: rank * 2 + count * 5 + stillOut * 3 });
		}
	}

	if (goodWishRanks.length > 0) {
		goodWishRanks.sort((a, b) => b.score - a.score);
		return goodWishRanks[0].rank;
	}

	// Strategy 2: 내가 안 가진 높은 랭크 → 상대가 강제로 내게 됨
	const highRanks = [14, 13, 12, 11];
	for (const rank of highRanks) {
		if (!myRanks.has(rank)) {
			const stillOut = tracker.remainingByRank.get(rank) || 0;
			if (stillOut >= 1) {
				return rank;
			}
		}
	}

	// 여기까지 왔다면 A/K/Q/J가 전부 내 손패에 있거나 이미 소진된 상태 →
	// 아무도 채울 수 없는 "죽은 소원"이 되므로 소원 생략
	return null;
}

// ===== Dragon Gift Decision =====

/**
 * Decide which opponent to give the dragon trick to.
 * Give to the opponent who is FURTHER from finishing (more cards = less likely to go out first)
 */
export function decideDragonGift(
	context: AiDecisionContext,
	seat: SeatIndex,
	weights: PersonalityWeights,
	behavior: PresetBehavior = {}
): SeatIndex {
	// Behavior hook: 드래곤 선물 오버라이드
	const override = behavior.decideDragonGiftOverride?.(context, seat);
	if (override !== null && override !== undefined) return override;

	const myTeam = getTeam(seat);
	const opponents = context.players.filter(p => getTeam(p.seat) !== myTeam && p.finishOrder === null);

	if (opponents.length === 0) {
		const leftSeat = getLeftSeat(seat) as SeatIndex;
		const rightSeat = getRightSeat(seat) as SeatIndex;
		return getTeam(leftSeat) !== myTeam ? leftSeat : rightSeat;
	}

	if (opponents.length === 1) return opponents[0].seat;

	// 티츄 선언한 상대에게 주기 (추가 카드가 나가기 방해)
	const tichuerOpponent = opponents.find(opp => (opp.grandTichu === true || opp.smallTichu) && opp.finishOrder === null);
	if (tichuerOpponent) {
		return tichuerOpponent.seat;
	}

	// Give to opponent with MORE cards (further from finishing)
	const scored = opponents.map(opp => ({
		seat: opp.seat,
		cardsLeft: opp.hand.length,
		wonPoints: opp.wonCards.reduce((sum, card) => {
			if (card.type === 'special' && card.special === 'dragon') return sum + 25;
			if (card.type === 'special' && card.special === 'phoenix') return sum - 25;
			if (card.type === 'normal') {
				if (card.rank === 5) return sum + 5;
				if (card.rank === 10 || card.rank === 13) return sum + 10;
			}
			return sum;
		}, 0)
	}));

	scored.sort((a, b) => {
		if (b.cardsLeft !== a.cardsLeft) return b.cardsLeft - a.cardsLeft;
		return a.wonPoints - b.wonPoints;
	});

	return scored[0].seat;
}

// ===== Bomb Interrupt Decision =====

/**
 * Decide whether to play a bomb out of turn.
 */
export function shouldPlayBomb(
	context: AiDecisionContext,
	weights: PersonalityWeights,
	lastPlay: { seat: SeatIndex; combination: Combination },
	behavior: PresetBehavior = {}
): Combination | null {
	const { hand, currentSeat, players } = context;
	const myTeam = getTeam(currentSeat);
	const playTeam = getTeam(lastPlay.seat);

	// Don't bomb our own team
	if (playTeam === myTeam) return null;

	const bombs = findBombs(hand);
	if (bombs.length === 0) return null;

	const beatable = bombs.filter(b => canBeat(lastPlay.combination, b));
	if (beatable.length === 0) return null;

	beatable.sort((a, b) => a.rank - b.rank);

	// === 필수 저지 로직: 프리셋의 shouldUseBomb 오버라이드보다 항상 우선 적용 ===
	// (모든 프리셋이 shouldUseBomb에서 'skip'/콤보 중 하나를 반환해버리면
	//  아래 공용 로직 전체가 죽은 코드가 되어버리는 문제를 방지)
	if (isBomb(lastPlay.combination)) {
		const attacker = players[lastPlay.seat];
		if (attacker.hand.length <= 2) {
			return beatable[0]; // 상대가 폭탄으로 나가려는 중이면 반드시 저지
		}
	} else {
		const player = players[lastPlay.seat];
		if (player.hand.length <= 2) {
			return beatable[0]; // 상대가 곧 나갈 것 같으면 반드시 저지
		}
	}

	// Behavior hook: 폭탄 사용 오버라이드 (필수 저지 이후, 선택적 상황)
	const bombOverride = behavior.shouldUseBomb?.(hand, bombs, context, lastPlay);
	if (bombOverride === 'skip') return null;
	if (bombOverride !== null && bombOverride !== undefined) return bombOverride;

	const tracker = buildCardTracker(context);

	// Counter-bomb scenario (이미 나간 폭탄에 카운터폭탄 칠지)
	if (isBomb(lastPlay.combination)) {
		// 카운터폭탄은 트릭 포인트가 충분할 때만 (10점 이상)
		const counterTrickCards = context.trick?.plays.flatMap(p => p.combination.cards) || [];
		const counterTrickPoints = getTrickPoints(counterTrickCards);
		if (weights.aggressiveness > 0.7 && weights.bombHolding < 0.4 && counterTrickPoints >= 10) {
			return beatable[0];
		}
		return null;
	}

	// 소원이 활성화된 상태에서 낮은 포인트 트릭에 폭탄 자제
	// (소원이 아직 충족 안 됐으면 상대가 결국 소원 카드를 내야 하므로 기다리는 게 유리)
	if (context.wish.active && context.wish.requestedRank !== null) {
		const wishTrickCards = context.trick?.plays.flatMap(p => p.combination.cards) || [];
		const wishTrickPoints = getTrickPoints(wishTrickCards);
		if (wishTrickPoints < 15) return null;
	}

	// High bomb holding = reluctant to use bombs
	if (weights.bombHolding > 0.8) return null;

	// 상대 티츄 선언 → 적극 폭탄 (카드 7장 이하)
	if (hasOpponentDeclaredTichu(tracker)) {
		const tichuer = tracker.opponents.find(o => o.declaredTichu && !o.finished);
		if (tichuer && tichuer.cardsRemaining <= 7) {
			return beatable[0];
		}
	}

	// Check if trick has lots of points
	const trickCards = context.trick?.plays.flatMap(p => p.combination.cards) || [];
	const trickPoints = getTrickPoints(trickCards);

	// 드래곤(25점) 포함 트릭은 적극 폭탄
	if (lastPlay.combination.type === 'single' &&
		lastPlay.combination.cards.some(c => c.type === 'special' && c.special === 'dragon')) {
		return beatable[0];
	}

	// 포인트 임계값 하향: 15점 이상 + 상대가 이기고 있으면
	if (trickPoints >= 15 && weights.aggressiveness > 0.2) {
		return beatable[0];
	}

	// 나갈 수 있으면 폭탄: 폭탄 후 나머지 카드로 나갈 수 있으면 적극 사용
	if (hand.length <= 6) {
		for (const bomb of beatable) {
			const afterBomb = hand.filter(c => !bomb.cards.some(bc => bc.id === c.id));
			if (afterBomb.length === 0) return bomb; // 폭탄으로 나감!
			const afterCombo = detectCombination(afterBomb);
			if (afterCombo) return bomb; // 폭탄 후 1턴에 나갈 수 있음
			// 2턴 체크
			if (afterBomb.length <= 3) {
				const afterCombos = findAllPlayableCombinations(afterBomb);
				for (const ac of afterCombos) {
					const remaining = afterBomb.filter(c => !ac.cards.some(acc => acc.id === c.id));
					if (remaining.length === 0 || (remaining.length === 1)) return bomb;
					const lastC = detectCombination(remaining);
					if (lastC) return bomb;
				}
			}
		}
	}

	// If I'm close to finishing and bombing would let me lead (최소 5점 트릭)
	if (hand.length <= 4 && weights.aggressiveness > 0.3 && trickPoints >= 5) {
		return beatable[0];
	}

	return null;
}

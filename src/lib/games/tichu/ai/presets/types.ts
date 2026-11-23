import type { Card, Combination, SeatIndex, NormalCard, TichuPlayer } from '../../types';
import type { AiDecisionContext } from '../types';

/**
 * 파트너에게 줄 교환 카드를 스마트하게 선택.
 * protectedIds를 존중하면서 가능한 높은 카드를 줌.
 * null 반환 시 strategy.ts 기본 로직으로 폴백 (용 > 봉 > A > K).
 */
export function selectBestPartnerCard(
	hand: Card[],
	singletons: NormalCard[],
	rankGroups: Map<number, NormalCard[]>,
	protectedIds: Set<string>
): Card | null {
	// 높은 싱글톤 우선 (페어/폭탄을 안 깨뜨림)
	const highSingletons = singletons
		.filter(c => !protectedIds.has(c.id) && c.rank >= 10)
		.sort((a, b) => b.rank - a.rank);
	if (highSingletons.length > 0) return highSingletons[0];

	// 3장 이상 그룹에서 1장 (페어를 안 깨뜨림)
	for (const [rank, cards] of [...rankGroups.entries()].sort((a, b) => b[0] - a[0])) {
		if (cards.length >= 3) {
			const nonProtected = cards.filter(c => !protectedIds.has(c.id));
			if (nonProtected.length > 0) return nonProtected[0];
		}
	}

	// 아무 싱글톤 (높은 것부터)
	const anySingleton = singletons
		.filter(c => !protectedIds.has(c.id))
		.sort((a, b) => b.rank - a.rank);
	if (anySingleton.length > 0) return anySingleton[0];

	return null;
}

/**
 * 사람 기록에서 뽑은 캐릭터 습관 (규칙은 habits.ts).
 */
export interface CharacterHabits {
	/** 점수만 보고 폭탄을 내는 문턱. null이면 점수만으로는 안 낸다 */
	bombForPoints: number | null;
	/** 내가 낸 카드 위에 마지막 장들인 폭탄을 얹어 바로 나간다 */
	bombOwnTrick: boolean;
	/** 선을 잡았을 때 개를 낼 확률 — [손패 10장 이상, 5~9장] */
	dogLead: [number, number];
}

/** 사람 전체 평균 — 캐릭터에 습관이 따로 없을 때 */
export const DEFAULT_HABITS: CharacterHabits = { bombForPoints: null, bombOwnTrick: false, dogLead: [0.28, 0.6] };

/**
 * 프리셋별 고유 행동을 정의하는 인터페이스.
 * 각 훅은 null을 반환하면 기본 로직으로 폴백.
 */
export interface PresetBehavior {
	/** 사람 기록에서 뽑은 습관 — 끼어드는 폭탄과 개를 낼 시점 (없으면 사람 평균) */
	habits?: CharacterHabits;

	/** 파트너에게 줄 교환 카드 선택 (null → 기본 로직) */
	selectPartnerExchangeCard?(
		hand: Card[],
		singletons: NormalCard[],
		rankGroups: Map<number, NormalCard[]>,
		protectedIds: Set<string>
	): Card | null;

	/** 마작을 파트너에게 줄지 (true → 줌, false/null → 안 줌) */
	shouldGiveMahjongToPartner?(hand: Card[]): boolean;

	/** 파트너가 이기고 있을 때 행동 (cardIds[] | 'pass' | null=기본) */
	onPartnerWinning?(
		hand: Card[],
		lastCombo: Combination,
		context: AiDecisionContext
	): string[] | 'pass' | null;

	/** dog 플레이 여부 (true/false/null=기본) */
	shouldPlayDog?(
		hand: Card[],
		partner: TichuPlayer,
		context: AiDecisionContext
	): boolean | null;

	/** 리드 시 콤보 스코어링 오버라이드 (null=기본) */
	scoreLeadCandidate?(
		combo: Combination,
		hand: Card[],
		context: AiDecisionContext
	): number | null;

	/** 팔로우 시 스코어링 오버라이드 (null=기본) */
	scoreFollowCandidate?(
		play: Combination,
		hand: Card[],
		context: AiDecisionContext,
		trickPoints: number,
		opponentWinning: boolean
	): number | null;

	/** 그랜드 티츄 선언 오버라이드 (true/false/null=기본) */
	shouldDeclareGrandTichu?(hand8: Card[]): boolean | null;

	/** 스몰 티츄 선언 오버라이드 (true/false/null=기본) */
	shouldDeclareSmallTichu?(hand: Card[], context: AiDecisionContext): boolean | null;

	/** 드래곤 선물 오버라이드 (SeatIndex/null=기본) */
	decideDragonGiftOverride?(context: AiDecisionContext, seat: SeatIndex): SeatIndex | null;

	/** wish 오버라이드 (number=그 랭크, null=안부름, 'default'=기본로직) */
	decideWishOverride?(
		hand: Card[],
		context: AiDecisionContext,
		givenToOpponents: number[]
	): number | null | 'default';

	/** 드래곤 리드 사용 조건 (true=OK, false=안함, null=기본) */
	shouldLeadDragon?(hand: Card[], context: AiDecisionContext): boolean | null;
}

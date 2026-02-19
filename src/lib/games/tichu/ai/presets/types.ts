import type { Card, Combination, SeatIndex, NormalCard, TichuPlayer } from '../../types';
import type { AiDecisionContext } from '../types';

/**
 * 티츄급 패인지 판별 (드래곤+봉황+A 2장 이상 → 보존 우선)
 * 교환 시 파트너에게 좋은 카드를 줄지 결정하는 데 사용
 */
export function isTichuCaliberHand(hand: Card[]): boolean {
	const hasDragon = hand.some(c => c.type === 'special' && c.special === 'dragon');
	const hasPhoenix = hand.some(c => c.type === 'special' && c.special === 'phoenix');
	const aceCount = hand.filter(c => c.type === 'normal' && c.rank === 14).length;

	// 드래곤 + 봉황 + A 1장 이상이면 티츄급
	if (hasDragon && hasPhoenix && aceCount >= 1) return true;
	// 드래곤 + A 2장 이상이면 티츄급
	if (hasDragon && aceCount >= 2) return true;

	return false;
}

/**
 * 프리셋별 고유 행동을 정의하는 인터페이스.
 * 각 훅은 null을 반환하면 기본 로직으로 폴백.
 */
export interface PresetBehavior {
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

	/** 폭탄 사용 판단 (Combination=사용, 'skip'=사용안함, null=기본) */
	shouldUseBomb?(
		hand: Card[],
		bombs: Combination[],
		context: AiDecisionContext,
		lastPlay: { seat: SeatIndex; combination: Combination }
	): Combination | 'skip' | null;

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

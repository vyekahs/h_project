import type { PresetBehavior } from './types';
import { selectBestPartnerCard } from './types';
import type { Card, NormalCard, Combination, SeatIndex } from '../../types';
import type { AiDecisionContext } from '../types';
import { findAllPlayableCombinations, estimateSimpleTurns } from '../handEvaluator';
import { getTeam, getPartnerSeat } from '../../constants';
import { canBeat, isBomb } from '../../combinations';

/**
 * 공격적 (Aggressive) 프리셋 고유 행동
 *
 * 핵심: 티츄 + 빠른 나가기. 파트너 피해 안 가게.
 * - 교환: 파트너에게 좋은 카드
 * - 리드: 큰 콤보 우선 (빨리 패 줄이기)
 * - 팔로우: 적극적으로 뺏음
 * - 파트너 트릭: 기본 (패스)
 * - Dog: 빨리 털어버림 (첫 리드 등에서 바로 사용)
 * - 폭탄: 내고도 리드 잡거나 나갈 수 있을 때
 * - 드래곤: 그 다음에도 리드 잡거나 나갈 수 있을 때
 * - Wish: 내가 나갈 때 방해될 것 같은 카드 (내 손패에 없는 높은 랭크)
 * - 티츄: 적극적으로 부름 (낮은 기준)
 */
export const aggressiveBehavior: PresetBehavior = {
	selectPartnerExchangeCard(hand, singletons, rankGroups, protectedIds) {
		return selectBestPartnerCard(hand, singletons, rankGroups, protectedIds);
	},

	scoreLeadCandidate(combo, hand, context) {
		// 큰 콤보 우선 (빨리 패 줄이기)
		let score = 0;

		// 멀티카드 콤보: 크기에 큰 보너스
		score += combo.cards.length * 8;

		// 폭탄은 보존 (공격적이어도 폭탄은 아껴둠)
		if (isBomb(combo)) {
			score -= 30;
		}

		// 싱글은 우선순위 낮음 (큰 콤보를 먼저 내고 싶음)
		if (combo.type === 'single') {
			const card = combo.cards[0];
			if (card.type === 'special' && card.special === 'mahjong') {
				score += 20; // 마작은 선 잡기용
			} else if (card.type === 'special' && card.special === 'dragon') {
				score -= 10; // 드래곤은 나중에
			} else {
				score -= 5; // 일반 싱글은 후순위
				score -= combo.rank; // 낮은 싱글부터 (A는 나중에)
			}
		} else {
			// 멀티카드 콤보는 랭크 높아도 OK (빨리 처리)
			score += combo.rank * 0.5;
		}

		// 스트레이트/계단: 많은 카드를 한 번에 내므로 보너스
		if (combo.type === 'straight' || combo.type === 'stairs') {
			score += combo.cards.length * 3;
		}

		// 풀하우스: 5장 한 번에
		if (combo.type === 'full_house') {
			score += 12;
		}

		return score;
	},

	scoreFollowCandidate(play, hand, context, trickPoints, opponentWinning) {
		// 적극적으로 뺏음
		let score = 0;

		if (opponentWinning) {
			// 상대가 이기고 있으면 적극 뺏기
			score = 20 - play.rank;
			if (trickPoints >= 10) score += trickPoints;
		} else {
			// 파트너가 이기고 있으면 패스
			score = -15;
		}

		// 패를 줄이는 것도 중요 (큰 콤보로 뺏기 선호)
		score += play.cards.length * 2;

		return score;
	},

	shouldPlayDog(hand, partner, context) {
		if (partner.finishOrder !== null) return false;
		// 빨리 털어버림 — 거의 항상 사용
		return true;
	},

	shouldUseBomb(hand, bombs, context, lastPlay) {
		const myTeam = getTeam(context.currentSeat);
		const playTeam = getTeam(lastPlay.seat);
		if (playTeam === myTeam) return 'skip';

		// 폭탄 내고도 리드 잡거나 나갈 수 있을 때
		for (const bomb of bombs) {
			if (!canBeat(lastPlay.combination, bomb)) continue;

			const remaining = hand.filter(c => !bomb.cards.some(bc => bc.id === c.id));
			if (remaining.length === 0) return bomb; // 폭탄으로 나감

			// 남은 패로 나갈 수 있는지 확인
			const turnsNeeded = estimateSimpleTurns(remaining);
			if (turnsNeeded <= 4) {
				return bomb;
			}

			// 남은 패에 높은 카드가 있어서 리드 잡을 수 있는지
			const normalCards = remaining.filter(c => c.type === 'normal') as NormalCard[];
			const hasDragon = remaining.some(c => c.type === 'special' && c.special === 'dragon');
			const hasAce = normalCards.some(c => c.rank === 14);
			if (hasDragon || hasAce) {
				return bomb;
			}
		}

		return 'skip';
	},

	shouldDeclareGrandTichu(hand8) {
		// 적극적으로 부름 — 기본보다 낮은 기준
		// 기본 로직이 PersonalityWeights 기반이므로 여기선 null 반환 (tichoPropensity=0.8이 이미 적극적)
		return null;
	},

	shouldDeclareSmallTichu(hand, context) {
		// 적극적으로 부름 — 기본보다 낮은 기준
		// PersonalityWeights의 tichoPropensity=0.8이 이미 적극적
		return null;
	},

	decideDragonGiftOverride(context, seat) {
		// 드래곤 사용 후: 기본 로직 (카드 많은 상대에게)
		return null;
	},

	decideWishOverride(hand, context, givenToOpponents) {
		// 내가 나갈 때 방해될 것 같은 카드: 내 손패에 없는 높은 랭크
		const myRanks = new Set<number>(
			hand.filter(c => c.type === 'normal').map(c => (c as NormalCard).rank as number)
		);

		// 내 손패에 없는 높은 랭크 (A → K → Q → J 순)
		const highRanks = [14, 13, 12, 11];
		for (const rank of highRanks) {
			if (!myRanks.has(rank)) {
				return rank;
			}
		}

		// 내가 다 갖고 있으면 기본 로직
		return 'default';
	},

	shouldLeadDragon(hand, context) {
		// 그 다음에도 리드 잡거나 나갈 수 있을 때 사용
		const handWithoutDragon = hand.filter(
			c => !(c.type === 'special' && c.special === 'dragon')
		);

		if (handWithoutDragon.length === 0) return true; // 드래곤이 마지막 패

		const turnsNeeded = estimateSimpleTurns(handWithoutDragon);
		// 드래곤 빼고 3턴 이하로 나갈 수 있으면
		if (turnsNeeded <= 3) return true;

		// 높은 카드가 있어서 리드 재확보 가능하면
		const normalCards = handWithoutDragon.filter(c => c.type === 'normal') as NormalCard[];
		const hasAce = normalCards.some(c => c.rank === 14);
		const hasPhoenix = handWithoutDragon.some(c => c.type === 'special' && c.special === 'phoenix');
		if (hasAce || hasPhoenix) return true;

		return false;
	}
};


import type { PresetBehavior } from './types';
import { selectBestPartnerCard } from './types';
import type { Card, NormalCard, Combination, SeatIndex } from '../../types';
import type { AiDecisionContext } from '../types';
import { findAllPlayableCombinations, findBombs, estimateSimpleTurns } from '../handEvaluator';
import { getTeam, getPartnerSeat } from '../../constants';
import { canBeat, isBomb } from '../../combinations';

/**
 * 전략적 (Tricky) 프리셋 고유 행동
 *
 * 핵심: 카드 카운팅 기반 점수 위주 플레이.
 * - 교환: 파트너에게 좋은 카드
 * - 리드: 기본 로직 (낮은 카드 우선)
 * - 팔로우: 포인트 많은 트릭 적극 뺏기, 포인트 없으면 약하게 팔로우
 * - 파트너 트릭: 기본 (패스)
 * - Dog: 먼저 나가는데 마지막에 낼 수 있으면 내고 나감, 아니면 첫 리드때
 * - 폭탄: 내고도 나머지 패로 나갈 수 있을 때만
 * - 드래곤: 점수 없는 트릭에서 나갈 수 있을 때 사용
 * - Wish: 상대에게 준 카드 랭크
 * - 티츄: 원투 선호, 확실히 나갈 수 있을 때만
 */
export const trickyBehavior: PresetBehavior = {
	selectPartnerExchangeCard(hand, singletons, rankGroups, protectedIds) {
		return selectBestPartnerCard(hand, singletons, rankGroups, protectedIds);
	},

	scoreLeadCandidate(combo, hand, context) {
		let score = 0;

		// 포인트 카드(5=5점, 10=10점, K=10점) 포함 멀티콤보 보너스
		const comboPoints = combo.cards.reduce((sum, c) => {
			if (c.type !== 'normal') return sum;
			const nc = c as NormalCard;
			if (nc.rank === 5) return sum + 5;
			if (nc.rank === 10 || nc.rank === 13) return sum + 10;
			return sum;
		}, 0);
		if (comboPoints > 0 && combo.cards.length > 1) {
			score += comboPoints; // 포인트 콤보 보너스 (과도하지 않게)
		}

		// 멀티카드 보너스
		score += combo.cards.length * 2;

		// 폭탄 강하게 보존
		if (isBomb(combo)) score -= 60;

		return score;
	},

	scoreFollowCandidate(play, hand, context, trickPoints, opponentWinning) {
		// 포인트 많은 트릭 적극 뺏기, 포인트 없으면 약하게 팔로우
		let score = 0;

		if (trickPoints >= 10) {
			// 포인트가 있는 트릭: 적극 뺏기
			score = trickPoints * 2 - play.rank * 1.5;
			if (opponentWinning) score += 15;
		} else {
			// 포인트 없는 트릭
			if (opponentWinning) {
				// 상대가 이기고 있으면 선 잡기 위해 약한 카드로 뺏기
				score = 5 - play.rank;
			} else {
				score = -20;
			}
		}

		return score;
	},

	shouldPlayDog(hand, partner, context) {
		if (partner.finishOrder !== null) return false;

		const dogCard = hand.find(c => c.type === 'special' && c.special === 'dog');
		if (!dogCard) return null;

		// 내가 먼저 나가는데 마지막에 낼 수 있는지 확인
		const handWithoutDog = hand.filter(c => c.id !== dogCard.id);
		const combos = findAllPlayableCombinations(handWithoutDog);
		const nonSingleCombos = combos.filter(c => c.type !== 'single' && !isBomb(c));

		// 패가 적고 개를 마지막에 낼 수 있으면 (나가기 직전에 사용)
		if (hand.length <= 5) {
			// 개 빼고 남은 패로 한 턴에 다 낼 수 있는지 확인
			const canFinishWithoutDog = combos.some(c => c.cards.length === handWithoutDog.length);
			if (canFinishWithoutDog) {
				// 먼저 콤보로 패를 비우고 마지막에 개를 내는 게 가능
				// → 아직 개를 내지 않고 다른 것부터
				return false;
			}
		}

		// 첫 리드 (패가 많을 때) → 사용
		if (hand.length >= 10) return true;

		return null; // 기본 로직
	},

	shouldUseBomb(hand, bombs, context, lastPlay) {
		const myTeam = getTeam(context.currentSeat);
		const playTeam = getTeam(lastPlay.seat);
		if (playTeam === myTeam) return 'skip';

		// 폭탄 쓰고도 나갈 수 있을 때만
		for (const bomb of bombs) {
			if (!canBeat(lastPlay.combination, bomb)) continue;
			const remaining = hand.filter(c => !bomb.cards.some(bc => bc.id === c.id));
			if (remaining.length === 0) return bomb; // 폭탄으로 나감

			const remainingCombos = findAllPlayableCombinations(remaining);
			const turnsNeeded = estimateSimpleTurns(remaining);
			if (turnsNeeded <= 3) {
				return bomb;
			}
		}

		return 'skip';
	},

	shouldDeclareGrandTichu(hand8) {
		// 매우 보수적: 확실할 때만
		// 기본 로직보다 높은 기준 적용
		return null; // 기본 로직으로 (PersonalityWeights의 tichoPropensity가 0.5)
	},

	shouldDeclareSmallTichu(hand, context) {
		// 원투 선호 — 확실히 나갈 수 있을 때만
		const combos = findAllPlayableCombinations(hand);
		const nonBombCombos = combos.filter(c => !isBomb(c));

		// 턴 수 추정
		const turnsNeeded = estimateSimpleTurns(hand);

		// 4턴 이하로 나갈 수 있고 높은 카드가 있으면
		if (turnsNeeded <= 4) {
			const normalCards = hand.filter(c => c.type === 'normal') as NormalCard[];
			const hasAce = normalCards.some(c => c.rank === 14);
			const hasDragon = hand.some(c => c.type === 'special' && c.special === 'dragon');
			// 드래곤이나 에이스가 있어야 선 잡을 수 있음
			if (hasDragon || hasAce) return true;
		}

		return false; // 불확실하면 안 부름
	},

	decideDragonGiftOverride(context, seat) {
		// 기본 로직 사용 (카드 많은 상대에게)
		return null;
	},

	decideWishOverride(hand, context, givenToOpponents) {
		// 상대에게 준 카드 랭크
		if (givenToOpponents.length > 0) {
			const myRanks = new Set<number>(
				hand.filter(c => c.type === 'normal').map(c => (c as NormalCard).rank as number)
			);
			// 내가 가지고 있지 않은 랭크 우선
			const validWishes = givenToOpponents.filter(r => !myRanks.has(r));
			if (validWishes.length > 0) return validWishes[0];

			// 내가 2장 이상 가지고 있으면 OK
			for (const rank of givenToOpponents) {
				const count = hand.filter(
					c => c.type === 'normal' && (c as NormalCard).rank === rank
				).length;
				if (count >= 2) return rank;
			}
		}

		return 'default'; // 기본 로직
	},

	shouldLeadDragon(hand, context) {
		// 점수 없는 트릭에서 나갈 수 있을 때만 사용
		// 드래곤 리드 → 선물해야 함 → 점수 손실
		// 리드에서는 트릭 포인트를 아직 모르므로, 나갈 수 있는지만 확인
		const handWithoutDragon = hand.filter(
			c => !(c.type === 'special' && c.special === 'dragon')
		);
		const turnsNeeded = estimateSimpleTurns(handWithoutDragon);

		// 드래곤 빼고 2턴 이하로 나갈 수 있으면 드래곤 리드 OK
		if (turnsNeeded <= 2) return true;

		return false; // 그 외에는 사용 안 함
	}
};

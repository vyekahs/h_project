import type { PresetBehavior } from './types';
import { selectBestPartnerCard } from './types';
import type { Card, NormalCard, Combination, SeatIndex } from '../../types';
import type { AiDecisionContext } from '../types';
import { findAllPlayableCombinations, estimateSimpleTurns } from '../handEvaluator';
import { buildCardTracker } from '../cardTracker';
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

	// scoreLeadCandidate 오버라이드는 제거했다.
	//
	// "멀티카드 콤보 크기에 큰 보너스(cards.length * 8) + 싱글 후순위"였는데,
	// 큰 조합을 먼저 털게 만들어 강한 자산을 이른 트릭에 낭비했다.
	// 기본 리드 로직은 나가기 효율(exitRate)과 승률을 함께 보고 고르는데
	// 이 훅이 그걸 덮어썼다.
	// (절제 실험: 팀 A=공격적 / 팀 B=밸런스 고정, 1230라운드 —
	//  훅 켬 팀 점수차 +13.8 → 훅 끔 +33.2, 약 5.7σ)
	// "빠르게 나간다"는 성격은 aggressiveness·tichoPropensity 가중치가 표현한다.


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

	decideWishOverride() {
		// 기본 로직 사용.
		// 기존에는 "내 손패에 없는 높은 랭크(A→K→Q→J)"를 소원으로 불렀는데, 소원은
		// 상대뿐 아니라 **파트너도** 구속한다. 높은 랭크를 부르면 파트너가 아껴둬야 할
		// A/K를 원치 않는 시점에 강제로 내게 되고, 상대는 어차피 트릭을 먹으려 낼 카드라
		// 방해 효과도 작다. (절제 실험: 이 훅을 끄면 팀 점수차 +8.4 개선)
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


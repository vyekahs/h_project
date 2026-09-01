import type { PresetBehavior } from './types';
import { selectBestPartnerCard } from './types';
import type { Card, NormalCard, Combination, SeatIndex } from '../../types';
import type { AiDecisionContext } from '../types';
import { getTeam, getPartnerSeat, getLeftSeat, getRightSeat } from '../../constants';
import { isBomb } from '../../combinations';

/**
 * 수비적 (Defensive) 프리셋 고유 행동
 *
 * 핵심: 파트너가 먼저 나가길 원함. 확실히 나가는 게 아니면 파트너 위주 플레이.
 * - 교환: 파트너에게 좋은 카드 (A/K 싱글)
 * - 리드: 기본 로직 (낮은 카드 우선)
 * - 팔로우: 최소한의 카드로 이김
 * - 파트너 트릭: 항상 패스
 * - Dog: 적극 사용 (파트너에게 리드 양보)
 * - 폭탄: 최대한 아껴둠 (상대 티츄 저지 등 필요할 때만)
 * - 티츄: 절대 안 부름
 * - 드래곤 선물: 왼쪽 상대에게, 왼쪽 5장 이하면 오른쪽에게
 * - Wish: 기본 로직
 */
export const defensiveBehavior: PresetBehavior = {
	selectPartnerExchangeCard(hand, singletons, rankGroups, protectedIds) {
		return selectBestPartnerCard(hand, singletons, rankGroups, protectedIds);
	},

	onPartnerWinning() {
		// 항상 패스
		return 'pass';
	},

	shouldPlayDog(hand, partner, context) {
		// 적극 사용 — 파트너가 아직 나가지 않았으면 거의 항상 사용
		if (partner.finishOrder !== null) return false;
		return true;
	},

	scoreLeadCandidate(combo, hand, context) {
		// 기본 로직 사용 (낮은 카드 우선)
		// 파트너가 낼 수 있는 콤보 타입 고려: 패가 많은 타입 우선
		const partnerSeat = getPartnerSeat(context.currentSeat);
		const partner = context.players[partnerSeat];

		if (partner.finishOrder !== null) return null; // 파트너 나갔으면 기본

		let score = 0;

		// 낮은 랭크 우선
		score -= combo.rank * 2;

		// 파트너가 패가 적으면 싱글 위주로 (파트너가 따라갈 수 있게)
		if (partner.hand.length <= 5 && combo.type === 'single') {
			score += 8;
		}

		// 멀티카드 콤보도 OK (파트너가 이어서 리드 잡을 수 있으니)
		score += combo.cards.length * 2;

		// 폭탄 보존
		if (isBomb(combo)) {
			score -= 50;
		}

		return score;
	},

	scoreFollowCandidate(play, hand, context, trickPoints, opponentWinning) {
		// 최소한의 카드로 이김
		let score = 0;

		if (opponentWinning) {
			// 상대가 이기고 있으면 가장 약한 카드로 뺏기
			score = 15 - play.rank * 3;
		} else {
			// 파트너가 이기고 있으면 패스 선호
			score = -30;
		}

		return score;
	},

	shouldUseBomb(hand, bombs, context, lastPlay) {
		const myTeam = getTeam(context.currentSeat);
		const playTeam = getTeam(lastPlay.seat);
		if (playTeam === myTeam) return 'skip';

		// 상대 티츄 저지: 티츄 선언한 상대가 나갈 것 같을 때만
		const opponentWithTichu = context.players.find(
			p =>
				getTeam(p.seat) !== myTeam &&
				(p.grandTichu === true || p.smallTichu) &&
				p.finishOrder === null &&
				p.hand.length <= 3
		);
		if (opponentWithTichu) {
			return null; // 기본 로직으로 (폭탄 사용)
		}

		// 상대가 나가기 직전이면 저지
		const opponentAboutToFinish = context.players.some(
			p => getTeam(p.seat) !== myTeam && p.finishOrder === null && p.hand.length <= 2
		);
		if (opponentAboutToFinish) return null;

		// 고득점 트릭은 수비적이어도 막는다.
		// 끝까지 아끼기만 하면 폭탄은 라운드 종료 시 손패에 남아 상대 점수가 될 뿐이다.
		// (실측: 수비적 30라운드 동안 폭탄 사용 0회 — 사실상 사장된 자원이었음)
		const trickPoints = (context.trick?.plays ?? [])
			.flatMap(p => p.combination.cards)
			.reduce((sum, c) => {
				if (c.type === 'special') return sum + (c.special === 'dragon' ? 25 : c.special === 'phoenix' ? -25 : 0);
				if (c.rank === 5) return sum + 5;
				if (c.rank === 10 || c.rank === 13) return sum + 10;
				return sum;
			}, 0);
		if (trickPoints >= 15) return null;

		// 그 외에는 최대한 아껴둠
		return 'skip';
	},

	shouldDeclareGrandTichu() {
		// 기본 로직에 위임 — tichoPropensity 0.15가 이미 5개 프리셋 중 가장 보수적인
		// 임계값(≈상위 2%)을 만든다. 하드코딩 false는 "수비적"을 넘어 기능 자체를
		// 없애버려서 프리셋이 고장난 것처럼 느껴졌다.
		return null;
	},

	shouldDeclareSmallTichu() {
		// 위와 동일 — 기본 로직 + 가장 높은 임계값(≈상위 10%)으로 보수성을 표현
		return null;
	},

	decideDragonGiftOverride(context, seat) {
		const myTeam = getTeam(seat);
		const leftSeat = getLeftSeat(seat) as SeatIndex;
		const rightSeat = getRightSeat(seat) as SeatIndex;

		const leftPlayer = context.players[leftSeat];
		const rightPlayer = context.players[rightSeat];

		// 왼쪽이 상대팀인지 확인
		const leftIsOpponent = getTeam(leftSeat) !== myTeam;
		const rightIsOpponent = getTeam(rightSeat) !== myTeam;

		if (leftIsOpponent && rightIsOpponent) {
			const leftFinished = leftPlayer.finishOrder !== null;
			const rightFinished = rightPlayer.finishOrder !== null;

			// 이미 나간 상대에게 주지 않도록 함 — 둘 다 나갔으면 기본 로직(safe fallback)에 맡김.
			// (기존 코드는 왼쪽이 나갔으면 오른쪽 상태를 확인 안 하고 무조건 오른쪽으로 보냈음)
			if (leftFinished && rightFinished) return null;
			if (leftFinished) return rightSeat;
			if (rightFinished) return leftSeat;

			// 둘 다 진행 중: 카드 적은(5장 이하) 쪽은 피하고 반대쪽에게
			if (leftPlayer.hand.length <= 5) return rightSeat;
			return leftSeat;
		}

		// 상대가 한 명만 남은 경우 (이 게임의 고정 대각선 팀 배치상 실제로는 도달하지 않지만 방어적으로 처리)
		if (leftIsOpponent) return leftPlayer.finishOrder !== null ? null : leftSeat;
		if (rightIsOpponent) return rightPlayer.finishOrder !== null ? null : rightSeat;

		return null; // 기본 로직
	},

	decideWishOverride() {
		// 기본 로직
		return 'default';
	},

	shouldLeadDragon(hand, context) {
		// 드래곤은 선물해야 하므로 가능한 사용 안 함
		// 패가 2장 이하일 때만 기본 로직에 맡김
		if (hand.length <= 2) return null;
		return false;
	}
};

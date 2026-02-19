import { type PresetBehavior, isTichuCaliberHand } from './types';
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
		// 수비적은 티츄를 거의 안 부르므로 항상 파트너에게 가장 높은 카드를 줌
		// 단, 티츄급 패면 A/K 싱글톤만
		if (isTichuCaliberHand(hand)) {
			const highSingletons = singletons
				.filter(c => !protectedIds.has(c.id) && c.rank >= 13)
				.sort((a, b) => b.rank - a.rank);
			return highSingletons.length > 0 ? highSingletons[0] : null;
		}

		const normalCards = hand.filter(c => c.type === 'normal') as NormalCard[];
		const highCards = normalCards
			.filter(c => !protectedIds.has(c.id))
			.sort((a, b) => b.rank - a.rank);

		return highCards.length > 0 ? highCards[0] : null;
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

		// 그 외에는 최대한 아껴둠
		return 'skip';
	},

	shouldDeclareGrandTichu() {
		// 절대 안 부름
		return false;
	},

	shouldDeclareSmallTichu() {
		// 절대 안 부름
		return false;
	},

	decideDragonGiftOverride(context, seat) {
		const myTeam = getTeam(seat);
		const leftSeat = getLeftSeat(seat) as SeatIndex;
		const rightSeat = getRightSeat(seat) as SeatIndex;

		// 왼쪽 상대에게
		const leftPlayer = context.players[leftSeat];
		const rightPlayer = context.players[rightSeat];

		// 왼쪽이 상대팀인지 확인
		const leftIsOpponent = getTeam(leftSeat) !== myTeam;
		const rightIsOpponent = getTeam(rightSeat) !== myTeam;

		if (leftIsOpponent && rightIsOpponent) {
			// 왼쪽 5장 이하면 오른쪽에게
			if (leftPlayer.finishOrder !== null || leftPlayer.hand.length <= 5) {
				return rightSeat;
			}
			return leftSeat;
		}

		// 상대가 한 명만 남은 경우
		if (leftIsOpponent) return leftSeat;
		if (rightIsOpponent) return rightSeat;

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

import type { PresetBehavior } from './types';
import { selectBestPartnerCard } from './types';
import type { Card, NormalCard, Combination, SeatIndex } from '../../types';
import type { AiDecisionContext } from '../types';
import { findAllPlayableCombinations, estimateSimpleTurns } from '../handEvaluator';
import { getTeam, getPartnerSeat } from '../../constants';
import { canBeat, isBomb } from '../../combinations';

/**
 * 밸런스 (Balanced / 모피) 프리셋 고유 행동
 *
 * 핵심: 적응형 — 점수 차이, 파트너 상태, 상대 위협에 따라 공수 전환.
 * - 교환: 파트너에게 좋은 카드 (A/K 싱글)
 * - 리드: adaptive 기반 — 지고 있으면 큰 콤보, 이기고 있으면 낮은 싱글
 * - 팔로우: adaptive 기반 — 공격적이면 적극 뺏기, 수비적이면 최소한
 * - 파트너 트릭: 파트너 패 ≤3 이면 패스
 * - Dog: adaptive 기반 — 수비 모드면 적극, 공격 모드면 안 씀
 * - 폭탄: 상대 티츄 저지 또는 고포인트 트릭에서만
 * - 티츄: 보수적 (높은 기준)
 * - 드래곤 리드: 지고 있을 때만
 */
export const balancedBehavior: PresetBehavior = {
	selectPartnerExchangeCard(hand, singletons, rankGroups, protectedIds) {
		return selectBestPartnerCard(hand, singletons, rankGroups, protectedIds);
	},

	scoreLeadCandidate(combo, hand, context) {
		const aggression = getAdaptiveAggression(context, hand);
		let score = 0;

		if (combo.type === 'single') {
			// 기본: 싱글 보너스
			score += 15;
			score -= combo.rank * 1.2;

			// 수비 모드: 싱글 추가 보너스 (낮은 카드 처리)
			if (aggression < 0.4) {
				score += 8;
			}
		} else {
			score -= combo.rank * 2;

			// 공격 모드: 멀티카드 콤보 보너스 (빨리 패 줄이기)
			if (aggression > 0.6) {
				score += combo.cards.length * 5;
			}
		}

		// 스트레이트/계단: 여러 장 처리
		if (combo.type === 'straight' || combo.type === 'stairs') {
			score += combo.cards.length * 2;
		}

		// 풀하우스
		if (combo.type === 'full_house') {
			score += 8;
		}

		// 폭탄 보존
		if (isBomb(combo)) {
			score -= 40;
		}

		// 드래곤 싱글 패널티
		if (combo.cards.some(c => c.type === 'special' && c.special === 'dragon')) {
			score -= 15;
		}

		return score;
	},

	scoreFollowCandidate(play, hand, context, trickPoints, opponentWinning) {
		const aggression = getAdaptiveAggression(context, hand);
		let score = 0;

		if (opponentWinning) {
			if (aggression > 0.6) {
				// 공격 모드: 적극 뺏기
				score = 15 - play.rank;
				if (trickPoints >= 10) score += trickPoints * 0.8;
			} else if (aggression < 0.4) {
				// 수비 모드: 최소한으로 뺏기
				score = 8 - play.rank * 2;
			} else {
				// 중립: 보통 수준으로 뺏기
				score = 10 - play.rank * 1.5;
				if (trickPoints >= 10) score += trickPoints * 0.5;
			}
		} else {
			// 파트너가 이기고 있으면 패스 선호
			score = -20;
		}

		return score;
	},

	onPartnerWinning(hand, lastCombo, context) {
		const partnerSeat = getPartnerSeat(context.currentSeat);
		const partner = context.players[partnerSeat];

		// 파트너가 거의 나갈 때: 무조건 패스
		if (partner.hand.length <= 3) {
			return 'pass';
		}

		return null; // 기본 로직
	},

	shouldPlayDog(hand, partner, context) {
		if (partner.finishOrder !== null) return false;

		const aggression = getAdaptiveAggression(context, hand);

		// 수비 모드: 파트너에게 리드 양보 (적극 사용)
		if (aggression < 0.4) {
			return true;
		}

		// 공격 모드: 개 사용 안 함 (내가 리드 유지)
		if (aggression > 0.7) {
			return false;
		}

		return null; // 중립: 기본 로직
	},

	shouldUseBomb(hand, bombs, context, lastPlay) {
		const myTeam = getTeam(context.currentSeat);
		const playTeam = getTeam(lastPlay.seat);
		if (playTeam === myTeam) return 'skip';

		// 상대 티츄 저지: 티츄 선언한 상대가 나갈 것 같을 때
		const opponentWithTichu = context.players.find(
			p =>
				getTeam(p.seat) !== myTeam &&
				(p.grandTichu === true || p.smallTichu) &&
				p.finishOrder === null &&
				p.hand.length <= 4
		);
		if (opponentWithTichu) {
			const beatable = bombs.filter(b => canBeat(lastPlay.combination, b));
			if (beatable.length > 0) {
				beatable.sort((a, b) => a.rank - b.rank);
				return beatable[0];
			}
		}

		// 고포인트 트릭: 20점 이상이면 폭탄 사용
		if (context.trick) {
			let trickPoints = 0;
			for (const p of context.trick.plays) {
				for (const card of p.combination.cards) {
					if (card.type === 'special') {
						if (card.special === 'dragon') trickPoints += 25;
						if (card.special === 'phoenix') trickPoints -= 25;
					} else {
						if (card.rank === 5) trickPoints += 5;
						if (card.rank === 10 || card.rank === 13) trickPoints += 10;
					}
				}
			}
			if (trickPoints >= 20) {
				const beatable = bombs.filter(b => canBeat(lastPlay.combination, b));
				if (beatable.length > 0) {
					beatable.sort((a, b) => a.rank - b.rank);
					return beatable[0];
				}
			}
		}

		return 'skip'; // 그 외: 보존
	},

	shouldDeclareGrandTichu() {
		// 보수적: 거의 안 부름
		return false;
	},

	shouldDeclareSmallTichu(hand, context) {
		// 보수적: 매우 확실할 때만
		const turnsNeeded = estimateSimpleTurns(hand);

		if (turnsNeeded <= 3) {
			const normalCards = hand.filter(c => c.type === 'normal') as NormalCard[];
			const hasAce = normalCards.some(c => c.rank === 14);
			const hasDragon = hand.some(c => c.type === 'special' && c.special === 'dragon');
			if (hasDragon || hasAce) return true;
		}

		return false;
	},

	decideDragonGiftOverride() {
		return null; // 기본 로직
	},

	decideWishOverride() {
		return 'default'; // 기본 로직
	},

	shouldLeadDragon(hand, context) {
		const aggression = getAdaptiveAggression(context, hand);

		// 공격 모드: 기본 로직에 맡김
		if (aggression > 0.6) return null;

		// 수비/중립 모드: 드래곤 리드 안 함 (선물해야 하므로)
		if (hand.length <= 2) return null; // 패가 거의 없으면 기본 로직
		return false;
	}
};

/**
 * 적응형 공격성 계수 계산 (0.0 ~ 1.0)
 * 점수 차이, 파트너 상태, 상대 위협 등을 종합적으로 고려
 */
function getAdaptiveAggression(context: AiDecisionContext, hand: Card[]): number {
	const myTeam = getTeam(context.currentSeat);
	const partnerSeat = getPartnerSeat(context.currentSeat);
	const partner = context.players[partnerSeat];

	let aggression = 0.5;

	// 점수 차이 기반 조정
	const myScore = myTeam === 'A' ? context.cumulativeScoreA : context.cumulativeScoreB;
	const opScore = myTeam === 'A' ? context.cumulativeScoreB : context.cumulativeScoreA;
	const scoreDiff = myScore - opScore;

	if (scoreDiff <= -100) {
		aggression += 0.25; // 크게 지고 있음 → 공격
	} else if (scoreDiff <= -50) {
		aggression += 0.15;
	} else if (scoreDiff >= 100) {
		aggression -= 0.2; // 크게 이기고 있음 → 수비
	} else if (scoreDiff >= 50) {
		aggression -= 0.1;
	}

	// 파트너 상태 반응
	if (partner.finishOrder === null && partner.hand.length <= 5) {
		aggression -= 0.1; // 파트너가 거의 나감 → 서포트
	}

	// 상대 티츄 선언 감지
	const opponentTichu = context.players.some(
		p =>
			getTeam(p.seat) !== myTeam &&
			(p.grandTichu === true || p.smallTichu) &&
			p.finishOrder === null
	);
	if (opponentTichu) {
		aggression += 0.1; // 저지 필요 → 공격
	}

	// 내 패가 적으면 나갈 수 있음 → 공격
	if (hand.length <= 5) {
		aggression += 0.1;
	}

	return Math.max(0, Math.min(1, aggression));
}

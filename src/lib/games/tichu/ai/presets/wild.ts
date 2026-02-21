import type { PresetBehavior } from './types';
import type { Card, NormalCard, Combination, SeatIndex } from '../../types';
import type { AiDecisionContext } from '../types';
import { findAllPlayableCombinations, findBeatablePlays, findBombs, estimateSimpleTurns } from '../handEvaluator';
import { getTeam, getPartnerSeat } from '../../constants';
import { canBeat, isBomb } from '../../combinations';

/**
 * 변칙적 (Wild) 프리셋 고유 행동
 *
 * 핵심: 파트너 상관 없이 본인이 이길 수 있는 수를 우선 사용.
 * - 교환: 파트너에게 특수/A/K 제외 높은 싱글(8~Q)
 * - 마작: 모든 콤보에 속하지 않을 때만 파트너에게 줌
 * - 파트너 트릭: 뺏음 (단 파트너가 티츄/10+카드/5장이하면 안뺏음)
 * - Dog: 선먹기 카드 충분할 때만 사용
 * - 리드: 낮은 싱글 → 큰 콤보 → 높은 싱글(선먹기)
 * - 팔로우: 선 확보 목적으로만 뺏음
 * - 폭탄: 상대 티츄가 나갈 것 같을 때, 내가 나갈 것 같을 때만
 * - 드래곤 선물: 상대 중 카드 많은 사람에게
 * - Wish: 교환 때 상대에게 준 카드 랭크
 */
export const wildBehavior: PresetBehavior = {
	selectPartnerExchangeCard(hand, singletons, rankGroups, protectedIds) {
		// 특수카드/A/K 제외한 높은 싱글(8~Q) 중에서 선택
		const candidates = singletons
			.filter(c => {
				if (protectedIds.has(c.id)) return false;
				// 8~12 (Q) 범위
				return c.rank >= 8 && c.rank <= 12;
			})
			.sort((a, b) => b.rank - a.rank); // 높은 것부터

		if (candidates.length > 0) {
			return candidates[0];
		}

		// 싱글이 없으면 8~Q 범위의 일반 카드에서 선택
		const normalCards = hand.filter(c => c.type === 'normal') as NormalCard[];
		const fallback = normalCards
			.filter(c => {
				if (protectedIds.has(c.id)) return false;
				return c.rank >= 8 && c.rank <= 12;
			})
			.sort((a, b) => b.rank - a.rank);

		return fallback.length > 0 ? fallback[0] : null;
	},

	shouldGiveMahjongToPartner(hand) {
		// 마작이 어떤 콤보에도 속하지 않으면 파트너에게 줌
		const allCombos = findAllPlayableCombinations(hand);
		const mahjongInCombo = allCombos.some(
			combo =>
				combo.type !== 'single' &&
				combo.cards.some(c => c.type === 'special' && c.special === 'mahjong')
		);
		// 어떤 멀티카드 콤보에도 속하지 않으면 true (파트너에게 줌)
		return !mahjongInCombo;
	},

	onPartnerWinning(hand, lastCombo, context) {
		const partnerSeat = getPartnerSeat(context.currentSeat);
		const partner = context.players[partnerSeat];

		// 예외: 파트너가 티츄 선언 → 안 뺏음
		if (partner.grandTichu === true || partner.smallTichu) {
			return null; // 기본 로직 (패스)
		}
		// 예외: 파트너가 10 이상의 카드를 냈다
		if (lastCombo.rank >= 10) {
			return null; // 기본 로직 (패스)
		}
		// 예외: 파트너가 5장 이하의 카드를 지니고 있다
		if (partner.hand.length <= 5) {
			return null; // 기본 로직 (패스)
		}

		// 그 외에는 뺏음 — 이길 수 있는 가장 약한 카드로
		const beatable = findBeatablePlays(hand, lastCombo);
		const nonBombs = beatable.filter(c => !isBomb(c));
		if (nonBombs.length > 0) {
			nonBombs.sort((a, b) => a.rank - b.rank);
			return nonBombs[0].cards.map(c => c.id);
		}
		return 'pass';
	},

	shouldPlayDog(hand, partner, context) {
		// 개를 주고도 선을 잡을 수 있으면 사용
		// "선먹기 카드" = A, K, dragon 등 높은 싱글
		const handWithoutDog = hand.filter(
			c => !(c.type === 'special' && c.special === 'dog')
		);
		const normalCards = handWithoutDog.filter(c => c.type === 'normal') as NormalCard[];
		const hasDragon = handWithoutDog.some(
			c => c.type === 'special' && c.special === 'dragon'
		);
		const highSingles = normalCards.filter(c => c.rank >= 13).length;

		// 드래곤이 있거나 A/K 가 2장 이상이면 선 잡을 수 있다고 판단
		if (hasDragon || highSingles >= 2) {
			return true;
		}
		// 피닉스 + A/K 조합도 선 확보 가능
		const hasPhoenix = handWithoutDog.some(
			c => c.type === 'special' && c.special === 'phoenix'
		);
		if (hasPhoenix && highSingles >= 1) {
			return true;
		}
		return false; // 선 잡기 어려우면 사용하지 않음
	},

	scoreLeadCandidate(combo, hand, context) {
		// 변칙적 리드 순서: 낮은 싱글 → 큰 콤보 → 높은 싱글(선먹기)
		let score = 0;

		if (combo.type === 'single') {
			const card = combo.cards[0];
			if (card.type === 'special' && card.special === 'mahjong') {
				score = 100; // 마작은 최우선
			} else if (card.type === 'special' && card.special === 'dragon') {
				score = -30; // 드래곤은 선먹기용이므로 나중에
			} else if (card.type === 'special' && card.special === 'phoenix') {
				score = -20; // 피닉스도 보존
			} else if (card.type === 'normal') {
				if (card.rank <= 7) {
					// 낮은 싱글: 최우선
					score = 80 - card.rank * 2;
				} else if (card.rank <= 10) {
					// 중간 싱글
					score = 30 - card.rank;
				} else {
					// 높은 싱글 (J, Q, K, A): 선먹기용이므로 나중에
					score = -10 - (card.rank - 10);
				}
			}
		} else if (isBomb(combo)) {
			score = -40; // 폭탄은 보존
		} else {
			// 멀티카드 콤보: 중간 우선순위
			// 큰 콤보일수록 높은 점수 (패 줄이기)
			score = 40 + combo.cards.length * 5;
			// 낮은 랭크 콤보 선호
			score -= combo.rank * 1.5;
		}

		return score;
	},

	scoreFollowCandidate(play, hand, context, trickPoints, opponentWinning) {
		// 선 확보 목적으로만 뺏음, 파트너 도움 X
		let score = 0;

		if (opponentWinning) {
			// 상대가 이기고 있을 때: 가장 약한 카드로 뺏기 (선 확보)
			score = 10 - play.rank * 2;
		} else {
			// 파트너나 내가 이기고 있으면 패스하고 싶음
			// 점수 낮게 줘서 기본 로직이 패스 선호하도록
			score = -20;
		}

		return score;
	},

	shouldUseBomb(hand, bombs, context, lastPlay) {
		const myTeam = getTeam(context.currentSeat);
		const playTeam = getTeam(lastPlay.seat);
		if (playTeam === myTeam) return 'skip';

		// 상대 중 티츄 선언자가 나갈 것 같을 때
		const opponentWithTichu = context.players.find(
			p =>
				getTeam(p.seat) !== myTeam &&
				(p.grandTichu === true || p.smallTichu) &&
				p.finishOrder === null &&
				p.hand.length <= 3
		);
		if (opponentWithTichu) {
			const beatable = bombs.filter(b => canBeat(lastPlay.combination, b));
			if (beatable.length > 0) {
				beatable.sort((a, b) => a.rank - b.rank);
				return beatable[0];
			}
		}

		// 내가 나갈 것 같을 때 (폭탄 쓰고도 나갈 수 있으면)
		if (hand.length <= 6) {
			for (const bomb of bombs) {
				if (!canBeat(lastPlay.combination, bomb)) continue;
				const remaining = hand.filter(c => !bomb.cards.some(bc => bc.id === c.id));
				const remainingCombos = findAllPlayableCombinations(remaining);
				const nonBombCombos = remainingCombos.filter(c => !isBomb(c) && c.type !== 'single');
				// 남은 패로 몇 턴 안에 나갈 수 있는지 대략 계산
				const turnsNeeded = estimateSimpleTurns(remaining);
				if (turnsNeeded <= 3) {
					return bomb;
				}
			}
		}

		return 'skip'; // 그 외에는 사용하지 않음
	},

	shouldDeclareGrandTichu: () => null, // 기본 로직
	shouldDeclareSmallTichu: () => null, // 기본 로직

	decideDragonGiftOverride(context, seat) {
		// 상대 중 카드 많은 사람에게
		const myTeam = getTeam(seat);
		const opponents = context.players.filter(
			p => getTeam(p.seat) !== myTeam && p.finishOrder === null
		);
		if (opponents.length <= 1) return null; // 기본 로직

		opponents.sort((a, b) => b.hand.length - a.hand.length);
		return opponents[0].seat;
	},

	decideWishOverride(hand, context, givenToOpponents) {
		// 교환 때 상대에게 준 카드 랭크를 부름
		if (givenToOpponents.length > 0) {
			// 내가 가지고 있지 않은 랭크 중에서 준 카드 선택
			const myRanks = new Set<number>(
				hand.filter(c => c.type === 'normal').map(c => (c as NormalCard).rank as number)
			);
			const validWishes = givenToOpponents.filter(r => !myRanks.has(r));
			if (validWishes.length > 0) {
				return validWishes[0];
			}
			// 내가 가지고 있어도 2장 이상이면 OK
			for (const rank of givenToOpponents) {
				const count = hand.filter(
					c => c.type === 'normal' && (c as NormalCard).rank === rank
				).length;
				if (count >= 2) return rank;
			}
		}

		// 낮은 스트레이트 완성 중간숫자 부르기
		const normalCards = hand.filter(c => c.type === 'normal') as NormalCard[];
		const sortedRanks = [...new Set(normalCards.map(c => c.rank))].sort((a, b) => a - b);

		// 낮은 연속 카드 찾기 (스트레이트 후보)
		if (sortedRanks.length >= 3) {
			for (let i = 0; i < sortedRanks.length - 1; i++) {
				const gap = sortedRanks[i + 1] - sortedRanks[i];
				if (gap === 2) {
					// 중간에 빈 숫자가 있음 → 그 숫자를 부름
					const middleRank = sortedRanks[i] + 1;
					if (middleRank >= 2 && middleRank <= 14) {
						return middleRank;
					}
				}
			}
		}

		return 'default'; // 기본 로직으로 폴백
	},

	shouldLeadDragon(hand, context) {
		// 드래곤은 선먹기용이므로 리드에는 잘 안 씀
		// 패가 3장 이하이고 나갈 수 있을 때만
		if (hand.length <= 3) return null; // 기본 로직에 맡김
		return false; // 리드에 드래곤 사용 안 함
	}
};

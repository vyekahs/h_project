/**
 * 캐릭터 습관 — 사람 기록에서 "어떤 조건이 **겹칠 때** 그 카드를 내는가"를 뽑아 옮긴 규칙.
 *
 * 기록(사람 832라운드)을 한 수씩 재생해서, 카드가 나온 순간뿐 아니라 쥐고도 안 낸 순간까지
 * 조건 조합별로 셌다. 폭탄이 대표적이다 — 실제로 승부가 난 트릭만 보면:
 *
 *   조건 (모두 AND)                                     사람     예전 AI
 *   상대가 먹는 트릭 · 그 상대 2장 이하                   약 60%   100%
 *   상대가 먹는 트릭 · 폭탄을 내면 0~1턴에 나감            약 80%   대체로 100%
 *   상대 3~5장 · 15점 이상                               4/7      86%
 *   상대 6장 이상 · 나도 2턴 이상 남음 · 15점 이상         15%      아랭 70 / 오딘 80 / 라미 100%
 *       (사람 중 라미만 5/10 — 전부 용이 깔린 25점 이상 트릭. 나머지는 3/50)
 *   상대 6장 이상 · 나도 2턴 이상 남음 · 15점 미만         12%      아랭 49 / 메모 21%
 *   내 카드가 먹는 트릭 · 폭탄이 내 마지막 장들            7/9      0% (할 수 없었음)
 *       (아랭·라미만. 한 장 남을 땐 4/11, 그 이상 남으면 0/6. 메모 0/8, 오딘 0/9)
 *
 * 사람은 "상대가 곧 나간다" 또는 "내가 곧 나간다"가 걸려야 폭탄을 쓴다. 점수만 보고
 * 터뜨리는 건 라미뿐이고, 별일 없는 트릭에서는 아무도 안 쓴다.
 *
 * 검증: 같은 패를 팀만 바꿔 두 번씩 친 시뮬레이션(48묶음, 12,327라운드)에서 이 규칙과
 * 다시 학습한 모델·티츄 저지를 합친 새 AI가 예전 AI보다 라운드당 +3.5점(±2.8), 게임 승률 54.4%.
 *
 * 카드 내기의 나머지 경향(용·A·봉황·패스)은 humanModel.ts의 상황 보정에 있다.
 */
import type { Card, Combination } from '../types';
import type { AiDecisionContext } from './types';
import type { CharacterHabits } from './presets/types';
import { getTeam, getPartnerSeat, getCardPoints } from '../constants';
import { isBomb } from '../combinations';
import { findAllPlayableCombinations, findBombs, findOptimalPartition } from './handEvaluator';

/** 폭탄을 빼고 손패를 비우는 데 필요한 턴 수 */
export function turnsToEmpty(cards: Card[]): number {
	if (cards.length === 0) return 0;
	return findOptimalPartition(cards, findAllPlayableCombinations(cards).filter(c => !isBomb(c))).turns;
}

function trickPoints(context: AiDecisionContext): number {
	return (context.trick?.plays ?? []).flatMap(p => p.combination.cards).reduce((sum, c) => sum + getCardPoints(c), 0);
}

/**
 * 상대가 낸 카드 위에 폭탄을 낼지 (끼어들기).
 * "그 상대가 2장 이하"는 호출하는 쪽(shouldPlayBomb)에서 먼저 처리한다.
 * beatable: 지금 바닥을 이길 수 있는 내 폭탄들, 약한 것부터.
 */
export function decideHabitBomb(
	context: AiDecisionContext,
	lastPlay: { seat: number; combination: Combination },
	beatable: Combination[],
	habits: CharacterHabits
): Combination | null {
	const { hand, players, currentSeat } = context;
	const myTeam = getTeam(currentSeat);

	// 폭탄을 내면 0~1턴에 나간다
	for (const bomb of beatable) {
		const rest = hand.filter(c => !bomb.cards.some(b => b.id === c.id));
		if (turnsToEmpty(rest) <= 1) return bomb;
	}

	// 상대 폭탄 위에는 위 경우(와 호출부의 "막아야 할 때")에만 덮는다
	if (isBomb(lastPlay.combination)) return null;

	// 티츄를 부른 상대가 4장 이하 (7장으로 넓혀 봤지만 선언 성공률이 오히려 +1.2%p — 일찍 쓰면 막판에 없다)
	const callerClose = players.some(p =>
		getTeam(p.seat) !== myTeam && p.finishOrder === null &&
		(p.grandTichu === true || p.smallTichu) && p.hand.length <= 4
	);
	if (callerClose) return beatable[0];

	const points = trickPoints(context);
	// 그 상대가 5장 이하 AND 15점 이상
	if (players[lastPlay.seat].hand.length <= 5 && points >= 15) return beatable[0];

	// 점수만 보고 — 캐릭터에 따라
	if (habits.bombForPoints !== null && points >= habits.bombForPoints) return beatable[0];

	return null;
}

/**
 * 방금 내가 낸 카드 위에 폭탄을 얹어 바로 나갈지.
 * 폭탄이 마지막 장들일 때만 — 트릭을 먹고 나서 내는 것과 결과는 같지만, 그 사이에
 * 상대가 덮거나 먼저 나갈 틈을 주지 않는다.
 */
export function decideOwnTrickBomb(hand: Card[], habits: CharacterHabits): Combination | null {
	if (!habits.bombOwnTrick) return null;
	return findBombs(hand).find(b => b.cards.length === hand.length) ?? null;
}

/** 손패로 정해지는 0~1 값 — 같은 손패면 늘 같은 판단이 나오게 한다 */
function handUnit(hand: Card[]): number {
	let h = 2166136261;
	for (const id of hand.map(c => c.id).sort()) {
		for (let i = 0; i < id.length; i++) {
			h ^= id.charCodeAt(i);
			h = Math.imul(h, 16777619);
		}
	}
	return (h >>> 0) / 4294967296;
}

/**
 * 선을 잡았을 때 개를 낼지. ruleSaysDog: 규칙 AI의 판단.
 *
 * 기록: 손패가 많을 때는 잘 안 낸다(10장 이상 28%, 파트너까지 13장 이상이면 4/34).
 * 9장 이하로 줄면 60%대. 아랭은 일찍(10장 이상 35%), 라미는 중반에(5~9장 75%) 낸다.
 * 예전 AI는 아랭이 거의 늘 냈고(5~9장 97%) 라미는 거의 안 냈다(19%).
 */
export function decideDogLead(context: AiDecisionContext, habits: CharacterHabits, ruleSaysDog: boolean): boolean {
	const { hand, players, currentSeat } = context;
	const partner = players[getPartnerSeat(currentSeat)];
	const me = players[currentSeat];
	// 파트너가 나갔거나 끝내기 구간이면 규칙 AI가 순서를 따진다
	if (partner.finishOrder !== null || hand.length <= 4) return ruleSaysDog;
	const declared = (p: { grandTichu: boolean | null; smallTichu: boolean }) => p.grandTichu === true || p.smallTichu;
	// 파트너가 티츄를 불렀으면 선을 넘긴다
	if (declared(partner) && !declared(me)) return true;
	const rate = hand.length >= 10 ? habits.dogLead[0] : habits.dogLead[1];
	return handUnit(hand) < rate;
}

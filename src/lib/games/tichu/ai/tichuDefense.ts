/**
 * 티츄 저지 — 상대가 티츄를 부른 판에서 "막는 쪽"으로 두게 하는 보정.
 *
 * 기록(사람 832라운드)에서 사람 팀과 상대 AI 팀의 점수 차이는 라운드당 +63점이었고,
 * 그중 +33점이 사람의 티츄 보너스, 약 +23점이 원투였다. 카드 점수는 거의 같다.
 * 사람은 절반의 판에서 티츄를 부르고 71%를 성공한다 — 여기를 막지 못하면 다른 걸 고쳐도
 * 차이가 안 줄어든다.
 *
 * 학습 모델은 이 부분을 배우지 못했다. 사람 기록에서 사람은 거의 늘 **부르는 쪽**이라
 * "상대가 불렀을 때 어떻게 막는가"의 예시가 적다(판단 8,340번 중 617번). 그래서 규칙으로 보탠다.
 *
 * 실험 (tools/tichuStopBench.test.ts): 0번 자리가 판의 절반에서 티츄를 부르게 하고, 상대
 * 두 자리의 전술만 바꿔 같은 패를 다시 쳤다 (전술마다 약 3,000라운드, 기준 성공률 39.7%).
 *   부른 사람의 카드를 받는 수 +1      −3.8%p (±2.0)
 *                             +2      −5.8%p (±3.1)   ← 채택. 선언한 판의 부른 팀 점수 −22점
 *                             +3      −4.6%p
 *                             +5      −1.5%p          (무조건 받으면 손패가 망가져 효과가 사라진다)
 *   낮은 낱장 대신 조합으로 리드       −0.8 ~ −2.3%p  (오차 안)
 *   부른 사람 바로 앞에서 높은 낱장    −1.6%p         (오차 안)
 *   부른 사람이 7장 이하면 폭탄        +1.2%p         (오히려 나쁨 — habits.ts는 4장을 유지)
 *   전부 합침                         −3.4%p         (받기 하나만 쓴 것보다 못함)
 * 실험의 부르는 자리는 AI라 성공률이 40%다. 사람(71%) 상대로 얼마나 내려가는지는
 * 배포 후 기록의 선언 성공률로 확인할 것.
 */
import type { Combination, SeatIndex } from '../types';
import type { AiDecisionContext } from './types';
import { getTeam } from '../constants';
import { isBomb } from '../combinations';

export const __defense = {
	/** 실험용 스위치 */
	on: true,
	/** 부른 사람의 카드를 (폭탄 아닌 카드로) 받는 수에 더하는 값 */
	beatCaller: 2
};

const declared = (p: { grandTichu: boolean | null; smallTichu: boolean }) => p.grandTichu === true || p.smallTichu;

/**
 * 아직 살아 있는 상대 티츄의 주인. 없으면 null.
 * 누가 먼저 나갔으면 티츄는 이미 판가름 났고, 우리 팀이 불렀으면 우리 계획이 먼저다.
 */
export function liveOpposingCaller(ctx: AiDecisionContext): SeatIndex | null {
	if (ctx.players.some(p => p.finishOrder !== null)) return null;
	const myTeam = getTeam(ctx.currentSeat);
	if (ctx.players.some(p => getTeam(p.seat) === myTeam && declared(p))) return null;
	const callers = ctx.players.filter(p => getTeam(p.seat) !== myTeam && declared(p));
	if (callers.length === 0) return null;
	return (callers.find(p => p.grandTichu === true) ?? callers[0]).seat;
}

/** 후보마다 더할 값. 막을 티츄가 없으면 null */
export function defenseBias(ctx: AiDecisionContext, cands: (Combination | null)[]): number[] | null {
	if (!__defense.on) return null;
	const caller = liveOpposingCaller(ctx);
	if (caller === null) return null;
	const plays = ctx.trick?.plays ?? [];
	const callerOnTop = plays.length > 0 && plays[plays.length - 1].seat === caller;
	return cands.map(c => (c && !isBomb(c) && callerOnTop ? __defense.beatCaller : 0));
}

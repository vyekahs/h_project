/**
 * 순위가 오른 사람 때문에 밀려난 사람들의 순위 범위 (갱신 후 순위 기준).
 *
 * newRank로 올라간 사람이 원래 oldRank에 있었다면, 그 사이(newRank..oldRank-1)에 있던
 * 사람들이 한 칸씩 밀려 지금은 newRank+1..oldRank에 있다. 그 아래(oldRank+1 이하)는
 * 원래부터 그 사람보다 아래였으므로 밀려난 게 아니다.
 *
 * 예전 쿼리는 `rank <= oldRank + 1`이라 한 칸을 더 잡았다. 그래서 1·2위가 순위를
 * 주고받을 때마다 3위가 "OO님이 앞질렀어요" 알림을 받았다(9월 에너지 3위 Yoon님:
 * 에너지를 두 판 치고 잘못된 알림 66건).
 *
 * 처음 기록을 올린 사람(oldRank 없음)은 아래 전원을 밀어내지만, 알림은 바로 아래
 * 5명까지만 보낸다.
 */
export function displacedRankRange(newRank: number, oldRank: number | null): { above: number; upTo: number } {
	return { above: newRank, upTo: oldRank ?? newRank + 5 };
}

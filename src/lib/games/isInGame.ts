/**
 * 지금 미니게임을 플레이 중인 경로인지 판별한다.
 *
 * 새 버전이 배포되면 +layout.svelte가 60초마다 감지해 location.reload()를 부르는데,
 * 플레이 도중에 리로드되면 저장본을 다시 불러오면서 게임이 'paused'로 복귀한다
 * (= 갑자기 일시정지 창이 뜬다). 그래서 게임 중에는 리로드를 미룬다.
 *
 * 예전에는 게임 경로를 배열에 하드코딩했는데 게임이 추가돼도 갱신되지 않아
 * 블럭블라스터·프리셀 등 나중에 들어온 게임이 전부 보호에서 빠져 있었다.
 * 경로 규칙으로 판별해 새 게임이 생겨도 자동으로 포함되게 한다.
 *
 * /minigames            → 라운지 (게임 아님)
 * /minigames/start/xxx  → 시작 화면 (게임 아님)
 * /minigames/xxx        → 플레이 중
 */
export function isInGame(pathname: string): boolean {
	if (!pathname.startsWith('/minigames/')) return false;
	if (pathname.startsWith('/minigames/start/')) return false;
	return true;
}

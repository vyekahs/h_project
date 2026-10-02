/**
 * 되돌리기 창의 길이.
 *
 * adminUndo.ts 는 $lib/server 아래에 있고 db 를 import 한다. 「최근 조치」 패널이
 * 남은 시간을 표시하려면 이 값을 알아야 하는데, 클라이언트 컴포넌트는
 * $lib/server 를 import 할 수 없다(SvelteKit 이 막는다). 그래서 값 하나만
 * server 밖에 둔다 — 서버는 adminUndo.ts 가 이걸 재수출해 쓴다.
 */
export const UNDO_WINDOW_MS = 10 * 60 * 1000;

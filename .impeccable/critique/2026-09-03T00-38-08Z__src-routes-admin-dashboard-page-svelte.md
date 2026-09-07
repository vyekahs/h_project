---
target: 어드민 대시보드
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
timestamp: 2026-09-03T00-38-08Z
slug: src-routes-admin-dashboard-page-svelte
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | SSE가 3초마다 조용히 재접속만 함. `.rs-dot.live`는 연결 표시등처럼 보이지만 `attendeeCount > 0`에 묶임 |
| 2 | Match System / Real World | 2 | 「진행 중인 게임 (3)」 중 2판이 종료됨. 「대기 · 승인 큐 (5)」 중 2건은 확정돼 할 일 없음 |
| 3 | User Control and Freedom | 2 | 되돌리기 없음. 노쇼 처리는 취소+페널티+승계를 한 번에. 매니저 지정은 확인창 없음. 모달 뒤 배경 스크롤됨 |
| 4 | Consistency and Standards | 2 | `#e9ecef`이 "비활성"과 "누르세요" 양쪽. `--text-dark`를 배경으로 사용. 진행 중 게임 모달만 다른 색 체계 |
| 5 | Error Prevention | 3 | 차단 상태 처리는 최고 수준. 다만 `+30분`과 `게임 종료`가 8px 간격 전폭 인접 |
| 6 | Recognition Rather Than Recall | 2 | 큐 행 이름–버튼 700px. 매니저 여부는 시트를 열어야 확인. 「스플렌더」가 한 화면에 4번 |
| 7 | Flexibility and Efficiency | 2 | 일괄 승인 없음. 스킵 링크 없어 주 액션까지 Tab 7번 |
| 8 | Aesthetic and Minimalist Design | 2 | 흰 카드 5장이 테두리 `#eee` vs `#ddd` 하나로만 구분. 1280px 가로 절반 빈 공간 |
| 9 | Error Recovery | 3 | 차단 사유 설명은 좋음. 피커 오진, 필수 필드는 브라우저 기본 말풍선 |
| 10 | Help and Documentation | 2 | 매니저 지정이 무엇을 부여하는지 설명 없음 |
| **Total** | | **23/40** | **Acceptable** |

리뷰어(A) 24점에서 heuristic 2를 3→2로 조정. 끝난 게임 2판을 「진행 중」으로 세는 것은 시스템 모델과 현실의 직접 불일치이며 `+page.svelte:752`, `:630`에서 코드 확인.

## Design Specificity Verdict

**도메인 모델과 문구는 이 제품의 것, 구성과 시각 언어는 아님.**

구체적인 부분은 진짜다 — 방 현황 스트립, 성악설 위에 지어진 대기·승인 큐(차단 버튼 + 인라인 해법, `attendee_status !== 'present'` 기반 노쇼 판정, 임계 대비 `3/3` 배지), 사람·게임·후속 결과를 한 문장에 담는 확인 문구. CRUD 템플릿에서 공짜로 나오지 않는다.

한글 문자열을 걷어내면 네이비 사이드바, `#f5f5f5` 페이지, DOM 순서대로 쌓인 흰 카드 5장이 남는다. `section`과 `.section-primary`는 테두리 `#eee` vs `#ddd` 하나로만 다르다. 유일한 라이브 요소가 숫자 3칸 상자인데 세 번째 칸이 깨져 있다.

**디텍터**: exit 2, 2건 전부 오탐. `flat-type-hierarchy`는 토큰 선언 블록을 적용 스타일로 읽었고 유령 `18px`는 CSS 주석 안 산문에서 긁힌 것(실제 스케일 12/14/16/20/24/40, 하드코딩 0개). `monotonous-spacing`은 `line: 0`이 증거로 토큰 선언을 집계했다.

**디텍터가 놓친 진짜 버그**: `--text-2xl`이 `:1694`에서 쓰이나 `src/` 어디에도 정의 없음. 런타임상 `.rs-value-done`이 16px로 렌더.

**오버레이**: 헤드리스라 `[Human]` 탭 없음. 라이브 서버 8400 주입 성공·종료 확인, 콘솔 폴백. 유일한 실질 항목 `em-dash-overuse` 10개.

## Overall Impression

판단은 잘하는데 자기가 아는 것을 화면에 못 옮긴다. 서버는 어느 게임이 끝났는지·누가 차단됐는지·대기 몇 번이 승계될지 전부 알고 그 지식이 확인 문구에는 훌륭히 드러나는데, 운영자가 훑는 표면(카드 제목 숫자, 행의 명도, 스트립 세 번째 칸)에서는 사라지거나 뒤집힌다. 가장 큰 기회는 새 기능이 아니라 이미 아는 것을 표면에 올리는 것.

## What's Working

1. **큐의 차단 상태 저작** — 비활성화 + `title` + 이름 아래 사유·해법 빨간 글씨. 한 사실에 채널 셋.
2. **결과를 이름 붙이는 확인 문구, 열릴 때 계산됨** — `confirmSubmit`이 `message`를 함수로 받아 여는 시점 평가(`:189`). 구체적 미래를 서술한다.
3. **포커스 관리** — 두 모달 Tab 14회 중 0회 탈출, Escape, 트리거로 복원. 링 대비 본문 17.74:1 / 사이드바 5.25:1.

## Priority Issues

### [P0] 콘솔이 "지금 나를 필요로 하는 것"을 정확히 거꾸로 표시
게임 3판 중 2판이 종료됨인데 `--bg-surface` 배경 + `--text-secondary` 글자 + chevron 제거로 비활성처럼 보인다. 클릭 핸들러는 살아 있고 hover 피드백은 없다(`.game-list-item:hover`가 만료 행의 색과 동일). 아무것도 필요 없는 글룸헤이븐이 유일한 진한 chevron 행. 스트립의 `종료됨`은 `--text-2xl` 미정의로 40px 형제 옆에서 16px 렌더.
**Fix**: `--text-2xl` 정의 또는 `--text-xl` 교체. `.game-row.is-expired`에 `--color-warning-bg` + 좌측 3px 앰버 레일, `.list-name` `--text-primary` 유지, chevron 복원. → `$impeccable polish`

### [P1] 두 헤드라인 숫자가 거짓
`:752` `진행 중인 게임 ({(games||[]).length})`이 끝난 판 포함. `:630` `대기 · 승인 큐 ({queueTotal})`가 조치 불필요한 확정 2건 포함. 실제 막고 있는 항목은 3건.
**Fix**: `게임 (3) · 정리 대기 2`, `대기 · 승인 큐 (3)`. 제목이 진실이면 「승인 대기」 배지는 불필요. → `$impeccable clarify`

### [P1] `+ 새 게임 시작`이 거짓 빈 화면으로 열림
`pickerResults`(`:546`)가 `is_playing`을 전부 제외 → 8명이 3판 중인 지금은 전원 제외. 검색 전인데 "일치하는 참여자가 없습니다." `참석자 전원`도 `availableAttendees.length > 0` 조건으로 함께 사라짐. 탈출구는 틀린 메시지 아래 파란 텍스트 링크. `duration`은 `required`인데 `placeholder="60"`이라 채워진 값처럼 보이고 실패 시 브라우저 기본 말풍선.
**Fix**: 검색어 유무로 빈 상태 분기, 토글을 목록 위쪽 세그먼트로, `참석자 전원` 항상 렌더(사유 있는 비활성), `selectedDuration='60'` 초기화. → `$impeccable onboard`

### [P1] 전역 `button {}` 규칙이 primary를 기본값으로 만들고 컨트롤 하나를 망가뜨림
`:1976` `button { background: var(--color-blue-bright); color: white }`. 저장된 멤버 토글이 파란 primary로 렌더되고 hover 시 `.toggle-header:hover`가 같은 파랑 글자를 넣어 **1:1 대비**. 모바일에 전폭 파란 바 3개.
**Fix**: 기본 규칙을 transparent/inherit/none으로, `.btn-primary` 명시 요구. 토글은 텍스트 disclosure + 배경 틴트 hover. → `$impeccable distill`

### [P2] 계측이 잡은 접근성 결손
- WCAG 1.4.11 컨트롤 경계 15건이 **1.25–1.61:1**(3:1 필요). 최악 `메인으로` `#ddd` on `#f5f5f5` = 1.25:1. `관리`×8, `승인`×2, `게임 종료`×2. 글자는 읽히고 상자 가장자리만 안 보임
- 다이얼로그 8개 전부 접근 가능한 이름 없음(`:965,1112,1174,1197,1324,1368,1474,1555`). 각각 첫 자식 제목이 있으나 미연결. `AdminFeedback.svelte`는 제대로 함
- `<title>` 없음 → SvelteKit 안내 영역에 "untitled page"가 들어가 매 이동마다 낭독
- `<main>` 중첩 2개(`routes/+layout.svelte:121` 안에 `(dashboard)/+layout.svelte:80`), `<nav>` 2개 이름 없음, SVG 17개 `aria-hidden` 없음, 스킵 링크 없어 주 액션까지 Tab 7번
→ `$impeccable audit`

## Persona Red Flags

**매일 밤 여는 운영진**: 큐 5건 = 확인창 5회 왕복, 일괄 승인 없음 / 8명에게 조치하려면 시트 열기–실행–닫기 8번 / 큐 두 그룹이 둘 다 「스플렌더」, 구분자는 12px 시각 / 모든 행이 `관리` 하나뿐, 퇴장 직행 없음

**대타로 처음 들어온 매니저**: `매니저 지정`은 확인창도 설명도 없이 권한 부여하는데 되돌릴 수 있는 페널티 1점에는 확인창이 있음(위험 보정 반대) / 페널티 사유 select 레이블이 `sr-only`(`:1229`) / 헤더는 마감인데 스트립은 8명 3판, 설명 없음 / 관리 시트의 유일한 닫기가 밑줄 텍스트 링크

**시끄러운 방에서 한 손으로 폰**: 이름 링크가 375px에서 13.1×25px, 페이지에서 유일하게 44px 미달 / `취소` vs `예약 취소` 인접 / `+30분`과 `게임 종료` 8px 간격 전폭 인접 / 배경 스크롤 미잠금(scrollY 627→1027 확인) / 하단 고정 내비가 모달 백드롭 위에 그려지나 히트 테스트는 백드롭 → 누르면 모달이 닫힘

## Minor Observations

- 사이드바 `<h2>`가 페이지 `<h1>`보다 앞섬
- 아랭은 매니저인데 명단 행에 배지 없음(`can_manage_games`는 인터페이스에 있음, `:433`)
- 진행 중 게임 모달 참여자 목록이 `join(', ')` 문장 — 제거 불가
- 비활성 `.btn-queue-confirm`과 활성 `.btn-manage`가 같은 배경색
- 1280px에서 카드마다 가로 절반가량 빈 공간
- 모바일 상단 바 "관리자 콘솔"을 `<h1>`이 곧바로 재진술
- `prefers-reduced-motion` 블록 없음(남은 전환 10개는 전부 배경색 페이드 150–200ms)
- 디텍터 콘솔: 렌더 본문 em-dash 10개
- 타깃 밖이나 이 화면에 렌더: `NotificationToast.svelte:15` 컨테이너가 `{#if}`로 감싸이고 `aria-live`·`role` 없어 낭독되지 않음

## Questions to Consider

1. 스트립은 초과를 알고 행에는 이미 종료 버튼이 있는데 운영자는 왜 그걸 찾으러 스크롤하는가? 세 번째 칸이 회색 단어가 아니라 행동 가능한 것이 되면?
2. 대기·승인 큐가 조치 불필요한 확정을 보여준다. 이건 큐인가 예약 테이블인가? 엄격히 "당신을 기다리는 것"만이면 3건이고 배지는 불필요해진다.
3. 모든 액션이 사람 아니면 게임을 향하는데 IA는 엔티티 종류로 조직돼 있다. 테이블 단위로 조직하면? 게임 하나당 카드 하나에 참가자·남은 시간·대기 요청이 모이는, 방이 실제로 생긴 모양대로.
4. 노쇼 처리는 세 가지를 바꾸고 제3자에게 영향을 주는데 되돌리기가 없다. 5초 되돌리기의 비용 vs 운영자가 틀리는 비용?
5. 화면을 보지 않고도 할 수 있어야 하는 단 하나의 액션은 무엇인가? 답이 "큐의 다음 사람 확정"이라면 레이아웃 전체가 달라져야 한다.

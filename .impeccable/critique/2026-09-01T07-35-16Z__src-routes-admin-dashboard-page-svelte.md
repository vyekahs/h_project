---
target: 어드민 대시보드
total_score: 16
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-09-01T07-35-16Z
slug: src-routes-admin-dashboard-page-svelte
---
Method: dual-agent (A: design review · B: detector/browser evidence)

# 어드민 대시보드 크리틱

대상: src/routes/admin/(dashboard)/+page.svelte (2718줄) + +layout.svelte + 서브페이지 7종
모드: Operate

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | SSE 끊김 완전 무표시, 조용히 3초 재연결만 (+page.svelte:29-34) |
| 2 | Match System / Real World | 2 | 한 객체를 4개 이름으로: 게임 일정 등록(665)/시작 예정 게임 생성(1190)/예약 생성(1278)/예약 게임(1196) |
| 3 | User Control and Freedom | 2 | undo 0개. cancelPass는 확인 없이 유료 정기권 소멸 (passes:91-99) |
| 4 | Consistency and Standards | 1 | .btn-cancel이 대시보드=닫기(1899), passes=파기(281). 확인 방식 3종 혼재 |
| 5 | Error Prevention | 1 | 게임 종료 및 퇴장 한 번에 전원 게임 종료, 확인 없음 (1149-1159) |
| 6 | Recognition Rather Than Recall | 2 | 퇴장 확인이 파급범위 침묵(1115). label 없는 입력 11개 |
| 7 | Flexibility and Efficiency | 1 | 단축키 0, 40~60행 리스트에 검색/정렬/필터/일괄 0 (582-624) |
| 8 | Aesthetic and Minimalist | 2 | 서열 없는 7블록, .section-primary 이중 적용 (537,580) |
| 9 | Error Recovery | 2 | pending()만 쓴 폼이 서버 에러 전부 삼킴, form prop 없음 (75-94) |
| 10 | Help and Documentation | 1 | 페널티 3점의 결과/매니저 권한 범위 설명 0 |
| Total | | 16/40 | Poor — 운영자 안전성 축 구조적 보수 필요 |

평가 A는 17점, 합성 단계에서 #6을 3→2로 하향(B가 찾은 label 없는 입력 11곳 반영).
"Poor" 밴드는 화면 고장이 아니라 (1) 되돌릴 수 없는 정책 집행이 확인/피드백/기록 없이 실행됨 (2) 제품 핵심 메커니즘이 화면에 없음, 두 가지에서 나옴. 콘솔 에러 0, 가로 오버플로 0.

## Design Specificity Verdict

"이 제품의 관제실"이 아니라 "보드게임 소재를 입힌 범용 SaaS 어드민". 근거는 데이터가 아니라 부재:
- 예약/대기열/노쇼/자동승계 운영 UI가 0줄. 서버는 예약을 조회해 내려보내지만(+page.server.ts:83,156) +page.svelte에 reservation 문자열 0건.
- 죽은 서버 액션 4개: confirmReservation(466), cancelReservationAdmin(475), addTable(643), removeTable(652) — .svelte 참조 0건.
- /admin/qr 링크 앱 전체 0건.
- 물리적 차별점(테이블/좌석) 화면에 없음.
- 브랜드 이탈: PRODUCT의 "이모지+한글 헤딩" 대신 lucide SVG 인라인 도배(users 아이콘 698/854/1228 3중복), 한글 UI에 "Admin Console"(layout:40).
- 제품 캐릭터 생존 지점 3곳: 게임 폭파(1356), 상황봐서(712), 오늘 하루가 마감되었습니다(layout:184).

결정론적 스캔: detect.mjs src/routes/admin → exit 2, 4건. bounce-easing(PerformanceMonitor:620), border-accent-on-rounded(:617 — 오탐, .spinner 로딩 스피너), side-tab(passes:237), layout-transition(stats:340).
디텍터는 거의 깨끗한데 디자인 리뷰는 참혹함 — 스캐너는 시각적 클리셰를 재고, 이 화면이 실패하는 축은 운영자 안전성과 제품 적합성.

브라우저: 오버레이 주입 미실행(사용자 가시 오버레이 없음). Playwright 헤드리스 인증 세션 실측 — 1440x900 콘솔 에러 0/오버플로 0, 390x844 콘솔 에러 0/오버플로 0, 가시 인터랙티브 28개 중 10개가 44x44 미만(등록 324x29, 인원 추가 75x29, 이번주 빼기 78x26, 비활성화 63x26, 삭제 48x29, + 새 게임 시작 324x29 등).

## Overall Impression

코드 품질은 좋음(포커스 트랩, 실제 요청 기반 폼 잠금, 라이브 우선 레이아웃). 문제는 이 화면이 무엇을 위한 화면인지 정해지지 않은 것 — 감시용도 개입용도 아님. 감시용이면 SSE 끊김을 알려야 하는데 안 알리고, 개입용이면 개입 대상(밀려난 예약자, 노쇼 카운트다운, 대기 순번)이 있어야 하는데 없음.
가장 큰 기회: 대기/예약 큐를 .room-summary 바로 아래로. 서버 액션과 데이터는 이미 존재, 화면만 없음.

## What's Working

1. trapFocus 액션(101-148) — data-autofocus 우선 포커스, Tab 순환, Escape, destroy에서 이전 포커스 복원. 확인 모달 자동 포커스(1021)도 옳음.
2. pending()/lockFormButtons(54-94) — 고정 타임아웃이 아닌 실제 요청 종료까지 잠금 + aria-busy + cursor:progress. 폰 더블탭 중복 제출(=페널티 2점) 실제 차단.
3. 종료 임박 신호 — ending-soon(554), 종료시각 정렬(479-481), .room-summary(518-535)의 "몇 명·몇 판·몇 분 후" 한 줄 요약.

## Priority Issues

### [P0] 가장 자주 누르는 버튼 전부가 성공도 실패도 알리지 않음
Why: pending()을 콜백 없이 쓴 폼은 result.update()만 호출(88), form prop 부재로 fail()의 에러가 렌더 안 됨. 대상: applyPenaltyAdmin(606,611,1067,1072), addAttendee(626,647), updateNotice(736), clearNotice(731), 블랙리스트 해제(1085), toggleManager(1096), toggleRecurringActive(780). 서버가 "이미 참여 중인 인원입니다."(server.ts:189)를 돌려줘도 무반응.
Fix: :88 else await result.update() → else { reportResult(result); await result.update(); }. 성공 시 토스트. applyPenaltyAdmin은 {success,points,total} 반환하도록 서버(546-556) 수정.
Command: $impeccable harden

### [P0] 페널티 ±1 — 되돌릴 수 없는 정책 집행이 확인/기록/피드백 없이 인라인
Why: penalty_threshold=3(server.ts:167), +1은 예약 정지까지 1/3. 40~60행 리스트 각 행에 0.8rem(모바일 0.75rem)로 2개, 확인/성공표시/사유/로그 없음. 모바일 44px 미만. 서버 액션에 verifyAdminSession 없음(546-556, toggleBlacklist(558)와 대비).
Fix: (a) verifyAdminSession 추가 (b) +1을 confirmSubmit으로 승격 + 사유(노쇼/지각/기타) 필드 신설 (c) 인라인 ±1은 관리 시트(1061-1078)로만 (d) 결과를 "현재 n점 / 임계 3점"으로 표시.
Command: $impeccable harden

### [P1] 예약/대기열/노쇼/자동승계에 운영 UI 0개
Why: "왜 저 빠졌어요?" 질문에 답할 수단 전무. 서버는 조회(83,156)와 강제 확정/취소(466,475)를 갖췄으나 화면이 없어 죽은 코드. attendees/[id] 탭 5개(76-80)에도 예약/노쇼/페널티 이력 없음.
Fix: .room-summary 아래 "대기/예약 큐" 섹션 신설(게임별 확정/대기 순번, no_show_limit_minutes 카운트다운, 승계 이력), 행 액션을 기존 confirmReservation/cancelReservationAdmin에 연결. attendees/[id]에 예약·페널티 이력 탭 추가(게임 이력/파트너 병합).
Command: $impeccable shape

### [P1] 가장 파괴적인 액션의 모달이 가장 약함 + 폰에서 로그아웃 불가
Why: 마감 확정은 전원 퇴장 + 전 게임 종료(layout:174, server.ts:421-453)인데 이 모달만 use:trapFocus 없음, aria-modal 없음, 초기 포커스 없음, Escape 미작동(핸들러가 tabindex=-1 백드롭에 있음, 163). 죽은 백드롭 Escape 패턴이 어드민 전역 34곳. .sidebar-footer{display:none}(428-430)로 768px 이하 로그아웃 버튼 소멸, 하단 탭 6개(118-155)에도 없음 → 폰에서 로그아웃 불가.
Fix: trapFocus를 $lib로 추출해 layout 3모달(159,196,233), passes(155,199), games(215,307,381 — 현재 role=presentation), attendees/[id](315), stats(97,128,187)에 적용. 하단 탭 5개로 줄이고 로그아웃 노출.
Command: $impeccable audit

### [P2] 다크모드 차단 + 토큰 비용만 지불 + 주요 버튼 6종 대비 미달
Why: 어드민 style 내 하드코딩 색 388곳(대시보드 73, 레이아웃 72, attendees 65, HardwareMonitor 56, games 40 등). layout:36이 data-theme=light class=force-light로 다크모드 차단 후 253-320에서 토큰을 생 hex로 재선언 — 인다이렉션 무효화. 대비: .btn-warning 2.16:1, .btn-skip 동일, .btn-extend 2.78:1, .btn-guest 3.35:1, .btn-delete 3.41:1, .badge.blacklist 3.2:1 (전부 AA 미달, 둘은 파괴적 액션).
Fix: force-light 토큰 재선언 제거 또는 하드코딩→토큰 이관 중 하나 선택. 대비는 #e67700 / #2f7d32 / --text-dark(#495057, .btn-end-session에서 8.18:1 검증됨) / #d32f2f로 교체.
Command: $impeccable audit

## Persona Red Flags

Alex (파워유저): 게임명 콤보박스(831-863) 마우스 전용, Enter 시 옵션 선택이 아니라 폼 제출. 단축키 0. 벌크 액션은 "참석자 전원"(886) 하나. 참여 인원 리스트 검색 없음(582-624)인데 피커에는 있음(909). 블랙리스트 토글에 3탭+2모달. 인원 추가 폼(626)이 스크롤 하단.
Sam (a11y): aria-live 어드민 전체 0건. 참여자 피커 포커스 링 없음(all:unset, 1807/1834/1867), :focus-visible 표시가 #f1f3f5로 1.06:1. 블랙리스트 상태가 opacity+색 단독(2164). div/span 클릭핸들러 무role 34개, label 없는 입력 11개. stats KPI 드릴다운은 a11y 경고 주석 억제(34-36,41-43,60-62,67-69)로 키보드 도달 불가.
지훈 (운영진, 금요일 20시, 폰 한 손, 눈앞 항의): 예약/대기열 화면 없어 1단계 차단. 뒤로가기 시 스크롤/showAllPlaying/관리 시트 초기화(218-276). 모바일 헤더 세로 스택(436-440)으로 .room-summary까지 스크롤 필요. 페널티 -1/+1 결과 무표시. 마감 후 인원 추가 시 is_open이 조용히 true 복귀(server.ts:180).

## Minor Observations

- 같은 목적지 라벨 3종씩(게임 도감 관리/보드게임 도감 관리/게임 관리 등)
- 사람 지칭 8가지(참여 인원/참가자/참여자/인원/저장된 멤버/등록 멤버/회원/유저)
- Svelte 버전 혼재: 대시보드·모니터는 룬, passes/games/attendees/stats/login은 Svelte 4
- stats KPI→모달 매핑 무의미(등록 멤버 카드가 Top 10 방문자를 엶)
- 에러 톤 혼재: 합쇼체(서버 13곳)/해요체(151)/한 단어 '오류'(passes:93)
- addAttendee가 블랙리스트를 서버 검증 안 함(server.ts:171-209) — 이름 직접 입력 시 통과
- 빈 상태 4종이 다음 행동 미제시(570,622,685,804)
- guestCount/dropdownOpen/searchInput이 두 모달 공유 바인딩(221,345)
- 두 게임 상세 모달 참여자 추가 블록 중복(1305-1339/1397-1431). 어드민 전역 중복 셀렉터 39개(.header 10곳, .btn-primary 6파일, .modal-backdrop 6파일)
- 미디어쿼리 0개 파일 5개: stats, attendees/[id], login, settings, qr
- 10px/0.65rem 폰트 4곳(2320,2472,2704, PerformanceMonitor:719)

## Questions to Consider

1. 핵심 가치가 "지금 방에 누가 있는지"인데 그 숫자(.room-summary 1rem)가 섹션 제목(1.5em)보다 작다. 한 줄만 남긴다면?
2. 이 대시보드는 감시용인가 개입용인가? 지금은 둘 다 아니다.
3. 결과가 무거운 순서와 조작이 무거운 순서가 정반대인 게 의도인가?
4. 어드민 다크모드는 안 하기로 한 것인가, 하다 만 것인가?

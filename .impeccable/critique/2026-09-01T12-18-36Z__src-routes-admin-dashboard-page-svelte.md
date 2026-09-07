---
target: 어드민 대시보드 디자인
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-09-01T12-18-36Z
slug: src-routes-admin-dashboard-page-svelte
---
Method: dual-agent (A: 디자인 리뷰 · B: 계측/디텍터)

# 어드민 대시보드 디자인 크리틱

대상: (dashboard)/+page.svelte + +layout.svelte + 서브페이지 8종 · 모드: Operate
조건: 참여 8명 / 진행 3판 / 예정 2건 / 예약 4건 / 공지 1건을 채운 실제 렌더 상태

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | SSE 끊김 무표시(+page.svelte:30-35). 토스트/카운트다운은 작동 |
| 2 | Match System / Real World | 3 | 평균 체류 799분, 모든 게임이 같은 🎲(:803) |
| 3 | User Control and Freedom | 2 | 블랙 등록은 확인, 해제는 무확인(:1370). 매니저 지정 무확인. undo 없음 |
| 4 | Consistency and Standards | 2 | .btn-* 21종, 아이콘 체계 3종, 하드코딩 hex 고유 94종 |
| 5 | Error Prevention | 3 | 확정 불가 사유 인라인(:741-746). 퇴장 4px 아래가 닫기 |
| 6 | Recognition Rather Than Recall | 2 | 관리 버튼 8개 동일 라벨. 참여 인원 행이 소속 게임 미표시 |
| 7 | Flexibility and Efficiency | 1 | 단축키 0, 벌크 0, 필터/검색 0 |
| 8 | Aesthetic and Minimalist | 2 | 유령 카드 1.04:1/1.01:1, 큐 행 정보 중복, 행당 ~1000px 빈 공간 |
| 9 | Error Recovery | 3 | reportResult가 failure+transport error 노출(:133-143) |
| 10 | Help and Documentation | 3 | 설정 마이크로카피 정확, 빈 상태가 다음 행동 제시 |
| Total | | 24/40 | Acceptable |

평가 A는 23점. 합성 단계에서 #4를 1→2로 상향(확인 방식/목적지 라벨/모달 처리가 통일됨).
Trend 17 → 23 → 16 → 24. 오른 항목: 에러 예방 1→3, 에러 복구 2→3, 도움말 1→3 (전부 지난 작업 대상).
안 오른 항목: 유연성 1 그대로, 일관성/인지부하는 시각 시스템 문제라 미착수.

## Design Specificity Verdict

여전히 "한글 라벨을 붙인 범용 어드민 스킨". 지난 작업은 동작과 안전성을 고쳤지 시각 언어를 만들지 않았다.

- 팔레트가 저작물이 아니라 3개 시스템의 적층: Flat UI(#2c3e50/#ecf0f1), Bootstrap(#007bff), Material(#2196f3/#4caf50/#f44336) + Open Color 누수. 빨강 6종/파랑 6종/초록 6종.
- 게임 도감은 실제 커버 아트를 표시하는데, 라이브 대시보드는 전부 같은 🎲(:803, 908). 자산이 있는데 정작 중요한 화면에서 미사용.
- 제품 원칙 충돌: 시인성이 존재 이유인데
  페이지 제목 32/700 > 섹션 라벨 24/700 > 핵심 숫자 "8명 현재" 16/700 > 입장 시각 12.8/400.
  통계 페이지는 누적 방문 수에 36px 스탯 타일을 씀.

디텍터: 1건(PerformanceMonitor:617) — 스피너 오탐. 실질 0건(지난 런 4건 → 감소).

실측 시스템 규모(/admin):
- 타이포 22종 size/weight 조합(0.78/0.8/0.82rem은 0.3px 차)
- 색 배경 17종 + 텍스트 15종
- padding 22종 + gap 8종 (0.25rem 스케일이 존재하나 off-scale 11개가 오염)
- border-radius 5종
- 하드코딩 색 391곳 / 고유 94종 (토큰 블록 주석은 하드코딩 금지라고 적혀 있음)

브라우저 표면 미착수: tabular-nums 0, ::selection 0, caret-color 0, scrollbar 0,
prefers-reduced-motion 0, :focus-visible 2개(둘 다 드롭다운 옵션).
30초마다 카운트다운 재렌더(:44) + tabular-nums 없음 → 메타 컬럼이 가로로 흔들림.

시각 오버레이: 주입하지 않음. 사용자 화면 오버레이 없음.

## Overall Impression

정보 구조는 옳다(큐 우선, 저빈도 접기, 근거가 주석으로 :656에 명시). 카피는 이 파일 최고의 부분.
문제는 그 IA를 렌더하는 시각 시스템이 없다는 것. 토큰 블록이 색만 다루고 타입/여백/라운드는 무관리.
가장 큰 기회: 타입과 색에 스케일을 부여하고 첫 수혜자를 현재 인원 숫자로 만드는 것.

## What's Working

1. 큐 우선 배치와 근거가 코드에 남음(:656). IA가 그것을 렌더하는 시각 시스템보다 낫다.
2. 차단 사유가 결과와 처방까지 말함(:705, :703, :722). 이 일을 해본 사람이 쓴 문장.
3. 실패가 조용히 지나가지 않음. pending()이 실제 요청 종료까지 aria-busy로 잠금(:57-105),
   reportResult가 failure와 transport error를 모두 노출(:133-143).

## Priority Issues

### [P0] 제품의 핵심 숫자가 nav 라벨과 같은 크기
Why: 시인성이 존재 이유인데 "8명 현재"가 16px 문장 안. 흘끗 봐서 알아야 할 사실을 문장으로 읽어야 함.
요약 스트립이 1440에서 가로 ~1100px 낭비.
Fix: 통계에 이미 있는 스탯 타일 처리를 재사용해 3개 타일로 승격(현재 인원 40–48px/700 + tabular-nums).
섹션 h2를 24 → 17–18px로 내려 데이터가 라벨보다 크게. 32px은 데이터 전용.
Evidence: +page.svelte:637-654, 1799-1816
Command: $impeccable typeset

### [P0] 포커스 시스템 부재 + 기본 버튼 대비 미달
Why: :focus-visible 2개(둘 다 드롭다운). 나머지는 UA 링 의존 → #2c3e50 사이드바에서 1.84:1,
활성 항목 #34495e에서 1.55:1. B는 "링 존재 0/25 누락"으로 보고했으나 이는 존재만 측정한 것으로,
A가 잰 대비와 합치면 "링은 있으나 어두운 배경에서 안 보임"이 결론.
.btn-primary 흰 글자/#007bff = 3.98:1로 AA 미달 — 가장 많이 눌리는 버튼(새 게임 시작/게임 일정 등록/
인원 추가/확정/승인). 지난 패스에서 6종을 고치며 정작 기본 파랑을 빠뜨림.
Fix: 전역 :focus-visible 한 벌 + .sidebar 밝은 변형. 기본 파랑을 #0b5ed7(파일에 hover 값으로 5회 존재,
5.1:1)로 교체. 모바일 하단 탭 비활성 #888(3.54:1)도 함께.
Command: $impeccable audit

### [P1] 지난 패스에서 만든 회귀 2건 (자책)
(a) .badge.blacklist와 .badge.penalty.blocked가 픽셀 동일해짐.
    대비 수정 때 blacklist를 솔리드→아웃라인으로 바꿨는데 blocked가 이미 그 공식이었음.
    실측 둘 다 rgb(255,245,245)|rgb(211,47,47)|rgb(211,47,47). 영구 차단과 누적 점수가 같아 보임.
    .queue-flag.overdue까지 같은 공식이라 셋.
(b) 이름 링크 말줄임 깨짐. 탭 타깃을 위해 .attendee-link에 min-height:24px + inline-flex를 걸어
    기존 display:block + text-overflow:ellipsis를 덮음. 실측 display:flex → 긴 닉네임이 넘침.
Fix: (a) 블랙리스트는 솔리드 빨강+흰 글자, 페널티는 앰버 아웃라인 유지. 두 상태가 같은 공식 공유 금지.
     (b) min-height 대신 padding-block으로 24px 확보하고 display:block 복원.
Command: $impeccable polish

### [P1] 버튼이 결과의 무게와 반대로 생김
블랙 등록(영구 차단) = #424242 회색 26px, min-height 없음
페널티 부여(3점 중 1점) = 빨강 44px
퇴장(오늘 퇴장) = 빨강 풀폭 바
닫기(무동작) = 회색 풀폭 바, 퇴장 4px 아래
한 파일에 .btn-* 21종, 같은 모달 안에 터치 타깃 정책 3가지.
Fix: 역할 4개(primary/secondary/destructive/quiet), 높이 44px 통일, 결과 순 재배치.
블랙 등록 → destructive, 퇴장 → secondary, 닫기 → 텍스트 버튼 분리 또는 헤더 ✕.
Evidence: :1370-1373, :1410-1413, :2643-2672, :2568-2576
Command: $impeccable layout

### [P2] 눈에 보이는 마감 결함
- 사이드바가 문서 바닥에서 96px 못 미침(실측 .admin-layout 2078 vs 문서 2174)
- 유령 카드 2종: section #f9f9f9 vs 페이지 #f5f5f5 = 1.04:1, details.section #f4f4f5 = 1.01:1
- 모든 카드가 테두리+그림자 동시 선언(/admin 4곳, /monitor 14곳).
  .section-primary와 .room-summary가 같은 개념에 서로 다른 두 레시피
- 새 게임 시작 모달의 두 입력이 placeholder를 글자 중간에서 자름
- 설정 페이지만 사이드바 없이 뜨고 배경/라운드/아이콘 체계가 다름(라우트 그룹 밖)
Command: $impeccable polish

## Persona Red Flags

Alex: 단축키 0, 벌크 0(큐 4건 = 확인 모달 4번, 8명 체크인 = 칩 8탭), 필터/검색 0(검색은 모달 안에만).
8개 행이 전부 동일한 "관리" → 1인 조치 최소 4인터랙션. 유일한 파워 어포던스(콤보박스 방향키)가 모달 안.

Sam: 사이드바 활성 포커스 1.55:1, .btn-primary 3.98:1, .queue-status.queue-confirmed 3.88:1.
disabled가 두 언어(opacity .45 vs .5). .chip-container.blacklisted는 opacity:.5 단독으로 차단 전달.
레이아웃 확인 모달이 aria-labelledby로 자기 h3를 가리키지 않음.
정정: A가 이름 링크 42x24를 "24x24 미달"이라 했으나 24px는 WCAG 2.5.8 AA 충족. B 실측도 24 미만 0건.

지훈(운영진, 금 21:40, 폰 한 손): "몇 명?"의 답이 16px 문장. 세 게임이 같은 🎲라 이름 세 개를 읽어야 함.
관리를 열면 첫 시선이 풀폭 빨강 퇴장, 4px 아래가 닫기. 블랙 해제는 확인 없이 한 탭(등록엔 확인 있음).
SSE 끊김 시 화면이 살아있는 것과 구분 불가. 밤 10시에 한 번 쓰는 마감 하기가 다섯 시간 내내 가장 큰 요소.

## Minor Observations

- 폰트 패밀리 3종(sans-serif 103, Arial 35, -apple-system 1), 토큰 선언 없음
- 평균 체류 799분 → 13시간 19분이어야 함
- 모니터 h1 "모니터" 바로 아래 h2 "서버 모니터"가 같은 시각 무게
- 섹션 헤딩 중 절반만 아이콘(대기·승인 큐/진행 중인 게임/현재 참여 인원엔 없음)
- 파랑이 세 역할 동시 수행: 주 CTA / 접기 토글 / 인라인 링크
- 모니터 스파크라인 축 라벨 ~8px
- 진행 중 게임 상세 모달에 style="width:100%" 인라인 5개
- +page.svelte:8은 export let(Svelte 4), +layout.svelte:9는 $props()(Svelte 5)
- 접기 아이콘이 두 번 구현(.toggle-icon 텍스트 글리프 vs summary::after CSS content)
- --color-purple-bg / --color-indigo / --color-slate 선언만 되고 미사용
- 모바일 하단 탭 색이 미디어쿼리 안에서만 정의 → 밖에서는 UA 링크 파랑으로 계산

## Questions to Consider

1. 통계는 누적 방문 수에 36px, 대시보드는 라이브 인원에 16px. 시인성이 핵심인데 왜 허영 지표가 두 배 큰가?
2. layout:262에 "하드코딩하지 말고 토큰을 쓸 것"이라 적혀 있고 고유 hex 94종을 하드코딩한다.
   그 블록은 디자인 시스템인가, 만들어지지 않은 시스템에 대한 설명인가?
3. 블랙 등록 26px 회색 vs 페널티 44px 빨강. 지친 운영진이 어느 쪽에서 망설이길 원하나?
4. 블랙 등록엔 확인이 있고 해제엔 없다. 왜 차단이 되돌릴 수 있는 느낌이고 해제가 즉시인가?
5. 게임 도감은 실제 커버 아트를 불러온다. 라이브 대시보드는 전부 같은 🎲로 대체한다.
   12px 썸네일을 이 페이지에서 가장 중요한 픽셀로 취급하면 이 화면은 어떻게 생겼을까?

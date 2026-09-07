---
target: 어드민 대시보드
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-09-02T06-16-19Z
slug: src-routes-admin-dashboard-page-svelte
---
Method: dual-agent (A: 디자인 리뷰 · B: 계측/디텍터)

# 어드민 대시보드 크리틱 (3차)

대상: (dashboard)/+page.svelte (2997줄) + +page.server.ts + +layout.svelte · 모드: Operate
조건: 참여 8명(블랙1/페널티3점1/2점1) · 진행 3판(1판 3분 후 종료) · 예정 2건 · 예약 4건 · 공지 1건

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | 만료 게임이 "진행 중 (3)"에 영원히 남음. 승자 없이 종료해도 "승자가 기록되었습니다"(:1103 vs server:309) |
| 2 | Match System / Real World | 3 | 참여 인원 행이 is_playing/game_name 을 버림(server:34-35 → :796-820) |
| 3 | User Control and Freedom | 2 | 마감/노쇼/폭파/블랙에 undo 없음. 가역은 페널티뿐(:1220) |
| 4 | Consistency and Standards | 2 | .btn-penalty.add 와 .btn-role.is-destructive 가 같은 --color-red-dark |
| 5 | Error Prevention | 3 | 확인 모달 일관, 차단 사유 인라인. 취소 / 예약 취소 인접 |
| 6 | Recognition Rather Than Recall | 2 | "첫 종료까지 임박"이 어느 게임인지 안 말함(:610-618). 관리 시트가 이름뿐 |
| 7 | Flexibility and Efficiency | 1 | 단축키 0, 벌크 0, 스킵링크 0. 탭 스톱 49 중 16이 8인 명단 |
| 8 | Aesthetic and Minimalist | 2 | .game-form flex-wrap 이라 새 게임 시작 모달 입력이 잘림(:1778-1783) |
| 9 | Error Recovery | 3 | reportResult 가 failure+transport error 노출. 알림 체계가 둘로 갈림 |
| 10 | Help and Documentation | 2 | 마감은 결과를 말하나 "게임 폭파"는 단어를 안다고 전제 |
| Total | | 22/40 | Acceptable 하단 |

평가 A는 23점. 합성 단계에서 #1을 3→2 하향 — 상태 표시가 불완전한 게 아니라 틀린 값을 보여준다.
Trend 17 → 23 → 16 → 24 → 22. 직전 디자인 런과 사실상 제자리.

## 지난 작업이 절반만 닿았다 (핵심)

토큰 체계는 세웠으나 대시보드 파일에는 타입/라운드만 적용됐다.

| 축 | 토큰 | 하드코딩 | 판정 |
|---|---|---|---|
| --text-* | 111회 | 생 font-size 0 | 완료 |
| --radius-* | 45회 | 4개(전부 정당: 50% 스피너, 0 리셋) | 완료 |
| --space-* | 15회 | padding/gap 153선언 | 8% 적합 |
| --weight-* | 6회 | 26선언, 그중 4개가 스케일 밖의 500 | 미적용 |
| 색 | 2회 | hex 44개(14개는 정확히 대응 토큰 존재) | 미적용 |

--space 미적용 중 54곳이 6단 스케일에 없는 값(0.05/0.1/0.15/0.2/0.3/0.35/0.4/0.45/0.6/0.7/0.8/0.85/1.25rem).
직전 커밋의 "여백 6단 스케일"은 토큰 정의를 뜻했고, 선언 치환은 games/ 에서만 했다.
games/ 는 --space 52회 / hex 7개(1571줄), 대시보드는 15회 / 44개(2997줄).

## 자책 — 파란 버튼의 포커스 링이 보이지 않음

--color-blue-bright: #0b5ed7 (layout:312)
--focus-ring:        #0b5ed7 (layout:313)  ← 같은 값

파란 배경 버튼 위 실측 대비: 확정 1.00 / 승인 1.00 / +새 게임 시작 1.00 / 마감 하기 1.17 / 노쇼 처리 1.17.
나머지 20개 요소는 4.9~6.2:1 정상. 가장 많이 누르는 버튼 다섯에서만 포커스가 사라진다.
지난 런에서 기본 파랑을 내리며 링을 같은 값으로 둔 결과.

## Design Specificity Verdict

혼재. 한 블록은 이 제품의 것이고 넷은 범용 가구.

이 제품의 것: 대기·승인 큐(:623-744). 세션별 묶음, 정원 대비 표시, 그리고 노쇼를 일정만으로
판정하지 않고 자동 체크인의 부재 보고를 요구함(:499-506) → "시작 후 10분 경과 · 방에 없음 —
노쇼 판단 필요"(:669). 이 문장을 만드는 SaaS 어드민은 없다.

범용 가구:
- 현재 참여 인원(:791-864)이 이름+시각+관리뿐. 서버가 is_playing/game_name 을 보내는데 행이 버림
- 방 현황 스트립(:598-620): 주석은 "존재 이유가 시인성"이라 하나 시인성은 집에 있는 회원의 가치다.
  운영자는 방 안에 있고, 가장 큰 두 숫자가 고개 들면 보이는 것을 반복한다

디텍터 2건 모두 오탐(스피너 / flat-type-hierarchy 는 스니펫이 실제 파일과 불일치 — B가 지적).

## What's Working

1. 큐의 노쇼 판정 — 일정·하드웨어·UI가 하나로 설계된 유일한 지점. 주석이 원칙을 명시하고 코드가 지킴
2. 모달 접근성이 공학 — modal.ts 가 진입/순환/Escape/복원을 한 곳에서, 컨테이너 포커스로 통과 방지.
   B가 3모달 실측: role·aria-modal·Escape·포커스 복원 전부 통과. 모바일 44px 실제 준수
3. 결과가 사람과 사물의 이름을 부름 — "임건우님을 아그리콜라에 확정했습니다"(:702)

## Priority Issues

### [P0] 끝난 게임이 막다른 길 + 거짓 성공
end_time 이 지나도 세션은 playing 으로 남는다. 만료 세션을 닫는 코드는 autoClose.ts:83 의 일일 마감뿐(확인함).
그래서 "진행 중 (3)"도 스트립도 첫 종료까지도 틀리고 회원용 시인성까지 함께 틀린다.
고치려면 모달 열고 → 게임 종료 → 승자 폼.
동시에 서버가 빈 winnerIds 를 받아 게임을 닫는데(server:309) 클라이언트는 실패가 아니면 무조건
"승자가 기록되었습니다"(:1103). missing 가드는 세션 id 누락에만 걸리고 폼은 항상 id를 보낸다.
Fix: 만료 행의 chevron 을 게임 종료 버튼으로. "승자 없이 종료" 경로. 만료를 5분남음과 같은
--color-error-bg 로 두지 말 것. 성공 문구를 실제 기록 여부로 분기.
Command: $impeccable harden

### [P0] 포커스 링 1.00:1 + 배지 대비 미달
위 자책 항목. 더해 .queue-status.queue-confirmed #2b8a3e/#e8f5e9 = 3.88:1(12px 볼드).
타 페이지: 모니터 실시간 연결됨 2.47, 정기권 만료 2.61, 설정 게시 중 3.88.
Fix: --focus-ring 을 버튼 채움색과 분리, 채도 높은 배경엔 outline-offset + 흰 이중 링.
배지 전경색 한 단계 어둡게.
Command: $impeccable audit

### [P1] 폰에서 가장 큰 탭 타깃이 마감
.header-actions{justify-content:stretch} + .header-actions button{flex:1}(layout:525-529, 확인함).
메인으로는 <a> 라 안 늘어나고 마감 하기만 남은 폭을 다 먹는다. 제목 바로 아래 전폭 빨간 바.
Fix: 마감을 저빈도 영역으로, 최소한 flex:0 0 auto + 아웃라인. 확인 모달은 좋다 — 앞의 어포던스가 문제.
Command: $impeccable layout

### [P1] 가장 많이 쓰는 모달이 자기 입력을 자름
.game-form 이 flex-wrap 인데 자식에 폭이 없음(:1778-1783). 이름 placeholder 중간 잘림,
시간 입력 60px(모바일 50px), 취소/게임 시작이 게스트 수와 한 줄. A가 스크린샷 3장으로 확인.
Fix: flex-direction:column + 자식 width:100%, 2열은 명시적 그리드. 게임 이름 라벨 sr-only/노출 통일.
Command: $impeccable layout

### [P2] 가역과 비가역이 같은 빨강 + 토큰 미적용
.btn-penalty.add 와 .btn-role.is-destructive 가 둘 다 --color-red-dark(확인함). 관리 시트에서 60px 간격.
파일 자신이 destructive = "되돌릴 수 없음"이라 선언(:2468-2470)해 놓고 가역 쪽에 그 색을 입혔다.
Fix: 페널티 부여를 빨간 테두리 secondary 로, 솔리드는 블랙 등록/마감에만.
관리 시트 헤더에 입장 시각과 현재 게임. 여백/색 토큰 치환은 games/ 방식 그대로.
Command: $impeccable polish

## Persona Red Flags

Alex: 단축키 0, 게임 하나 끝내기 모달 2개 4스텝, 큐는 세션별로 묶여 있는데(:471-509) 벌크 확정 없음,
8명이 탭 스톱 16개를 먹고 동작은 관리 하나.

Sam: 6섹션 중 4개가 라벨 없는 <section>(:746,:791,:866,:905, 확인함). 스킵링크 없음.
SSE의 invalidateAll 이 큐/명단을 갈아끼우는데 aria-live 도 포커스 보존도 없음.
비활성 확정 opacity:.45 로 약 1.6:1. 그리고 포커스 링 1.00:1.

운영진(금 21:40, 폰 한 손): "지금 누가 비어 있지?"에 답 못 함 — 자리를 채우려면 모달을 열어야 한다.
알람에 이름이 없고, 게스트 추가와 게임 종료가 같은 어두운 바, 엄지에 가장 가까운 것이 마감.

## Minor Observations

- .section-primary 가 section 과 배경 같고 테두리 색만 #eee→#e0e0e0(확인함). "라이브 우위"가 픽셀에 없음
- 1440에서 2335px — 데이터 20행에 세 화면. 블록마다 56px 크롬
- 저장된 멤버 칩이 8명 방에 22개, 퇴장자 포함(server:43-47 필터 없음)
- --numeric 이 .rs-value 에만, 30초마다 바뀌는 .time-remaining/.queue-meta 에는 없음
- 공지가 대시보드에 없음 — 설정 이동의 결과. 의도한 이동이나 라이브 화면에 읽기 전용 한 줄은 재고 여지
- 서버 액션 21개 중 12개가 자체 세션 검사 없이 hooks.server.ts 일괄 차단에만 의존
- 알림 체계 둘 — 레이아웃 로컬(제목 "알림" 고정) vs 공용 AdminFeedback(kind 인식). 마감이 약한 쪽을 씀

## Questions to Consider

1. 시인성은 집에 있는 회원의 가치다. 운영자는 방 안에 있다. 그 40px 을 눈으로 볼 수 없는 것에 쓰면?
2. 서버가 is_playing/game_name 을 보내는데 행이 버린다. 결정이었나, 쿼리가 자란 뒤 행을 안 본 것인가?
3. "라이브 우위"는 디자인이 믿는 위계인가, 커밋에 붙인 라벨인가?
4. 큐는 블랙리스트 확정을 막고 이유를 쓴다. 그 상태를 만드는 블랙 등록은 왜 가역적 페널티와 같은 빨강인가?
5. endGame 이 빈 승자를 받아 닫고 클라이언트는 기록됐다고 말한다. 두 파일 중 하나는 거짓말이다.

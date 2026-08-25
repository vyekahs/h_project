---
target: 같이 할래요 상세 모달 (src/routes/+page.svelte)
total_score: 17
max_score: 36
na_heuristics: 10
p0_count: 1
p1_count: 2
timestamp: 2026-08-25T06-51-12Z
slug: src-routes-page-svelte
---
# "같이 할래요" 상세 모달 크리틱

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2/4 | 참여/나가기 버튼이 fetch 진행 중에도 disabled/로딩 표시 없음 |
| 2 | Match System / Real World | 3/4 | "예정 게임 등록" 라벨이 "먼저 게시글을 삭제한다"는 사실을 알려주지 않음 |
| 3 | User Control and Freedom | 1/4 | 마감(삭제) 후 되돌릴 방법 없음. 이미 있던 `handleWtpClose()`(확인창 포함) 대신 확인 없는 핸들러 사용 |
| 4 | Consistency and Standards | 1/4 | 같은 파일의 다른 모든 파괴적 액션은 `showConfirm()`을 쓰는데 이것만 안 씀 |
| 5 | Error Prevention | 0/4 | 확인창 없음 + 소유자 체크 없음 + 실패 응답 무시 |
| 6 | Recognition Rather Than Recall | 3/4 | 프리필 로직(게임명/인원수/시작시간 자동 계산)이 훌륭함 |
| 7 | Flexibility and Efficiency | 3/4 | 카드에서 바로 참여/나가기 가능 |
| 8 | Aesthetic and Minimalist Design | 3/4 | 군더더기 없음, 헤더 타이포 구분만 약함 |
| 9 | Error Recovery | 1/4 | 마감 플로우는 실패해도 침묵하고 다음 모달로 진행(허위 성공) |
| 10 | Help and Documentation | n/a | 소규모 소셜 포스트 모달 성격상 해당 없음 |
| **Total** | | **17/36** | **Poor (47%)** |

## Design Specificity Verdict

**LLM 평가**: want-to-play 글을 예정 게임으로 승격시키며 게임명/인원수/시작시간을 자동 프리필하는 로직은 실제 동아리 워크플로를 잘 모델링했다. 문제는 그 이해 수준을 구현이 못 따라간다는 것 — PRODUCT.md의 "성악설" 페널티 예약 시스템으로 진입하는 전환점(글 삭제→정식 예약)이 파일에서 가장 허술한 모달 패턴을 복붙한 것처럼 처리됨. 이미 올바르게 만들어진 `handleWtpClose()`(확인창+에러체크)와 전용 CSS(`.wtp-btn.close`)가 죽은 코드로 남아있는데 실제 버튼은 그걸 안 씀.

**결정론적 스캔**: CLI 정적 스캔 3개 파일 모두 클린(0). 모달 DOM 범위 내 브라우저 오버레이도 0건(전체 페이지 스캔의 pulsing-dot 1건은 모달 밖 요소라 스코프 밖). 이번 문제는 detector가 못 잡는 상호작용 설계 결함.

**시각 증거**: "나가기"(안전)는 회색 아웃라인, "예정 게임 등록"(확인 없이 즉시 삭제)은 진한 파란 배경+흰 글자+굵은 글씨로 더 튀는 1차 버튼처럼 보임. 페이지의 평범한 생성 버튼과 동일 클래스(`.btn-create`) 사용 — 파괴적 액션과 일상 액션이 시각적으로 구분 안 됨을 픽셀 단위로 확인. 데스크톱(1440px)/모바일(390px) 둘 다 레이아웃 자체는 안 깨짐.

## Overall Impression

레이아웃/타이포/반응형은 무난하지만 핵심 문제는 미학이 아니라 안전성 — 확인창 없음 + 소유자 체크 없음 + 실패해도 티 안 남, 이 세 가지가 겹쳐 사용자 글이 영구 삭제될 수 있음. 코드베이스에 이미 정답(죽은 `handleWtpClose()`)이 있다는 게 더 아쉬움.

## What's Working

1. want-to-play → 예정 게임 프리필 로직 — 실제 워크플로 정확히 반영.
2. Escape/배경클릭 닫기 — 다른 모달과 일관됨.
3. 카드 레벨 빠른 참여/나가기 — 모달 없이도 처리 가능.

## Priority Issues

**[P0] 확인 없는 파괴적 삭제 + 소유자 체크 누락 + 에러 침묵**
- 왜 문제인가: "예정 게임 등록" 클릭 시 확인창 없이 즉시 DELETE 실행. 작성자 체크 없이 로그인만 하면 버튼이 보임. 서버가 비작성자를 거부해도 클라이언트가 에러를 삼키고 성공한 것처럼 다음 모달을 엶. 작성자 본인 실수 클릭 시 글이 영구 삭제되고 되돌릴 수 없음.
- Fix: 기존 `handleWtpClose()`(확인창+에러체크) 재사용, 버튼을 `data.user.id === selectedWtpPost.created_by || data.isAdmin`일 때만 노출.
- Suggested command: `$impeccable harden`

**[P1] 파괴적 액션이 일상 액션보다 시각적으로 더 눈에 띔**
- 왜 문제인가: "예정 게임 등록"(파괴적)이 "나가기"(안전)보다 시각적 우선순위가 높음. 평범한 생성 버튼과 동일 클래스라 위험도 구분이 없음.
- Fix: 기존 `.wtp-btn.close`(빨간 테두리) 재사용 + 안전 액션과 시각적 분리.
- Suggested command: `$impeccable clarify`

**[P1] 로그아웃 사용자에게 빈 "대화" 섹션이 버그처럼 보임**
- 왜 문제인가: `<h3>대화</h3>` 헤딩은 로그인 체크 밖, `<GameComments>`는 안에 있어 로그아웃 시 제목만 있고 내용 없는 섹션이 보임.
- Fix: else 분기에 "로그인 후 대화를 볼 수 있어요" 안내 문구.
- Suggested command: `$impeccable clarify`

**[P2] 참여/나가기 버튼에 로딩/비활성 상태 없음**
- 왜 문제인가: fetch 진행 중에도 클릭 가능 — 중복 요청 위험.
- Fix: 로컬 pending 상태로 비활성화 + 스피너/텍스트 변경.
- Suggested command: `$impeccable harden`

**[P2] 참여자 리스트 무제한 렌더링**
- 왜 문제인가: 요약 카드는 5명+더보기로 제한하는데 상세 모달은 전원 렌더링.
- Fix: 동일 캡+더보기 패턴 또는 내부 스크롤 영역.
- Suggested command: `$impeccable layout`

## Persona Red Flags

**Alex (파워 유저/방장)**: "참여"와 "예정 게임 등록"이 같은 줄 같은 파란색이라 빠르게 클릭하다 옆 버튼을 눌러 글이 조용히 영구 삭제될 위험. 본인 글이 아니어도 버튼이 보이고 눌러도 에러가 없어 뭔가 잘못됐는지 전혀 알 수 없음.

**Sam (접근성 의존 사용자)**: `aria-modal`/`aria-labelledby` 없고 포커스 이동도 없음. 파괴적 버튼에 색상 외 텍스트 경고가 없어 비시각 사용자는 시각 사용자의 약한 색상 신호조차 못 받음.

**Casey (모바일/산만)**: 레이아웃은 안 깨지지만 버튼이 44px 터치 기준보다 작고 파괴적 버튼이 바로 옆 — 작은 타겟+색상 구분 없음+실수 한 번의 최악 조합.

## Minor Observations

- 상세 모달은 이미지 없을 때 플레이스홀더가 없음(요약 카드는 🎲 이모지 대체) — 빈 상태 처리가 두 화면에서 다름.
- 메시지 텍스트에 줄 제한이 없어 긴 메시지가 헤더를 과도하게 차지할 수 있음.
- 죽은 코드 `handleWtpClose()` / `.wtp-btn.close`는 한 번은 맞게 구현했다가 대체된 흔적으로 별도로 짚어둘 가치 있음.

## Questions to Consider

- 이 삭제 액션은 페널티 기반 예약 시스템으로 들어가는 가장 중요한 전환점인데, 왜 "나가기" 버튼보다도 절차가 가벼운가?
- "마감 후 예정 게임 전환"은 "참여"와 나란히 있어야 할 액션인가, 작성자 전용 별도 "관리" 영역으로 빼야 하는가?

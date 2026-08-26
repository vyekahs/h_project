---
target: 시작 예정 게임 생성 모달 - 고정팟 선택 (src/routes/+page.svelte)
total_score: 10
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 1
timestamp: 2026-08-25T08-29-38Z
slug: src-routes-page-svelte
---
# "시작 예정 게임 생성" 모달 — 고정팟 선택 크리틱

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 0/4 | 드롭다운 트리거가 고정 텍스트 — 선택 전/후/멤버 전부 삭제 후까지 실측으로 전부 동일 |
| 2 | Match System / Real World | 2/4 | 태그가 실제 내부 상태를 대표하지 못해 무너짐 |
| 3 | User Control and Freedom | 0/4 | 선택 해제 버튼 없음, 유일한 탈출구는 모달 재오픈(입력값 다 날아감) |
| 4 | Consistency and Standards | 1/4 | 같은 모달의 다른 진입 경로(마감 후 예정 게임 등록)는 최대인원 보정하는데 이 경로는 없음 |
| 5 | Error Prevention | 0/4 | 핵심 결함 — 확인 없이 고정팟 전용 세션 생성 가능, 실측 재현 |
| 6 | Recognition Rather Than Recall | 1/4 | 유일한 단서(멤버 태그)를 지우는 행위 자체가 신호를 없앰 |
| 7 | Flexibility and Efficiency | 2/4 | 원클릭 필드 채움은 실제로 유용 |
| 8 | Aesthetic and Minimalist Design | 3/4 | 드롭다운 마이크로 인터랙션은 잘 만들어짐 |
| 9 | Error Recovery | 0/4 | 제출 시점까지 포함해 어디에도 경고 없음 |
| 10 | Help and Documentation | 1/4 | 참여 제한 결과에 대한 인라인 힌트 없음 |
| **Total** | | **10/40** | **Critical** |

## Design Specificity Verdict

드롭다운 컨트롤 자체는 공들여 만들었지만 데이터 모델이 미완성. `scheduledSelectedPartyId`에 쓰기만 하고 화면의 다른 컨트롤(멤버 태그, 최소/최대 인원, 트리거 라벨) 중 어느 것도 다시 읽지 않음. 동일한 정적 라벨 결함이 다른 게임 시작 모달에도 복붙돼 있어 한 번도 재점검 안 된 템플릿임을 시사.

결정론적 스캔은 클린(overused-font/pulsing-dot 기존 수용 항목만). 이번 문제는 상태 관리 로직 결함이라 detector가 원천적으로 못 잡는 종류 — 코드 추적 + 실제 DOM 확인으로만 확인됨.

실측: 글룸헤이븐 선택 직후 `input[name="partyId"] value="1"`, 멤버 태그 2개 전부 삭제 후에도 `partyId`는 그대로 `"1"` — 화면은 선택 전과 픽셀 단위로 구분 불가능한데 FormData는 `{"partyId":"1","gameName":"글룸헤이븐 (Gloomhaven)",...}` (players 없음). 모바일에서는 드롭다운 목록이 "게임 이름" 라벨과 겹쳐 렌더링됨.

## Overall Impression

미학 문제가 아니라 접근 제어 버그. 매니저가 멤버 태그를 지워 "전체 공개"로 만들려 해도 실제로는 여전히 특정 고정팟 전용 게임이 확인 없이 생성됨 — PRODUCT.md의 시인성/공정성 원칙을 정확히 건드리는 지점.

## What's Working

1. 원클릭 필드 채움 아이디어는 "소수 운영진" 현실에 맞는 좋은 감각.
2. 드롭다운 마이크로 인터랙션(쉐브론, 호버, 바깥 클릭 닫힘) 정상 동작.
3. 코드베이스 안에 이미 올바른 참고 패턴(마감 후 예정 게임 등록의 인원 보정)이 존재.

## Priority Issues

**[P0] 멤버 태그를 전부 지워도 partyId가 남아 고정팟 전용 세션이 조용히 생성됨**
- 왜 문제인가: 화면은 선택 안 한 상태처럼 보이지만 숨겨진 `scheduledSelectedPartyId`는 유지돼 `party_id`가 그대로 제출됨. `canJoinGame()`이 이 값으로 참여를 제한해, 열린 게임을 만들려던 게 특정 고정팟 전용 게임이 됨.
- Fix: `scheduledSelectedPlayerIds`가 빈 배열이 되면 `scheduledSelectedPartyId`도 null로. 트리거에 명시적 해제 버튼 추가.
- Suggested command: `$impeccable harden`

**[P0] 드롭다운 트리거가 선택 상태를 절대 반영하지 않음**
- 왜 문제인가: 고정 텍스트라 선택 전/후/태그 삭제 후 3가지 상태 전부 동일 — 위 P0의 근본 원인. 재오픈한 목록에도 현재 선택 표시 없음.
- Fix: 트리거 라벨을 선택된 팟 이름에 바인딩, 목록에 active 상태 표시.
- Suggested command: `$impeccable clarify`

**[P1] 고정팟 선택 해제할 명시적 방법 없음**
- 왜 문제인가: 초기화되는 시점은 모달을 처음 열 때뿐. 목록에 리셋 옵션 없음.
- Fix: 드롭다운 목록 맨 위에 "고정팟 없음 (전체 공개)" 항목 추가.
- Suggested command: `$impeccable clarify`

**[P2] 고정팟 불러와도 최소/최대 인원 안 바뀜**
- 왜 문제인가: `applyPartyToScheduledModal`은 min/maxPlayers를 안 건드림. 4명 넘는 팟을 불러오면 최대 인원보다 많은 멤버가 확인 없이 제출 가능(서버 검증도 없음). 같은 모달의 다른 경로는 이미 이 보정을 함.
- Fix: `maxPlayers = Math.max(maxPlayers, party.members.length)` 적용.
- Suggested command: `$impeccable harden`

**[P3] 고정팟 불러오면 입력해둔 커스텀 게임 이름이 확인 없이 덮어써짐**
- 왜 문제인가: 먼저 입력한 텍스트가 조용히 사라짐.
- Fix: 비어있을 때만 덮어쓰거나 확인 절차 추가.
- Suggested command: `$impeccable clarify`

## Persona Red Flags

**Alex (파워 유저/매니저)**: "이번 주는 멤버를 바꿔서" 같은 자연스러운 워크플로가 정확히 P0를 유발. 멤버를 "바꿔 넣을" 방법이 없어 지우는 방향으로만 가게 됨.

**Sam (접근성 의존 사용자)**: 트리거에 aria-expanded/aria-haspopup 없음, 목록 항목에 role/aria-selected 없음(.selected/.active 클래스 자체가 스타일시트에 없음). 선택 전후가 기능적으로 완전히 침묵.

## Minor Observations

- 모바일에서 드롭다운 목록이 "게임 이름" 라벨과 겹쳐 렌더링됨.
- "고정팟 불러오기" 아래 점선 구분선이 위계를 암시하지만 실제 순서 제약은 없음.
- 동일한 정적 라벨 결함이 "+게임 시작"(즉시 시작) 모달에도 복붙돼 있음 — 고치려면 두 곳 다 손봐야 함.

## Questions to Consider

- 필드를 채우고 잊어버리는 템플릿 용도라면, 왜 필드보다 오래 살아남는 서버 접근 제어 값을 심어두는가?
- 멤버 태그를 전부 지우는 걸 "전체 공개로 전환"으로 해석해야 하는가, 별도의 명시적 토글이 필요한가?

---
target: 보드게임 페이지 (src/routes/games/+page.svelte)
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
timestamp: 2026-08-28T07-08-56Z
slug: src-routes-games-page-svelte
---
Method: dual-agent (A: general-purpose design-review sub-agent · B: general-purpose detector/browser-evidence sub-agent)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | 필터/검색은 즉시 반영되지만, 이 제품의 존재 이유인 "지금 진행 중" 신호가 카탈로그 자체에는 전혀 없음 |
| 2 | Match System / Real World | 2 | 필터는 "가벼움/중간/무거움" 같은 말로 말하는데 카드/모달은 원시 BGG 소수점("3.92 / 5")만 보여줌 |
| 3 | User Control and Freedom | 2 | 모달은 ✕/배경클릭/Esc 모두 지원하지만 검색창엔 지우기 버튼이 없고 필터 초기화 액션도 없음 |
| 4 | Consistency and Standards | 2 | #2와 동일한 불일치 + 카드 vs 모달의 정보 표현 방식(비주얼 문법)이 서로 다름 |
| 5 | Error Prevention | 2 | 회원 화면엔 파괴적 액션이 없어 무난하나, 관리자 BGG 재등록은 미리보기/확인 없이 기존 데이터를 덮어씀(`ON CONFLICT DO UPDATE`) |
| 6 | Recognition Rather Than Recall | 3 | 카드에 필터 가능한 모든 정보가 배지로 노출됨, 검색/필터가 항상 보임 |
| 7 | Flexibility and Efficiency of Use | 1 | 정렬 옵션 없음(이름순 고정), 검색 단축키 없음, 필터 조합 후 상태 저장 없음 |
| 8 | Aesthetic and Minimalist Design | 3 | 깔끔한 카드 그리드, 절제된 색 사용, 설명 line-clamp로 카드 높이 균일 |
| 9 | Error Recovery | 2 | 빈 검색 결과 문구는 있지만 "필터 초기화" 같은 실행 가능한 액션이 없음 |
| 10 | Help and Documentation | 1 | "난이도 3.92"가 무슨 뜻인지 이 페이지 안에서 설명이 전혀 없음(사이트 공통 푸터 링크뿐) |
| **Total** | | **20/40** | **Acceptable (50%) — Poor 경계** |

## Design Specificity Verdict

**LLM assessment (Assessment A)**: 데이터 모델(인원/시간/난이도, BGG complexity, best-player-count, DLC 목록)과 관리자 전용 BGG 임포트 플로우는 확실히 이 제품 고유의 것입니다. 하지만 인터랙션 껍데기 자체 — 검색창 + 드롭다운 필터 + 반응형 카드 그리드 + 클릭-상세모달 + "더보기" 페이지네이션 — 는 어떤 쇼핑몰/레시피 사이트에 그대로 갖다 써도 이상하지 않을 만큼 범용적입니다. 진짜 문제는 여기서 그치지 않는다는 것: PRODUCT.md가 명시하는 이 제품의 유일한 차별점은 "지금 누가 있고 무슨 게임이 진행 중인가"의 실시간 시인성이고, 예약 시스템이 그 시인성을 행동으로 잇는 장치인데, 이 카탈로그 페이지는 그 루프와 완전히 단절된 정적 재고 목록입니다. `/`(메인)에 이미 존재하는 실시간 게임 세션·예약 플로우와 `game_id`를 공유하면서도 전혀 다리를 놓지 않습니다. 이건 일반론적 흠이 아니라, 이 제품이 차별화를 증명해야 할 정확한 지점에서 비어 있는 것입니다.

**Deterministic scan (Assessment B)**: CLI 정적 스캔(`detect.mjs --json`)은 exit 0, findings `[]` — 하지만 이는 정적 regex 엔진이 렌더링된 DOM이 필요한 규칙(제목 위계, 폰트 사용 비율, 그림자/보더 조합)을 애초에 검사할 수 없기 때문입니다. 실제 브라우저 렌더링 후 detect 스크립트 주입으로는 3건이 잡혔습니다: `skipped-heading`(h1 다음 바로 h3, h2 없음), `overused-font`(roboto 폰트가 텍스트의 94%), `gpt-thin-border-wide-shadow`(하단 네비게이션에 1px 보더 + 32px 그림자 블러). 소스 대조 결과 앞의 두 건은 실제 패턴이 맞다고 확인됐고(허위 양성 아님), 세 번째는 실존하는 CSS 조합이지만 의도된 스타일인지는 설계 판단의 영역으로 남겨둠.

**두 평가 간 불일치 노트**: Assessment B는 브라우저 스크린샷에서 하단 네비게이션이 "카드들 사이에 끼어 있는 것처럼" 보인다고 보고했지만, Assessment A가 `src/routes/+layout.svelte`의 실제 CSS(`.app-layout { padding-bottom: calc(96px + ...) }`, 네비게이션은 `position: fixed`)를 직접 확인해, 이는 Playwright의 `fullPage` 스크린샷이 fixed 요소를 스티칭 과정에서 원래 뷰포트 좌표에 한 번만 붙여넣는 알려진 캡처 아티팩트이지 실제 레이아웃 결함이 아님을 검증했습니다. 다만 `gpt-thin-border-wide-shadow` 발견 자체(그 요소의 보더+섀도 CSS 조합)는 별개로 실재하는 사실입니다.

**Visual overlays**: 이번 실행에서는 `[Human]` 탭에 오버레이를 남겨두지 않았습니다(각 서브에이전트가 자체 검증 후 live-server를 정리·종료함). Assessment B가 캡처한 콘솔 로그 원문은 위 "Deterministic scan"에 반영했습니다.

## Overall Impression

잘 지어진, 시각적으로 깨끗한 CRUD형 목록 페이지입니다. 카드 그리드, 상세 모달, 비활성 게임 처리 같은 디테일은 수준급입니다. 하지만 이 제품이 존재하는 이유(실시간 시인성 → 예약 행동)와 완전히 단절된 채 떠 있는 섬 같은 페이지이기도 합니다. 가장 큰 기회는 새 기능을 얹는 게 아니라, 이미 메인 페이지에 있는 실시간 게임 세션 데이터를 이 카탈로그에 연결하는 것입니다.

## What's Working

1. **상세 모달의 정보 구조**: 인원/시간/연령/난이도 2×2 그리드에 "👍 베스트 인원" 콜아웃을 별도 스타일로 강조 — 단순 필드 나열이 아니라 "오늘 밤 뭘 할지 정하는 그룹"에게 가장 중요한 정보를 시각적으로 승격시킵니다.
2. **비활성 게임 처리**: 회색조+투명도 필터에 더해 이미지 위 "비활성화됨" 오버레이 텍스트와 뱃지까지 — 색상 하나에만 의존하지 않는 이중 신호로 접근성 함정을 제대로 피했습니다.
3. **BGG 검색 모달의 비동기 디테일**: 모달 오픈 시 자동 포커스, 검색/추가 중 버튼 라벨 전환("...", "추가 중..."), 성공 후 전체 새로고침 없이 `await update()`로 목록 갱신 — 관리자 소수만 쓰는 기능이지만 손이 많이 간 부분입니다.

## Priority Issues

**[P1] 카탈로그가 제품의 실제 목적과 단절된 막다른 길**
- **Why it matters**: PRODUCT.md는 "지금 누가 있고 무슨 게임이 진행 중인가"의 실시간 시인성을 유일한 차별점으로 명시합니다. 회원이 "이 게임 하고 싶다"고 결심하는 바로 이 페이지에 그 신호도, 예약으로 이어지는 연결고리도 없습니다.
- **Fix**: 카드에 활성 세션 데이터 기반 "🟢 지금 진행 중" 배지 추가, 상세 모달에 "현재 진행 상황 보기" / "이 게임으로 예약하기" CTA로 메인 화면 딥링크 연결.
- **Suggested command**: `$impeccable shape`

**[P2] 난이도 표기가 필터와 카드 사이에서 불일치**
- **Why it matters**: 필터는 "가벼움/중간/무거움"으로 말하지만 카드·모달은 원시 소수점만 보여줘, 사용자가 방금 고른 단어와 결과를 매번 스스로 매칭해야 합니다.
- **Fix**: 카드에도 같은 3단계 라벨을 병기 (예: "가벼움 · 3.92/5").
- **Suggested command**: `$impeccable clarify`

**[P2] 검색/필터에 초기화 수단과 결과 개수 피드백이 없음**
- **Why it matters**: 검색 결과 0건일 때 무엇을 되돌려야 하는지 사용자가 직접 추론해야 하고, 전체 대비 몇 개가 보이는지 알 방법이 없습니다.
- **Fix**: "총 N개 중 M개 표시" 카운터, 검색창 지우기(✕) 버튼, 빈 상태에 클릭 가능한 "필터 초기화" 액션 추가.
- **Suggested command**: `$impeccable clarify`

**[P2] 접근성: 커스텀 드롭다운에 ARIA 시맨틱 부재 + 제목 위계 건너뜀**
- **Why it matters**: `.dropdown-toggle`에 `aria-haspopup`/`aria-expanded` 없음, 옵션 리스트에 `role="listbox"`/`option` 없음, 화살표 키 탐색 불가 — 스크린리더 사용자에게는 그냥 버튼 여러 개로만 들립니다. 여기에 더해 detector가 브라우저 렌더링에서 h1 바로 다음에 h2 없이 h3(게임명)가 오는 제목 위계 스킵을 확인했습니다(소스 대조로 허위 양성 아님을 검증).
- **Fix**: 옵션이 4개뿐인 정적 필터이므로 네이티브 `<select>`로 교체하거나, 커스텀 스타일을 유지해야 한다면 완전한 ARIA combobox 시맨틱 + 화살표 키 핸들링 추가. 카드 제목을 h2로 조정해 위계 채우기.
- **Suggested command**: `$impeccable harden`

**[P3] 카드 키보드 인터랙션이 Enter만 지원, Space 미지원**
- **Why it matters**: `role="button"`인 요소는 Enter/Space 둘 다 동작해야 하는 게 관례인데 Space 키가 빠져 있어 키보드 사용자에게 일관성이 깨집니다.
- **Fix**: keydown 핸들러에 Space 분기 추가(+ `preventDefault()`로 페이지 스크롤 방지).
- **Suggested command**: `$impeccable harden`

## Persona Red Flags

**Sam (접근성 의존 사용자)**: 복잡도 필터는 Tab으로 토글 버튼까지는 도달하지만, 연 다음엔 화살표 키로 옵션 간 이동이 안 되고 스크린리더는 "버튼, 버튼, 버튼, 버튼"만 읽어줄 뿐 이게 서로 배타적인 필터 선택지라는 걸 알려주지 않습니다.

**Jordan (초심자)**: 보드게임 취미가 없는 신입 회원이 "난이도: 3.92 / 5"를 마주쳤을 때 이게 무엇을 측정한 값인지(BGG complexity) 이 페이지 어디에도 설명이 없습니다. 툴팁도, "?" 아이콘도, 링크도 없어 그냥 무시하거나 "배우기 어려움"으로 오해할 가능성이 있습니다.

**Riley (스트레스 테스터)**: 현재 개발 데이터의 "스플렌더" 카드는 이미지도 설명도 없이 일반 🎲 플레이스홀더와 "설명이 없습니다" 문구로 렌더링되는데, 이게 "동아리가 정보를 아직 안 채운 것"인지 "의도된 상태"인지 구분할 시각적 신호가 전혀 없습니다. 관리자 BGG 재등록도 `ON CONFLICT DO UPDATE`로 기존 큐레이션 데이터를 미리보기/확인 없이 덮어씁니다.

## Minor Observations

- `.game-card`는 hover 시 `translateY(-5px)` + 그림자로 좋은 느낌을 주지만, 키보드 포커스 상태는 브라우저 기본 아웃라인에만 의존해 hover와 시각적으로 통일되어 있지 않습니다.
- 카드 설명은 `line-clamp: 3`으로 잘리지만 "더 보기" 같은 잘림 신호가 없어, 모달을 열어보기 전까지 텍스트가 더 있다는 걸 알기 어렵습니다.
- 난이도 배지 색(`--color-blue-bright`)이 그리드 전체에서 유일한 채도 높은 강조색이라, 의도치 않게 "난이도"가 인원수/시간보다 더 중요한 정보처럼 보입니다.
- "← 뒤로가기"는 항상 `/`로 고정 이동 — 다른 경로(북마크 등)로 들어온 사용자는 실제 이전 맥락을 잃습니다.
- (detector) `overused-font`: roboto가 텍스트의 94%를 차지 — 일관된 디자인 시스템의 결과일 수도 있어 반드시 결함은 아니지만, 타이포그래피 위계를 폰트 굵기/크기만으로 만들고 있다는 신호이기도 합니다.

## Questions to Consider

1. 메인 화면이 이미 "지금 진행 중인 게임"을 보여준다면, 같은 세션 데이터를 이 카탈로그 카드에도 연결하지 못할 이유가 있을까요?
2. 필터가 이미 난이도를 "가벼움/중간/무거움" 세 단어로 말하고 있는데, 카드는 왜 사용자가 방금 고른 그 단어 대신 원시 소수점으로 되돌아갈까요?
3. 카드의 주 CTA가 "상세 정보 보기"가 아니라 "예약 대기 걸기"였다면, 어떤 필드가 카드 앞면에서 더 중요해질까요?

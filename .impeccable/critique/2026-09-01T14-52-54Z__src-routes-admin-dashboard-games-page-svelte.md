---
target: 어드민 게임 도감
total_score: 13
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-09-01T14-52-54Z
slug: src-routes-admin-dashboard-games-page-svelte
---
Method: dual-agent (A: 디자인 리뷰 · B: 계측/디텍터)

# 어드민 게임 도감 크리틱

대상: (dashboard)/games/+page.svelte (864줄) + +page.server.ts · 모드: Operate
조건: 20종(활성 18 / 비활성 2 / 커버없음 3 / 초장문 이름 1 / 빈 필드 행 1) 시드 상태

## 정정 — "커버 13개 깨짐"은 평가용 시드 데이터 탓

평가 A가 첫 문단에 놓은 "20개 중 13개 깨진 이미지"는 시드한 가짜 URL 때문이다.
실데이터 4종의 image_url을 직접 호출하면 전부 200. 다만 그 사고가 진짜 결함을 드러냈다:
<img>에 onerror가 없어(:144, :224) "커버 없음"과 "커버 링크 사망"을 구분할 수 없다.
BGG 이미지 URL은 실제로 만료되므로 "지금 깨져 있다"가 아니라 "깨지면 알 수 없다"로 읽어야 한다.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 1 | 토스트/알림/라이브리전 0개. 서버 fail(500,{error}) 5곳인데 form.error를 읽는 코드 없음(:85-102) |
| 2 | Match System / Real World | 2 | 카드의 3.92/5 배지에 라벨 없음(:167). 폼이 "난이도 (Weight 1~5)"로 BGG 용어 노출 |
| 3 | User Control and Freedom | 2 | BGG 모달이 검색 후 Escape로 안 닫힘(포커스가 body로) |
| 4 | Consistency and Standards | 1 | 하드코딩 색 42 vs 색 토큰 2, --space-* 0회, 네이티브 confirm()(:181) |
| 5 | Error Prevention | 1 | ON CONFLICT DO UPDATE가 description까지 덮어씀(server:133), 경고 없음 |
| 6 | Recognition Rather Than Recall | 2 | BGG 결과 200줄·썸네일 없음·연도 전부 () — 서버가 year를 안 내려줌 |
| 7 | Flexibility and Efficiency | 1 | 이름 부분일치 검색만(:61). 정렬/필터/일괄편집 없음 |
| 8 | Aesthetic and Minimalist | 2 | 카드마다 수정+삭제 상시(20장=40버튼), 비활성 라벨 이중 출력(:150-159) |
| 9 | Error Recovery | 0 | 에러 표면 자체가 없음. null분 / 분~분 / - / 5 가 콘텐츠로 렌더 |
| 10 | Help and Documentation | 1 | Weight 설명 없음, 삭제가 비활성화가 될 수 있음을 알리지 않음 |
| Total | | 13/40 | Poor |

평가 A는 12점. 합성 단계에서 #8을 1→2 상향(A의 미니멀 평가가 시드發 깨진 이미지 벽에 눌려 있었음).
첫 런이라 추세 없음. 대시보드 24/40 대비 11점 낮고, 격차의 원인은 아래 시각 시스템 항목.

## Design Specificity Verdict

"사진 필드가 달린 범용 CRUD 그리드". 라벨의 인원/시간/난이도를 재고/가격/등급으로 바꾸면
레이아웃·위계·CSS 어느 줄도 고칠 필요가 없다.

- 어드민에서 유일하게 실제 커버 아트가 있는 화면인데 자산을 데이터가 아니라 장식으로 씀.
  카드 object-fit: cover(:477) vs 상세 모달 object-fit: contain(:629) — 같은 이미지 두 처리
- 카드에서 가장 큰 텍스트 블록이 BGG 기계번역 설명 2줄(:175). 운영진이 그걸로 내리는 결정 없음
- 확장(DLC) — 이 클럽의 물리적 사본에 관한 유일한 필드 — 은 14px 초록 한 줄(:169-174)
- 선반 현실 정보 전무: 등록일/마지막 플레이/진행 중 여부/BGG 역링크 없음
- 도메인을 아는 결정은 셋뿐: 무제한 체크박스(:335), 확장 필드 존재(:350), 상세 4칸 그리드(:233-256)

디텍터: exit 0, 0건. 시각적 클리셰는 없다. 실패 축이 스캐너 밖에 있다.

## 시각 시스템 — 도감만 토큰 밖

| 토큰 | 사용 | 하드코딩 |
|---|---|---|
| --text-* | 18 | 스케일 밖 2(3rem :480, 4rem :631, 둘 다 죽은 규칙) |
| --radius-* | 13 | 0 |
| 색 토큰 | 2 | 42 |
| --space-* | 0 | rem 리터럴 47 |
| --weight-* | 0 | 11 (font-weight:500 포함, 스케일 밖) |
| --numeric | 0 | — |

42개 중 ~30개는 +layout.svelte:264-329에 대응 토큰이 이미 있음. 나머지 12개는 이 페이지 전용 발명색.
--numeric 부재로 3열 그리드에서 인원/시간/난이도 자릿수가 어긋남.

대시보드 패턴과 어긋나는 8곳(전부 도감이 뒤처짐): 네이티브 confirm() / 토스트·알림·라이브리전 전무 /
서버 에러 미표시 / .btn-secondary 회색 단색 / .btn-cancel 같은 이름 다른 값 /
.empty-state 사용하나 이 파일에 스타일 없음 / 이모지 3개가 Lucide 체계에 혼입 / 모달 3개 중 1개만 X.

대비: B는 버튼·링크·배지 범위에서 미달 0건, A는 그 범위 밖에서 4건.
상호보완임. .dlc-info #4caf50 흰배경 2.78:1(검산함), .search-count #888 3.54:1,
비활성 카드 opacity:0.7 합성으로 배지 2.34:1 / 설명 3.50:1.

## Overall Impression

정보는 다 있으나 운영진의 실제 질문에 맞춰져 있지 않다. 선반 앞 질문은 "인원? 시간? 확장?"인데
카드에서 가장 큰 건 커버, 다음이 기계번역, 인원·시간은 14px 회색.
가장 큰 기회: 카드가 아니라 표. 20종에 2,859px, 200종이면 24,000px + 더 보기 17번, 정렬·필터 없음.

## What's Working

1. 상세 모달 4칸 정보 그리드(:233-256) — 데이터가 라벨보다 크다. 선반에서 받는 질문 넷을 산문에서 들어올림
2. trapFocus를 세 모달 모두 채택(:213, :302, :378), 주석까지 승계. 포커스 링 정상 동작
3. 무제한 체크박스(:335-341) — 매직 값을 외우게 하지 않음. 읽는 쪽(:166,:241)과 짝이 맞음.
   768px 이하 44px 탭 타깃(:857)도 사용 장면을 주석으로 명시

## Priority Issues

### [P0] 쓰기 동작이 전부 침묵 — 에러 표면 없음
서버 5개 액션이 fail(500,{error})를 돌려주는데 form.error가 864줄 어디에도 렌더되지 않음(:85-102).
삭제는 기록 유무에 따라 비활성화/진짜삭제로 갈리는데(server:76 vs :80) 무엇이 일어났는지 알 수 없음.
Fix: 대시보드의 showToast/showAlert/reportResult를 공용 모듈로 올려 사용. 삭제는 deactivated/deleted 분기해
이름과 함께 알림. :181 네이티브 confirm()을 확인 모달로 교체하고 게임 이름 삽입.
Command: $impeccable harden

### [P0] 표시되지만 입력할 수 없는 필드 셋
상세 모달이 연령(:250)/최대 시간(:244)/베스트 인원(:264)을 보여주나 폼에 입력이 없고
create INSERT에도 없음(확인함). importBgg만 이 셋을 씀 → 손으로 넣은 게임은 영구히 분~분 / 연령 -.
null분(:166)까지 겹쳐 운영자에겐 자기가 낸 버그로 읽힘.
Fix: min_age/max_playtime/best_players를 폼과 create/update SQL에 추가. 모든 렌더에 빈값 가드.
상세 그리드 빈 표기를 "미입력" 하나로 통일. is_active 토글 추가.
Command: $impeccable harden

### [P1] BGG 가져오기가 실제 결과 수에서 못 쓰고 데이터를 조용히 덮어씀
catan 검색 시 200줄, 카드 슬리브가 실제 게임보다 상위. 썸네일 없음. 연도 전부 () —
서버가 year를 안 내려주는데 :405가 ({game.year})를 렌더(확인함). 검색어가 제출 후 비워짐.
그 시점부터 Escape 무효. ON CONFLICT DO UPDATE가 description 덮어씀(server:133, 확인함).
Fix: 상위 20 + 개수 + 더 보기, 48px 썸네일, 연도 없으면 () 미렌더, bggQuery 유지·포커스 복원,
이미 등록된 bgg_id는 "이미 등록됨" 표시 후 바뀔 필드를 명시한 2차 확인.
Command: $impeccable harden

### [P1] 커버 링크 사망을 알 수 없고 고치는 화면에 미리보기 없음
실데이터는 현재 정상이나 BGG URL은 만료된다. 이 필드는 대시보드 라이브 행과 회원용 사이트가 함께 읽음.
onerror 없음(:144,:224) → "없음"과 "사망"을 구분 못 함. 수정 모달은 URL을 평문으로만 보여줌(:355-358).
Fix: on:error로 placeholder 교체 + "이미지 링크 끊김" 별도 상태. 수정 폼에 96px 라이브 미리보기.
그리드에 "이미지 없음·끊김 (N)" 필터.
Command: $impeccable audit

### [P2] 도감만 토큰 체계 밖
색 토큰 2 vs 하드코딩 42, --space-* 0, --weight-* 0, --numeric 0.
발명색 중 넷이 AA 미달. .empty-state는 쓰이는데 스타일 없어 검색 0건 화면이 맨 텍스트.
Fix: 대응 토큰 30개 치환, rem 47개를 --space-1..6로, bold/500을 --weight-*로,
.meta와 .info-item .value에 --numeric. 비활성 카드 opacity:0.7을 명시적 뮤트 팔레트로.
대시보드 .empty-state 이식, 죽은 font-size 2개(:480,:631) 삭제.
Command: $impeccable polish

## Persona Red Flags

Alex: 카탄을 "catan"으로 못 찾음(:61). 정렬·필터 없음. 카드당 탭 스톱 3개 = 그리드 종주 ~60번.
일괄 편집 없음. 수정 모달에 data-autofocus 없어 매번 Tab 한 번 추가. 저장 후 토스트·행 강조·스크롤 보존 없음.

Sam: Space로 카드가 안 열림(:137 Enter만, 확인함). role="button" 안에 button 둘과 form 중첩(:133-141+:176-192).
AA 미달 4건. 의미를 색으로만 전달 2회(확장=초록, 비활성=grayscale). 검색 후 BGG 모달이 키보드 트랩.
라이브리전 없어 결과 수 변화·더 보기·저장 결과 전부 무음.

지현(운영진, 갓 뜯은 상자와 폰): 폰에서 플레이 시간 입력이 26px로 찌그러짐
(.playtime-input-group flex + .checkbox-label white-space:nowrap, CSS 확인함) → 입력 불가.
390px에서 헤더가 "게임 도 / 감"으로 단어 중간 줄바꿈(.header에 flex-wrap 없음, 확인함).
상자에 적힌 연령·최대 시간은 입력란이 없음. 상자에 없는 "Weight"를 step=0.01 숫자로 요구.
커버 URL 미리보기 없음.

## Minor Observations

- bgg_id를 저장하면서 BGG 역링크 없음
- .detail-image가 이미지 없을 때도 250x250 회색 상자
- 설명 없는 게임에 "설명이 없습니다."가 본문과 같은 무게(:175)
- .desc가 flex:1과 -webkit-line-clamp:2를 동시에 걸어 클램프가 깨짐
- 검색 디바운스 없음, 매칭 하이라이트 없음
- 파일 전체가 Svelte 4 문법(export let 2, on: 25, $: 5). 레이아웃은 이미 룬
- 인라인 style= 2곳 모두 생 hex(#adb5bd)
- 서버 액션 6개 모두 자체 세션 검사 없음 — hooks.server.ts:63-69이 상류에서 일괄 차단 중

## Questions to Consider

1. 실제 질문이 "200종 중 뭐가 틀렸지?"라면 왜 답이 더 보기 17번과 24,000px 사진 벽인가?
   커버를 40px 썸네일로 줄이고 정렬 가능한 표로 바꾸면 무엇을 잃는가?
2. 카드의 가장 큰 텍스트 블록이 BGG 기계번역이다. 그걸로 내리는 결정 하나를 대보라.
   없다면 그 자리에 마지막 플레이 날짜·진행 중 여부·확장 목록 중 무엇이 와야 하는가?
3. 커버 사망을 알 수 없다면 정직한 해법은 onerror 폴백인가, 동아리가 자기 상자를 직접 찍는 것인가?
4. 삭제는 거짓말이다(server:71-80). 왜 하나인 척하는 버튼 하나인가?
   비활성화(항상 가능·가역)와 완전 삭제(기록 없을 때만 제안) 둘로 나누면 안 되는가?
5. BGG 가져오기는 행을 채우는 가장 빠른 길이자 파괴하는 가장 빠른 길이고 같은 클릭이다.
   이것을 필드별 체크박스가 달린 diff로 보여준다면?

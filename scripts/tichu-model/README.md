# 티츄 AI — 사람 기록으로 배우고 확인하는 도구

카드 내기는 사람 기록으로 학습한 모델(`src/lib/games/tichu/ai/humanModel.ts`)이 고른다.
여기 있는 건 그 모델을 다시 만들고, 사람과 얼마나 다르게 두는지 확인하는 절차다.

플레이 기록은 개인 기록이라 **저장소에 넣지 않는다**. 저장소 밖 작업 폴더(아래 `$W`)에 둔다.

## 1. 기록 내려받기

```sh
psql ... -tA -c "select json_agg(json_build_object('id',id,'u',user_id,'t',created_at,'r',round_number,
  'seat',seat,'st',seat_strategy,'ps',partner_strategy,'d',declared,'sco',small_cards_out,'ff',finished_first,
  'fp',finish_position,'ts',team_score,'tg',target_score,'h8',hand_8,'h14',hand_14,'plays',plays)
  order by user_id, created_at, id) from tichu_decision_log where target_score is not null" > $W/tichu_log.json
```

`target_score IS NULL` 행은 옛 수집분이라 뺀다. 유저 14는 좋은 패가 나올 때까지 다시 시작한
기록이라 모든 스크립트가 제외한다.

## 2. 기록 재생

사람이 둔 판을 한 수씩 되짚어, 그 순간의 후보·특징·모델 점수와 지금 AI 캐릭터가 고를 수를 남긴다.

```sh
mkdir -p $W/replay
REPLAY=1 IN=$W/tichu_log.json OUT=$W/replay/all.jsonl \
  npx vitest run src/lib/games/tichu/ai/tools/recordReplay.test.ts
```

### 소원이 걸린 수는 "고른 수"가 아니다

참새 소원이 걸려 있으면 그 숫자를 가진 사람은 억지로 내야 한다. 2026-11-22 이전 기록에는 소원이
남아 있지 않아서, 재생 도구가 네 사람의 손패와 플레이로 역추적한다 — 그 숫자를 낼 수 있었는데
안 낸 사람이 있으면 소원이 아니다. `turn` 줄의 `wish.forced`가 비어 있지 않으면 소원 때문에 낸
것일 수 있는 수이고, 학습·보정·상황표 모두 이런 수를 뺀다(고를 게 있던 판단의 5.6%).

이걸 안 빼고 학습한 모델은 참새 위에 A·K를 냈다(같은 순간 83%). 상대 AI가 높은 카드를 소원해서
사람이 억지로 낸 것을 습관으로 배운 것이다. 그 뒤 기록에는 참새 다음 줄에 `"M:9"`(0 = 소원 없음)가
남고, 재생 도구는 그 값을 그대로 쓴다.

## 3. 상황별 표 — 사람은 어떤 조건이 겹칠 때 그 카드를 내는가

```sh
python3 scripts/tichu-model/situations_bomb.py $W     # 폭탄
python3 scripts/tichu-model/situations_cards.py $W    # 용·봉황·A·개·큰 조합·패스
```

사람 비율과 같은 순간의 AI 비율이 나란히 나온다. 조건은 한 칸에 하나씩 넣는 분류가 아니라
**겹치는 조건(AND)** 으로 봐야 한다 — 예: "내 카드가 먹는 트릭 AND 폭탄이 내 마지막 장들".

## 4. 모델 다시 학습

```sh
python3 scripts/tichu-model/train.py $W --cv                                      # 교차 검증만
python3 scripts/tichu-model/train.py $W src/lib/games/tichu/ai/humanModel.json    # 학습 + 내보내기
```

특징은 `extractCandidates`가 만든 값을 그대로 쓴다(2번의 출력). 특징을 늘리려면
`humanModel.ts`의 `FEATURE_NAMES`·`extractCandidates`에 더한 뒤 2번부터 다시 한다.
`strategy.ts`의 카드 내기 규칙(`decidePlay`)을 바꿔도 다시 학습해야 한다 — 규칙 AI의 선택이 특징이다.

## 5. 캐릭터별 상황 보정

새 모델로 2번을 다시 돌린 뒤:

```sh
python3 scripts/tichu-model/calibrate.py $W    # humanModel.ts 의 SITUATION_BIAS 에 넣을 값이 나온다
```

학습에 안 쓴 판으로 낸 모델의 예상과 그 사람의 실제가 뚜렷이 다른 상황에만 값을 준다.
상황마다 **비율**을 사람과 똑같이 맞추는 방식은 쓰지 말 것 — 비율은 맞아도 엉뚱한 순간에
패스하게 돼서 사람과 같은 수를 고르는 비율이 오르지 않았다.

## 6. 시뮬레이션으로 확인

패 묶음 하나를 자리 배치만 바꿔 여러 번 치므로 패 운이 상쇄된다. 프로세스를 여러 개 띄워
`SEED`만 달리하고 `OUT`을 한 폴더에 모은다.

```sh
# 캐릭터끼리 실력이 같은가 (게임 승률이 48~52% 안에 들어야 한다)
CHAR_BENCH=1 SEED=1 SETS=6 OUT=$W/bench/par/1.json npx vitest run src/lib/games/tichu/ai/tools/characterBench.test.ts
python3 scripts/tichu-model/bench_report.py parity $W/bench/par

# 새 모델이 예전 모델보다 약해지지 않았는가
CHAR_BENCH=1 AB=1 OLD_MODEL=$W/old_model.json SEED=1 SETS=6 OUT=$W/bench/ab/1.json npx vitest run src/lib/games/tichu/ai/tools/characterBench.test.ts
python3 scripts/tichu-model/bench_report.py ab $W/bench/ab

# 끝내기 계산(certain.ts)을 한 팀만 켜고 겨룬다 — 계산이 끼어든 횟수도 같이 나온다
CHAR_BENCH=1 AB=1 LOGIC_AB=1 SEED=1 SETS=6 OUT=$W/bench/logic/1.json npx vitest run src/lib/games/tichu/ai/tools/characterBench.test.ts
python3 scripts/tichu-model/bench_report.py ab $W/bench/logic

# 티츄 저지: 부른 자리의 성공률
STOP_BENCH=1 SEED=1 SETS=3 VARIANTS='[{"name":"beat+3","beatCaller":3}]' OUT=$W/bench/stop/1.json npx vitest run src/lib/games/tichu/ai/tools/tichuStopBench.test.ts
python3 scripts/tichu-model/bench_report.py stop $W/bench/stop
```

묶음 48개(프로세스 8개 × 6묶음)면 점수차 오차가 라운드당 ±3점, 게임 승률 오차가 ±5%p다.
캐릭터 실력을 판정할 때는 시드를 바꿔 96묶음 이상을 모으고 점수차로 본다 — 48묶음 한 번으로
"승률 48~52% 안"이라고 통과시켰던 라미가 다시 재니 56.5%였다. 다른 일을 안 돌릴 때 48묶음에 10분쯤 걸린다.

캐릭터 하나가 앞서면 깎기 전에 기록과 대조한다(`calibrate.py`가 쓰는 `sc`·`tags`로 보정값을 바꿔
그 사람의 순간에서 비율을 다시 계산할 수 있다). 라미는 AI가 사람보다 덜 넘기고 있어서,
기록 쪽으로 옮기는 것만으로 실력이 맞았다.

## 7. 계산으로 답이 정해지는 순간 (`ai/certain.ts`)

모델이 고른 수를 계산으로 검산하는 층이다. 사람 기록과 무관하므로 재학습해도 손댈 필요가 없다.

- **둘만 남았을 때**: 상대 손패 = 안 보이는 카드 전부라서 끝까지 계산한다(카드 점수 최대화).
  둘이 합쳐 20장 이하일 때만, 계산량 한도 안에서. 넘으면 모델에 맡긴다.
- **확실한 마무리**: 손패를 "아무도 못 이기는 조합들 + 나머지 하나"로 나눌 수 있으면 그 순서로 나간다.
  안 보이는 카드로 폭탄이 만들어질 수 있거나, 파트너가 티츄를 불렀고 아직 아무도 안 나갔으면 쓰지 않는다.
- 모델이 고른 수가 계산상 최선과 값이 같으면 그대로 둔다 — 캐릭터 차이는 답이 여럿인 곳에만 남는다.

규칙을 따로 옮겨 적은 계산이라, `certain.test.ts`가 무작위 끝내기 300판을 실제 엔진으로 끝까지 쳐서
계산값과 점수가 같은지 확인한다. 엔진의 트릭·용 선물·개·꼴찌 점수 규칙을 바꾸면 이 테스트가 먼저 깨진다.

측정(2026-11-23, 같은 패 48묶음 12,285라운드, 한 팀만 켬): 켠 팀이 라운드당 +10.5 ±1.6점, 게임 승률 59.7%.
둘만 남은 판단은 라운드당 2.5번, 그중 6.8%에서 모델의 수가 바뀌었다(상대가 한 장 남았는데 낮은 카드를
리드하거나, 이길 수 있는데 패스하던 수들). 확실한 마무리는 라운드당 1.2번, 15.9%에서 바뀌었다.
계산 시간은 판단당 평균 1ms 미만, 최대 35ms — 측정이 느리면 계산이 아니라 기계가 바쁜 것이다.

## 알아 둘 것

- 기록 속 사람은 거의 늘 티츄를 **부르는 쪽**이다. 그래서 모델은 "막는 법"을 못 배웠고,
  그 부분은 규칙으로 보탰다(`tichuDefense.ts`).
- 사람 기록대로 두면 AI끼리는 약해지는 성향이 있다(오딘의 "잘 참기"). 캐릭터를 손볼 때마다
  실력 비교를 다시 돌릴 것.
- AI끼리의 시뮬레이션은 사람과의 차이를 재현하지 못한다(사람은 1등으로 나가는 비율이 55%).
  사람 상대 효과는 배포 후 기록으로 확인한다: 선언 성공률, 팀 점수 — `scripts/tichu-decision-report.sql`.

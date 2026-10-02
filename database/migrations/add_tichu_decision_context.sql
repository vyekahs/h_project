-- 티츄 선언 판단 기록 보강 (2026-09-19).
--
-- 첫 수집분(149행)을 분석해 보니 두 가지가 드러났다.
--  (1) 수집 누락: 모든 게임의 마지막 라운드가 빠졌고, 끝까지 친 게임만 전송됐다.
--      → 선언 성공률이 실제보다 높게 나온다. 클라이언트에서 고쳤다.
--  (2) 사람은 AI가 "가망 없다"(race_prob 0~0.17)고 본 손패로도 49%를 1등으로 나갔다.
--      선언 기준이 아니라 플레이 실력 차이가 결과를 지배한다는 뜻이라, 사람의 선언
--      기록만으로는 AI 문턱을 맞출 수 없다. 같은 라운드의 AI 자리도 함께 남겨서
--      "같은 손패 품질에서 사람과 AI의 결과 차이"를 직접 본다.
--
-- target_score가 NULL인 행은 (1)의 결함이 있는 옛 수집분이다.
-- 분석할 때 target_score IS NOT NULL 로 걸러 쓸 것.

-- 300점 게임에서는 그랜드 한 번이 승부를 가르므로 1000점 게임과 선언 기준이 다르다.
ALTER TABLE tichu_decision_log ADD COLUMN IF NOT EXISTS target_score INTEGER;

-- 0 = 사람, 1·3 = 상대 AI, 2 = 파트너 AI. user_id는 그 게임을 친 사람이다.
-- 옛 행은 전부 사람 기록이라 기본값 0이 맞다.
ALTER TABLE tichu_decision_log ADD COLUMN IF NOT EXISTS seat INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tichu_decision_log ADD COLUMN IF NOT EXISTS seat_strategy VARCHAR(20);

-- 1~4등. finished_first만으로는 "아깝게 2등"과 "꼴찌"가 구분되지 않는다.
ALTER TABLE tichu_decision_log ADD COLUMN IF NOT EXISTS finish_position INTEGER;

-- 스몰을 부른 순간까지 그 라운드에 나온 카드 수 (0 = 아무도 내기 전).
-- 특징값은 플레이 시작 시점 기준이라, 판을 보다가 부른 선언을 따로 가려내야 한다.
ALTER TABLE tichu_decision_log ADD COLUMN IF NOT EXISTS small_cards_out INTEGER;

-- 같은 라운드에 파트너 / 상대 팀이 부른 가장 큰 선언 ('none' | 'small' | 'grand')
ALTER TABLE tichu_decision_log ADD COLUMN IF NOT EXISTS partner_declared VARCHAR(10);
ALTER TABLE tichu_decision_log ADD COLUMN IF NOT EXISTS opp_declared VARCHAR(10);

-- 그 라운드의 플레이 순서. 사람 행(seat = 0)에만 싣는다. [자리, 내용] 의 배열:
--   "sword_14 jade_14" 낸 카드 / "P" 패스 / "W" 트릭 획득 / "D>2" 개 / "G>1" 용 트릭 양도 / "T:small" 선언
-- 시뮬레이션에서 AI가 사람 자리를 대신 치면 무조건 그랜드 성공률이 37%인데 실제 사람은
-- 70%를 넘긴다. 그 차이가 어디서 나는지는 사람이 실제로 친 순서를 봐야 알 수 있다.
ALTER TABLE tichu_decision_log ADD COLUMN IF NOT EXISTS plays JSONB;

CREATE INDEX IF NOT EXISTS idx_tichu_decision_seat ON tichu_decision_log (seat, declared);

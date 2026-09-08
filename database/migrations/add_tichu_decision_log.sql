-- 티츄 선언 판단 기록.
--
-- 목적: AI의 티츄 선언 기준을 실제 플레이어와 같은 조건에서 비교/보정한다.
--
-- 지금 AI 문턱은 온라인 티츄 사이트 플레이어 6명의 누적 기록에 맞춰 잡았는데,
-- 그 사람들은 실력이 제각각인 온라인 상대와 붙었고 우리 AI는 우리 AI를 상대한다.
-- 조건이 달라서 "우리 AI가 사람보다 23%p 약하다"는 비교가 얼마나 정확한지 알 수 없다.
-- 우리 플레이어의 기록은 **AI와 정확히 같은 상대·같은 규칙**이므로 그 결함이 없다.
--
-- 선언한 판만이 아니라 매 라운드를 기록한다. "이 손패에서 안 불렀다"도 선언 기준을
-- 학습하는 데 똑같이 중요하기 때문이다. 선언율이 12%라면 선언한 판만 모을 때보다
-- 8배 빨리 쌓인다.
CREATE TABLE IF NOT EXISTS tichu_decision_log (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,

    -- 판단 시점의 특징값. AI가 쓰는 것과 같은 축이라 바로 비교할 수 있다.
    pure_win_rate REAL,      -- calcExitRate의 보너스 미포함 평균 승률 (AI 선언 기준)
    exit_rate REAL,          -- 보너스 포함 값 (플레이 판단에 쓰는 것)
    min_turns INTEGER,       -- 손패를 비우는 최소 턴 수
    lead_combos INTEGER,     -- 그중 선을 잡을 수 있는 조합 수
    hand_strength REAL,      -- evaluateHandStrength
    race_prob REAL,          -- "내가 먼저 나갈 확률" 추정치

    -- 실제 판단: 'none' | 'small' | 'grand'
    declared VARCHAR(10) NOT NULL,

    -- 결과
    finished_first BOOLEAN NOT NULL,
    team_score INTEGER,

    -- 원본 손패. 나중에 다른 특징을 뽑고 싶을 때를 위해 남긴다.
    -- 카드 id 배열 (예: ["sword_14","jade_13",...])
    hand_8 JSONB,   -- 그랜드 티츄 판단 시점 (8장)
    hand_14 JSONB,  -- 교환 후 (14장)

    partner_strategy VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tichu_decision_user ON tichu_decision_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tichu_decision_declared ON tichu_decision_log (declared);

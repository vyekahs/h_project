-- 정기권 이력과 사유 마스터
--
-- 예전에는 attendees.season_pass_expires_at 타임스탬프 하나뿐이라 누가 언제
-- 무슨 이유로 발급·조정·해지했는지가 남지 않았다. 「기록 삭제」를 누르면
-- 흔적도 함께 사라졌다.

-- 조정(±일) 사유 마스터.
-- 발급 사유는 자동으로 붙으므로 여기 없고, 일수도 여기 없다 — 며칠을 조정할지는
-- 카드의 버튼이 정하고 이 표는 「왜」만 든다.
CREATE TABLE IF NOT EXISTS season_pass_reasons (
    id SERIAL PRIMARY KEY,
    -- UNIQUE 가 없으면 아래 ON CONFLICT 가 걸릴 대상이 없어 매번 새로 들어간다.
    -- 같은 문구의 조정 사유가 둘일 이유도 없다 — 고르는 목록만 헷갈려진다.
    label VARCHAR(60) NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS season_pass_logs (
    id SERIAL PRIMARY KEY,
    attendee_id INTEGER NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    -- 어느 정기권의 이력인가. 발급 행은 자기 id 를 넣어 스스로 정기권의 시작이 되고,
    -- 그 뒤의 조정은 같은 값을 물려받는다. 회원 단위로 묶으면 새로 발급한 정기권
    -- 카드에 지난 정기권의 이력이 따라붙는다.
    pass_id INTEGER REFERENCES season_pass_logs(id) ON DELETE SET NULL,
    action VARCHAR(20) NOT NULL,            -- grant | adjust
    -- 사유를 지워도 이력은 남아야 한다. 그래서 SET NULL 이고, 문구는 아래 스냅샷이 든다.
    reason_id INTEGER REFERENCES season_pass_reasons(id) ON DELETE SET NULL,
    reason_label VARCHAR(60) NOT NULL,      -- 등록 당시 라벨의 스냅샷
    note TEXT,                              -- 자유 메모 + 월·화 보정 설명
    days INTEGER,
    expires_before TIMESTAMPTZ,             -- 조치 직전 만료일
    expires_after TIMESTAMPTZ,              -- 조치 직후 (해지면 NULL)
    actor VARCHAR(50) NOT NULL DEFAULT '관리자',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_season_pass_logs_attendee
    ON season_pass_logs (attendee_id, pass_id, created_at DESC);

-- 처음 쓸 수 있도록 하나만 깔아 둔다. 나머지는 운영 중에 화면에서 등록한다.
INSERT INTO season_pass_reasons (label, sort_order) VALUES
    ('서비스 제공', 1)
ON CONFLICT (label) DO NOTHING;

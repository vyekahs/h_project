-- 개인이 "이 게임을 내가 소장하고 있다"고 스스로 체크하는 기록.
-- 혼놀(동아리)이 그 게임을 보유하고 있는지와는 완전히 별개다 — 관리자 승인 없이
-- 본인이 직접 체크/해제한다.
CREATE TABLE IF NOT EXISTS game_ownership (
    attendee_id INTEGER NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (attendee_id, game_id)
);

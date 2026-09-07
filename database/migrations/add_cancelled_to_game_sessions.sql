-- 예정 게임을 삭제(DELETE)하지 않고 취소 상태로 남겨, 누가 언제 취소했는지 알 수 있게 함
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS cancelled_by INTEGER REFERENCES attendees(id) ON DELETE SET NULL;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- status 체크 제약에 'cancelled'가 없어서 취소 UPDATE가 그대로 막혀 있었다
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_status_check;
ALTER TABLE game_sessions ADD CONSTRAINT game_sessions_status_check
    CHECK (status::text = ANY (ARRAY['playing', 'finished', 'scheduled', 'cancelled']::text[]));

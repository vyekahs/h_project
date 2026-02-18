-- 메인페이지 보이기 옵션 + 반복 스케줄 연결
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS show_on_main BOOLEAN DEFAULT false;
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS recurring_schedule_id INTEGER;

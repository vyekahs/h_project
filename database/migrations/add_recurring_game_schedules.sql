-- 반복 게임 스케줄
CREATE TABLE IF NOT EXISTS recurring_game_schedules (
    id SERIAL PRIMARY KEY,
    game_name VARCHAR(100) NOT NULL,
    game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    scheduled_time TIME NOT NULL,
    min_players INTEGER DEFAULT 2,
    max_players INTEGER DEFAULT 4,
    party_id INTEGER,
    created_by INTEGER,
    show_on_main BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 반복 게임 스킵 (이번주 빼기)
CREATE TABLE IF NOT EXISTS recurring_game_skips (
    id SERIAL PRIMARY KEY,
    recurring_schedule_id INTEGER REFERENCES recurring_game_schedules(id) ON DELETE CASCADE,
    skip_date DATE NOT NULL,
    UNIQUE(recurring_schedule_id, skip_date)
);

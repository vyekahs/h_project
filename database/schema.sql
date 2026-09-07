-- Users table (Only for Admin login initially)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Attendees table (List of people currently in the room, managed by Admin)
CREATE TABLE IF NOT EXISTS attendees (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL, -- Just the name, no user ID linkage
    password VARCHAR(255), -- User password for login
    arrival_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'present' CHECK (status IN ('present', 'left')),
    penalty_points INTEGER DEFAULT 0,
    is_blacklisted BOOLEAN DEFAULT false,
    can_manage_games BOOLEAN DEFAULT FALSE,
    last_penalty_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- 가입일. arrival_time은 체크인마다 갱신되므로 가입일 대용으로 쓸 수 없다
    -- (새내기 칭호의 account_age 조건이 이 값을 기준으로 판정된다)
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Games table (Board game collection)
CREATE TABLE IF NOT EXISTS games (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    min_players INTEGER,
    max_players INTEGER,
    playtime_min INTEGER,
    difficulty VARCHAR(20), -- 'Easy', 'Medium', 'Hard'
    image_url TEXT,
    description TEXT,
    included_dlcs TEXT, -- Comma-separated list of DLCs
    bgg_id INTEGER UNIQUE,
    max_playtime INTEGER,
    min_age INTEGER,
    complexity FLOAT,
    best_players TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tables table (Physical or logical tables in the club)
CREATE TABLE IF NOT EXISTS tables (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default tables
INSERT INTO tables (name) VALUES ('Table 1'), ('Table 2'), ('Table 3'), ('Table 4')
ON CONFLICT DO NOTHING;

-- Game Sessions table (Active games)
CREATE TABLE IF NOT EXISTS game_sessions (
    id SERIAL PRIMARY KEY,
    game_name VARCHAR(100) NOT NULL,
    game_id INTEGER REFERENCES games(id) ON DELETE SET NULL, -- Link to games table
    start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP WITH TIME ZONE, -- Estimated end time
    status VARCHAR(20) DEFAULT 'playing' CHECK (status IN ('playing', 'finished', 'scheduled')),
    scheduled_at TIMESTAMP WITH TIME ZONE,
    min_players INTEGER DEFAULT 2,
    max_players INTEGER DEFAULT 4,
    party_id INTEGER, -- FK added by migrate_all.js after game_parties table exists
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Session Participants table (Who is playing in which game)
CREATE TABLE IF NOT EXISTS session_participants (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE,
    attendee_id INTEGER REFERENCES attendees(id) ON DELETE CASCADE,
    is_winner BOOLEAN DEFAULT false
);

-- Notices table
CREATE TABLE IF NOT EXISTS notices (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL
);

-- Reservations table
CREATE TABLE IF NOT EXISTS reservations (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE,
    game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
    table_id INTEGER REFERENCES tables(id) ON DELETE CASCADE,
    attendee_id INTEGER REFERENCES attendees(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'waitlisted', 'confirmed', 'cancelled', 'pending_approval')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Visits table (History of visits)
CREATE TABLE IF NOT EXISTS visits (
    id SERIAL PRIMARY KEY,
    attendee_id INTEGER REFERENCES attendees(id) ON DELETE CASCADE,
    arrival_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    departure_time TIMESTAMP WITH TIME ZONE
);


-- QR Tokens table (For secure check-in)
CREATE TABLE IF NOT EXISTS qr_tokens (
    token VARCHAR(64) PRIMARY KEY,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Feedback table (User suggestions)
CREATE TABLE IF NOT EXISTS feedback (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES attendees(id) ON DELETE SET NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);

-- Minigame Game Comments (게임별 한줄 댓글)
CREATE TABLE IF NOT EXISTS minigame_game_comments (
    id BIGSERIAL PRIMARY KEY,
    game_id VARCHAR(50) NOT NULL,
    user_id INTEGER REFERENCES attendees(id) ON DELETE CASCADE,
    content VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_game_comments_game_created ON minigame_game_comments(game_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_comments_user ON minigame_game_comments(user_id);

-- Notifications (알림 시스템)
CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL,
    message TEXT NOT NULL,
    from_user_id INTEGER REFERENCES attendees(id) ON DELETE SET NULL,
    reference_id VARCHAR(100),
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read, created_at DESC);

-- Notification Preferences (알림 설정)
CREATE TABLE IF NOT EXISTS notification_preferences (
    id SERIAL PRIMARY KEY,
    attendee_id INTEGER NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    notification_type VARCHAR(30) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT false,
    UNIQUE(attendee_id, notification_type)
);
CREATE INDEX IF NOT EXISTS idx_notif_prefs_attendee ON notification_preferences(attendee_id);

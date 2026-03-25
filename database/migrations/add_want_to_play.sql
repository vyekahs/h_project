-- Want to Play posts
CREATE TABLE IF NOT EXISTS want_to_play_posts (
    id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
    game_name VARCHAR(100) NOT NULL,
    message VARCHAR(200) NOT NULL DEFAULT '같이 하실 분!',
    created_by INTEGER NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    image_url TEXT,
    min_players INTEGER,
    max_players INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_wtp_status_created ON want_to_play_posts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wtp_created_by ON want_to_play_posts (created_by);

-- Want to Play participants
CREATE TABLE IF NOT EXISTS want_to_play_participants (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES want_to_play_posts(id) ON DELETE CASCADE,
    attendee_id INTEGER NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(post_id, attendee_id)
);

CREATE INDEX IF NOT EXISTS idx_wtp_participants_post ON want_to_play_participants (post_id);

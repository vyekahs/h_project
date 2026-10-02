CREATE TABLE IF NOT EXISTS game_rec_exclusions (
    attendee_id INTEGER NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    kind VARCHAR(20) NOT NULL CHECK (kind IN ('category', 'difficulty')),
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (attendee_id, kind, value)
);

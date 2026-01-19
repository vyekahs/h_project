-- Attendee Sessions table
CREATE TABLE IF NOT EXISTS attendee_sessions (
    id SERIAL PRIMARY KEY,
    attendee_id INTEGER REFERENCES attendees(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

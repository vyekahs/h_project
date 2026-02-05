CREATE TABLE IF NOT EXISTS user_devices (
    id SERIAL PRIMARY KEY,
    attendee_id INTEGER REFERENCES attendees(id) ON DELETE CASCADE,
    irk VARCHAR(32) NOT NULL, -- Hex string of 128-bit key
    name VARCHAR(100), -- Friendly name e.g. "Arang's iPhone"
    last_seen_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_irk UNIQUE (irk)
);

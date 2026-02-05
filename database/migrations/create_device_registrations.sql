CREATE TABLE IF NOT EXISTS device_registrations (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(50) NOT NULL, -- The 4-digit or short ID user enters
    pin VARCHAR(10) NOT NULL, -- The 4-digit PIN generated
    target_attendee_id INTEGER REFERENCES attendees(id) ON DELETE CASCADE,
    step VARCHAR(20) DEFAULT 'pending' CHECK (step IN ('pending', 'polling', 'verified', 'completed')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

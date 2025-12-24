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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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

-- Game Sessions table (Active games)
CREATE TABLE IF NOT EXISTS game_sessions (
    id SERIAL PRIMARY KEY,
    game_name VARCHAR(100) NOT NULL,
    game_id INTEGER REFERENCES games(id) ON DELETE SET NULL, -- Link to games table
    start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP WITH TIME ZONE, -- Estimated end time
    status VARCHAR(20) DEFAULT 'playing' CHECK (status IN ('playing', 'finished')),
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

-- System Settings table
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL
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

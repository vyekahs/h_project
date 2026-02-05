
CREATE TABLE IF NOT EXISTS scanners (
    id TEXT PRIMARY KEY, -- e.g. "scanner_main_hall"
    name TEXT, -- User friendly name
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address TEXT,
    metadata JSONB, -- For RSSI stats or config
    status TEXT DEFAULT 'active' -- 'active', 'offline'
);

-- Index for fast lookup/updates
CREATE INDEX IF NOT EXISTS idx_scanners_last_seen ON scanners(last_seen_at);

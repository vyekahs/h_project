-- Migration 014: Add slow_request_logs table for performance monitoring
-- Purpose: Persist slow HTTP requests (≥200ms) for historical analysis

CREATE TABLE IF NOT EXISTS slow_request_logs (
    id SERIAL PRIMARY KEY,
    path VARCHAR(500) NOT NULL,
    method VARCHAR(10) NOT NULL,
    duration INTEGER NOT NULL,  -- in milliseconds
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status_code INTEGER NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Performance indexes for common queries
CREATE INDEX idx_slow_request_logs_timestamp ON slow_request_logs(timestamp DESC);
CREATE INDEX idx_slow_request_logs_path ON slow_request_logs(path);
CREATE INDEX idx_slow_request_logs_duration ON slow_request_logs(duration DESC);

-- Table and column comments
COMMENT ON TABLE slow_request_logs IS 'Persistent log of slow HTTP requests (≥200ms) for performance monitoring';
COMMENT ON COLUMN slow_request_logs.timestamp IS 'When the request occurred';
COMMENT ON COLUMN slow_request_logs.created_at IS 'When the record was inserted to database';
COMMENT ON COLUMN slow_request_logs.duration IS 'Request duration in milliseconds';

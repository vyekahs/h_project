-- Migration 015: Add db_pool_stats table for DB connection pool monitoring
-- Purpose: Track DB connection pool utilization over time for correlation analysis with slow queries

CREATE TABLE IF NOT EXISTS db_pool_stats (
    id SERIAL PRIMARY KEY,
    active_connections INTEGER NOT NULL,
    max_connections INTEGER NOT NULL,
    utilization_percent INTEGER NOT NULL,  -- 0-100
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Performance index for time-series queries
CREATE INDEX IF NOT EXISTS idx_db_pool_stats_timestamp ON db_pool_stats(timestamp DESC);

-- Table and column comments
COMMENT ON TABLE db_pool_stats IS 'Time-series data of DB connection pool utilization for correlation with performance issues';
COMMENT ON COLUMN db_pool_stats.utilization_percent IS 'Connection pool utilization percentage (0-100)';
COMMENT ON COLUMN db_pool_stats.timestamp IS 'When the measurement was taken';

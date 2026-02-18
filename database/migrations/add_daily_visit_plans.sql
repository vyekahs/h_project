-- 오늘 갈예정 기능
CREATE TABLE IF NOT EXISTS daily_visit_plans (
    id SERIAL PRIMARY KEY,
    attendee_id INTEGER REFERENCES attendees(id) ON DELETE CASCADE,
    plan_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(attendee_id, plan_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_visit_plans_date ON daily_visit_plans(plan_date);

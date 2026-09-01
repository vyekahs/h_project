-- 페널티 집행 기록
-- 페널티는 예약 제한으로 이어지는 되돌릴 수 없는 조치이므로,
-- 언제 / 누구에게 / 몇 점 / 무슨 사유로 적용됐는지를 남긴다.
CREATE TABLE IF NOT EXISTS penalty_logs (
    id SERIAL PRIMARY KEY,
    attendee_id INTEGER NOT NULL REFERENCES attendees(id) ON DELETE CASCADE,
    points INTEGER NOT NULL,
    reason VARCHAR(20) NOT NULL,
    total_after INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_penalty_logs_attendee
    ON penalty_logs(attendee_id, created_at DESC);

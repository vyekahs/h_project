-- BLE report 성능 최적화 인덱스

-- visits: 체크인 시 열린 방문 조회 (attendee_id + departure_time IS NULL)
CREATE INDEX IF NOT EXISTS idx_visits_attendee_open ON visits(attendee_id) WHERE departure_time IS NULL;

-- game_sessions: 체크아웃 시 playing 세션 조회
CREATE INDEX IF NOT EXISTS idx_game_sessions_status ON game_sessions(status) WHERE status = 'playing';

-- session_participants: 체크아웃 JOIN 최적화
CREATE INDEX IF NOT EXISTS idx_session_participants_session_attendee ON session_participants(session_id, attendee_id);

-- user_devices: attendee 기준 조회 최적화
CREATE INDEX IF NOT EXISTS idx_user_devices_attendee ON user_devices(attendee_id);

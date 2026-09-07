-- 자동 체크아웃 이력
--
-- 기존에는 체크아웃 이력이 메모리 배열(autoLogs)에만 있었다. 100건에서 잘리고,
-- 날짜 없이 시:분:초만 남고, 재시작하면 사라졌다. 그래서 "이틀 전에 왜 체크아웃이
-- 급증했는지"를 사후에 확인할 방법이 없었다.
--
-- 판정의 핵심 근거인 "마지막 감지 후 얼마나 지났는가"를 함께 남긴다. 이 값이
-- 있으면 "임계값을 아슬아슬하게 넘겼다"(스캔이 드문드문)와 "몇 시간째 못 잡았다"
-- (스캐너/매칭 고장)를 구분할 수 있다. 원인이 전혀 다른 두 상황이다.
--
-- 그 시점의 임계값도 함께 저장한다. 나중에 CHECKOUT_TIMEOUT_MS를 조정해도
-- 과거 기록을 그대로 해석할 수 있게 하기 위해서다.

CREATE TABLE IF NOT EXISTS auto_checkout_logs (
    id              SERIAL PRIMARY KEY,
    attendee_id     INTEGER REFERENCES attendees(id) ON DELETE CASCADE,
    checked_out_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- BLE/WiFi 중 더 최신인 마지막 감지 시각과 그 출처
    last_seen_at    TIMESTAMP WITH TIME ZONE,
    last_source     VARCHAR(10),
    -- 각 경로별 마지막 감지 시각 (한쪽만 죽은 경우를 구분하기 위해 따로 남긴다)
    ble_seen_at     TIMESTAMP WITH TIME ZONE,
    wifi_seen_at    TIMESTAMP WITH TIME ZONE,
    -- 판정 근거: 마지막 감지 후 경과 시간과 그때 적용된 임계값
    idle_seconds    INTEGER,
    timeout_seconds INTEGER
);

CREATE INDEX IF NOT EXISTS idx_auto_checkout_logs_time
    ON auto_checkout_logs (checked_out_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_checkout_logs_attendee
    ON auto_checkout_logs (attendee_id, checked_out_at DESC);

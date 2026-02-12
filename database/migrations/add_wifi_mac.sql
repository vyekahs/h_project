-- Add wifi_mac column to user_devices for dual BLE+WiFi check-in
ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS wifi_mac VARCHAR(17);

-- Index for fast WiFi MAC lookup (only non-null values)
CREATE INDEX IF NOT EXISTS idx_user_devices_wifi_mac ON user_devices(wifi_mac) WHERE wifi_mac IS NOT NULL;

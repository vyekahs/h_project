-- 가입일(created_at) 추가
--
-- 새내기(account_age) 칭호는 "가입 후 30일 이내" 조건인데, attendees에 가입일을
-- 담는 컬럼이 아예 없었다. arrival_time은 체크인할 때마다 NOW()로 갱신되는
-- "마지막 도착 시각"이라 가입일 대용으로 쓸 수 없다.
--
-- 순서가 중요하다: DEFAULT를 붙여서 컬럼을 추가하면 기존 행이 전부 "마이그레이션
-- 실행 시각"으로 채워져 기존 회원 전원이 새내기가 되어버린다. 그래서
--   ① DEFAULT 없이 추가 → 기존 행은 NULL
--   ② NULL만 서비스 시작일로 백필
--   ③ 그 뒤에 DEFAULT를 걸어 신규 가입자만 실제 가입 시각을 갖게 한다
-- 이 순서면 재실행해도 안전하다(②가 NULL만 건드리므로 신규 가입자를 덮지 않음).
--
-- 기존 회원의 정확한 가입일은 복원할 방법이 없어 서비스 시작일(2026-02-12,
-- visits/game_sessions/attendees의 최초 기록일)로 일괄 설정한다. 기존 회원을
-- 전원 "새내기 아님"으로 확정하는 쪽이, 오래된 회원이 최근 체크인했다는 이유로
-- 새내기로 잘못 부활하는 것보다 안전하다.

ALTER TABLE attendees ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE;

UPDATE attendees
SET created_at = TIMESTAMP WITH TIME ZONE '2026-02-12 00:00:00+09'
WHERE created_at IS NULL;

ALTER TABLE attendees ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE attendees ALTER COLUMN created_at SET NOT NULL;

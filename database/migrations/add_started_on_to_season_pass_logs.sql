-- 정기권 발급 행에 시작일 추가
--
-- 발급 행(action='grant')은 사실상 「발급된 정기권 한 건」이다. 그런데 기록된 것이
-- 만료일(expires_after)과 일수(days)뿐이라 시작일이 없었다. 월·화 보정으로 일수가
-- 30에서 31, 32로 늘어나므로 「만료일 − days」로 되짚어도 원래 시작일이 안 나온다.
--
-- 조정 행(action='adjust')에는 해당 없음 — 조정은 기간을 여는 일이 아니다.
ALTER TABLE season_pass_logs ADD COLUMN IF NOT EXISTS started_on DATE;

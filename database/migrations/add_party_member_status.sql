-- 고정팟 멤버 초대 상태 컬럼 추가
-- status: 'pending' (초대 대기), 'accepted' (수락), 'declined' (거절)
ALTER TABLE game_party_members ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';

-- 기존 멤버는 모두 수락 상태로 backfill
UPDATE game_party_members SET status = 'accepted' WHERE status = 'pending';

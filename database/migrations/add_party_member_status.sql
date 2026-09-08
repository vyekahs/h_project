-- 고정팟 멤버 초대 상태 컬럼 추가
-- status: 'pending' (초대 대기), 'accepted' (수락), 'declined' (거절)
--
-- 컬럼 추가와 backfill을 "컬럼이 없을 때만" 함께 실행한다.
--
-- 왜 이렇게까지 하는가: 예전 형태는
--     ALTER TABLE ... ADD COLUMN IF NOT EXISTS status ... DEFAULT 'pending';
--     UPDATE game_party_members SET status = 'accepted' WHERE status = 'pending';
-- 였는데, 이 UPDATE는 재실행하면 **아직 수락하지 않은 초대를 전원 자동 수락**시킨다.
-- 이 파일 하나 때문에 마이그레이션 러너가 "기존 DB를 감지해서 재실행을 건너뛰는"
-- 별도 장치를 유지해야 했고, 그 장치가 오히려 새 마이그레이션을 적용 없이
-- '완료'로 기록해 영구 누락시키는 위험을 만들었다.
--
-- backfill의 원래 의도는 "컬럼이 생기기 전부터 팟에 속해 있던 사람은 수락으로 본다"이므로,
-- 컬럼을 새로 만드는 그 순간에만 도는 것이 정확하다. 그러면 재실행이 완전히 무해해진다.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'game_party_members'
          AND column_name = 'status'
    ) THEN
        ALTER TABLE game_party_members
            ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending';

        -- 컬럼이 없던 시점의 기존 멤버 = 이미 팟에 속해 있던 사람들 → 수락 처리
        UPDATE game_party_members SET status = 'accepted';
    END IF;
END $$;

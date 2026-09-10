-- 조정 사유 문구에 UNIQUE
--
-- add_season_pass_logs.sql 의 시드가 `ON CONFLICT DO NOTHING` 이었는데 label 에
-- UNIQUE 가 없어 충돌 대상이 없었다. 그래서 마이그레이션을 다시 돌리면 같은
-- 사유가 한 건씩 늘었다(실제로 '서비스 제공'이 두 개가 됐다).
--
-- 원본 파일에는 UNIQUE 를 넣었지만, 그건 새 DB 에만 적용된다. 이미 테이블이
-- 만들어진 DB 를 위해 여기서 중복을 합치고 제약을 건다.

-- ① 중복 문구를 가장 작은 id 로 합친다. 이력이 가리키던 사유도 같이 옮긴다
--    (이력의 문구는 reason_label 스냅샷으로 따로 들고 있어 영향 없음).
UPDATE season_pass_logs l
SET reason_id = k.keep_id
FROM season_pass_reasons r
JOIN (SELECT label, MIN(id) AS keep_id FROM season_pass_reasons GROUP BY label) k
  ON k.label = r.label AND r.id <> k.keep_id
WHERE l.reason_id = r.id;

-- ② 남길 것만 남긴다
DELETE FROM season_pass_reasons r
USING (SELECT label, MIN(id) AS keep_id FROM season_pass_reasons GROUP BY label) k
WHERE r.label = k.label AND r.id <> k.keep_id;

-- ③ 제약 추가. ADD CONSTRAINT 에는 IF NOT EXISTS 가 없어 카탈로그를 직접 본다.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'season_pass_reasons'::regclass AND contype = 'u'
          AND pg_get_constraintdef(oid) LIKE 'UNIQUE (label)%'
    ) THEN
        ALTER TABLE season_pass_reasons ADD CONSTRAINT season_pass_reasons_label_key UNIQUE (label);
    END IF;
END $$;

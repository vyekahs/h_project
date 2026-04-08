-- WTP Tags
CREATE TABLE IF NOT EXISTS wtp_tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(30) NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0
);

-- 기본 태그 삽입
INSERT INTO wtp_tags (name, sort_order) VALUES
    ('초보자도 가능', 1),
    ('룰 설명 가능', 2),
    ('평일 중', 3),
    ('주말에 가능', 4),
    ('2인 전용', 5)
ON CONFLICT (name) DO NOTHING;

-- WTP Post-Tag 관계 테이블
CREATE TABLE IF NOT EXISTS wtp_post_tags (
    post_id INTEGER NOT NULL REFERENCES want_to_play_posts(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES wtp_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (post_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_wtp_post_tags_post ON wtp_post_tags (post_id);

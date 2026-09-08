#!/bin/sh
echo "Running DB migrations..."
node database/migrate_all.js
echo "Running Game System migrations..."
node scripts/migrate_game_system.js
echo "Running Feedback System migrations..."
node scripts/migrate_feedback.js

echo "Running Tichu migrations..."
node scripts/migrate_tichu.js

# database/migrations/*.sql 적용.
# 위 스크립트들이 기본 스키마를 만든 뒤에 돌아야 한다 (attendees 등을 참조함).
#
# 실패하면 기동을 중단한다: 스키마가 코드와 안 맞는 상태로 트래픽을 받으면
# 조용한 데이터 오류가 되므로, 헬스체크를 통과하지 못하게 하는 편이 낫다.
# (블루/그린 배포에서는 새 슬롯만 죽고 기존 슬롯이 계속 트래픽을 받는다)
echo "Applying SQL migrations..."
if ! node scripts/migrate_sql_files.js; then
    echo "SQL migration failed — aborting startup."
    exit 1
fi

echo "Seeding master titles..."
node scripts/add_master_titles.js

echo "Starting application..."
node server.js

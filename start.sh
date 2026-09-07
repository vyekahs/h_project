#!/bin/sh
echo "Running DB migrations..."
node database/migrate_all.js
echo "Running Game System migrations..."
node scripts/migrate_game_system.js
echo "Running Feedback System migrations..."
node scripts/migrate_feedback.js

echo "Running Tichu migrations..."
node scripts/migrate_tichu.js

echo "Seeding master titles..."
node scripts/add_master_titles.js

echo "Starting application..."
# exec으로 셸을 node로 교체한다.
#
# exec이 없으면 PID 1이 이 셸이고 node는 자식이 된다. 도커가 종료 시 보내는
# SIGTERM은 PID 1에게만 가는데 sh는 이를 자식에게 전달하지 않으므로,
# server.js에 구현된 gracefulShutdown(SIGTERM 핸들러)이 한 번도 실행되지 않는다.
# 결국 도커가 유예 시간을 다 기다린 뒤 SIGKILL로 강제 종료하게 되고,
# 처리 중이던 요청과 SSE 연결이 그대로 잘린다.
exec node server.js

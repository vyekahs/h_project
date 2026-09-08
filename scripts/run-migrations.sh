#!/bin/bash
# DB 마이그레이션 자동 적용.
#
# 배경: 예전에는 docker-compose가 migrations 디렉터리를
# /docker-entrypoint-initdb.d/migrations 로 마운트하는 것에 기대고 있었지만 그건
# 동작하지 않았다 — Postgres 엔트리포인트는 그 디렉터리의 "최상위 파일"만 실행하고
# 하위 디렉터리는 훑지 않으며, initdb 훅 자체가 데이터 디렉터리가 비어 있는 최초
# 1회만 돌아서 운영 중인 DB에는 애초에 적용될 수가 없다.
#
# 이 스크립트는 배포 때마다 실행되며, 아직 적용되지 않은 마이그레이션만 순서대로
# 적용하고 schema_migrations에 기록한다.
# 컨테이너 기동 시에도 scripts/migrate_sql_files.js가 같은 일을 하므로,
# 블루/그린 배포를 거치지 않고 `docker compose up`으로 띄워도 적용된다.
#
# 왜 "전부 재실행"이 아니라 추적이 필요한가:
# 재실행 자체는 안전하지만(모든 파일이 IF NOT EXISTS / DROP ... IF EXISTS 후 재생성 /
# ON CONFLICT DO NOTHING / 컬럼 없을 때만 backfill 형태로 작성되어 있다),
# 25개 파일을 매번 다시 돌리는 것은 낭비고 로그도 지저분해진다.
# 추적 테이블은 "무엇이 새로 추가되었는지"를 알기 위한 것이다.
#
# 예전에는 여기에 "기존 DB를 감지해 재실행을 건너뛰는" 장치가 있었다.
# add_party_member_status.sql의 backfill UPDATE가 재실행 시 미수락 초대를 전원
# 수락시켜 버렸기 때문인데, 그 장치는 목록에 없는 새 파일을 적용 없이 '완료'로
# 기록해 영구 누락시키는 더 나쁜 위험을 만들었다(실제로 add_cancelled_to_game_sessions,
# add_game_ownership, add_tichu_decision_log가 그 위험에 노출돼 있었다).
# 그래서 그 UPDATE를 "컬럼이 없을 때만" 돌게 고치고 장치를 없앴다.

set -euo pipefail
cd "$(dirname "$0")/.."

DB_SERVICE="db"
DB_USER="${POSTGRES_USER:-user}"
DB_NAME="${POSTGRES_DB:-boardgameclub}"
MIGRATION_DIR="database/migrations"

# 컨테이너 기동 시에도 같은 일을 하는 scripts/migrate_sql_files.js가 있다.
# 둘 다 schema_migrations를 쓰고, 적용 기록을 파일과 같은 트랜잭션 안에 남기므로
# 겹쳐 돌아도 두 번 적용되지 않는다(뒤쪽이 PK 충돌로 롤백된다).
# 이 셸 스크립트는 호스트에 node 없이 docker만으로 돌 수 있어야 하는 배포용으로 남긴다.

psql_run() {
    docker compose exec -T "$DB_SERVICE" \
        psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 "$@"
}

echo "[migrate] DB 준비 상태 확인..."
for i in $(seq 1 30); do
    if psql_run -q -c "SELECT 1" >/dev/null 2>&1; then break; fi
    if [ "$i" = "30" ]; then
        echo "[migrate] ❌ DB에 접속할 수 없습니다."
        exit 1
    fi
    sleep 2
done

psql_run -q -c "
    CREATE TABLE IF NOT EXISTS schema_migrations (
        filename    TEXT PRIMARY KEY,
        applied_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    );"

applied_count=0
for path in "$MIGRATION_DIR"/*.sql; do
    name=$(basename "$path")
    already=$(psql_run -tAc "SELECT 1 FROM schema_migrations WHERE filename = '$name';" | tr -d '[:space:]')
    if [ -n "$already" ]; then
        continue
    fi

    echo "[migrate] 적용: $name"
    # -1: 파일 전체를 단일 트랜잭션으로. 중간에 실패하면 통째로 롤백되고
    #     set -e로 스크립트가 중단되어, 배포가 트래픽 전환 전에 멈춘다.
    # 적용 기록(INSERT)을 파일과 같은 트랜잭션 안에서 먼저 남긴다 — 다른 러너와
    # 겹치면 두 번째 쪽이 PK 충돌로 통째로 롤백되므로 정확히 한 번만 적용된다.
    if ! { printf "INSERT INTO schema_migrations (filename) VALUES ('%s');\n" "$name"; cat "$path"; } \
            | docker compose exec -T "$DB_SERVICE" \
              psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -1 -f -; then
        echo "[migrate] ❌ $name 적용 실패 — 롤백되었습니다. 배포를 중단합니다."
        exit 1
    fi
    applied_count=$((applied_count + 1))
done

if [ "$applied_count" = "0" ]; then
    echo "[migrate] 적용할 새 마이그레이션이 없습니다."
else
    echo "[migrate] ✅ 마이그레이션 ${applied_count}건 적용 완료."
fi

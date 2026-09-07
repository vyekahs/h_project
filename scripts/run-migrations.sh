#!/bin/bash
# DB 마이그레이션 자동 적용.
#
# 배경: database/migrations/run-migrations.sh는 한 번도 자동 실행된 적이 없다.
# docker-compose가 migrations 디렉터리를 /docker-entrypoint-initdb.d/migrations 로
# 마운트하는데, Postgres 엔트리포인트는 그 디렉터리의 "최상위 파일"만 실행하고
# 하위 디렉터리는 훑지 않기 때문이다. 게다가 initdb 훅 자체가 데이터 디렉터리가
# 비어 있는 최초 1회만 돌아서, 운영 중인 DB에는 애초에 적용될 수가 없다.
# 그래서 지금까지 마이그레이션을 수동으로 적용해 왔다.
#
# 이 스크립트는 배포 때마다 실행되며, 아직 적용되지 않은 마이그레이션만 순서대로
# 적용하고 schema_migrations에 기록한다.
#
# 왜 "전부 재실행"이 아니라 추적이 필요한가:
# 마이그레이션 중 일부는 재실행이 안전하지 않다. 예를 들어
# add_party_member_status.sql의 UPDATE는 status='pending'을 전부 'accepted'로
# 바꾸므로, 다시 돌리면 아직 수락하지 않은 고정팟 초대가 전원 자동 수락된다.
# 014/015의 CREATE INDEX도 IF NOT EXISTS가 없어 재실행 시 에러가 난다.

set -euo pipefail
cd "$(dirname "$0")/.."

DB_SERVICE="db"
DB_USER="${POSTGRES_USER:-user}"
DB_NAME="${POSTGRES_DB:-boardgameclub}"
MIGRATION_DIR="database/migrations"

# 자동화를 도입하는 이번 배포 시점에 "아직 적용되지 않은" 마이그레이션.
# 기존 DB의 베이스라인을 기록할 때 이 목록만 제외해서, 기존 DB에서도 실제로 적용된다.
# (최초 1회만 참조된다. 이후 추가되는 마이그레이션은 추적 테이블에 없으므로 자연히 적용됨)
NEW_SINCE_AUTOMATION=(
    "add_created_at_to_attendees.sql"
)

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

# 베이스라인: 추적 테이블이 비어 있는데 마이그레이션 산출물이 이미 존재하면,
# 자동화 이전에 수동 적용해 온 기존 DB다. 전부 재실행하면 위험하므로 적용 완료로 기록한다.
# (fresh DB는 schema.sql만 돌아 wtp_tags가 없으므로 이 분기를 타지 않고 전부 적용된다)
tracked=$(psql_run -tAc "SELECT count(*) FROM schema_migrations;" | tr -d '[:space:]')
if [ "$tracked" = "0" ]; then
    legacy=$(psql_run -tAc "SELECT to_regclass('public.wtp_tags') IS NOT NULL;" | tr -d '[:space:]')
    if [ "$legacy" = "t" ]; then
        echo "[migrate] 기존 DB 감지 — 자동화 이전 마이그레이션을 '적용 완료'로 기록합니다."
        for path in "$MIGRATION_DIR"/*.sql; do
            name=$(basename "$path")
            skip="false"
            for pending in "${NEW_SINCE_AUTOMATION[@]}"; do
                if [ "$name" = "$pending" ]; then skip="true"; fi
            done
            if [ "$skip" = "true" ]; then
                echo "[migrate]   (미적용으로 남김) $name"
                continue
            fi
            psql_run -q -c "INSERT INTO schema_migrations (filename) VALUES ('$name') ON CONFLICT DO NOTHING;"
        done
    fi
fi

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
    if ! docker compose exec -T "$DB_SERVICE" \
            psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -1 -f - < "$path"; then
        echo "[migrate] ❌ $name 적용 실패 — 롤백되었습니다. 배포를 중단합니다."
        exit 1
    fi
    psql_run -q -c "INSERT INTO schema_migrations (filename) VALUES ('$name');"
    applied_count=$((applied_count + 1))
done

if [ "$applied_count" = "0" ]; then
    echo "[migrate] 적용할 새 마이그레이션이 없습니다."
else
    echo "[migrate] ✅ 마이그레이션 ${applied_count}건 적용 완료."
fi

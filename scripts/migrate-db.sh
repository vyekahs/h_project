#!/bin/bash
# 이미 초기화된(볼륨이 있는) DB에도 새 마이그레이션 파일을 안전하게, 중복 없이 적용한다.
#
# database/migrations/*.sql은 docker-entrypoint-initdb.d로도 마운트돼 있지만,
# 그건 Postgres 볼륨이 완전히 빈 상태로 최초 기동될 때 딱 한 번만 실행된다.
# 운영 DB는 볼륨이 계속 남아있으므로, 배포마다 새로 추가된 마이그레이션 파일이
# 있어도 지금까지는 아무도 자동으로 적용해주지 않아 수동으로 psql -f를 돌려야 했다.
#
# schema_migrations 테이블에 "적용 완료" 파일명을 기록해두고, 다음 실행부터는
# 새로 추가된 파일만 골라 적용한다. 이 저장소의 마이그레이션 파일은 전부
# IF NOT EXISTS / IF EXISTS / ON CONFLICT 가드를 쓰므로, 최초 실행 때 기존 파일을
# 전부 다시 돌려도 안전하다(이미 적용된 내용은 그냥 조용히 스킵됨).
#
# 사용법: ./scripts/migrate-db.sh        (docker compose 프로젝트 루트에서, db 서비스가 떠있어야 함)
#         DB_SERVICE=db ./scripts/migrate-db.sh   (서비스명이 다르면 오버라이드)

set -euo pipefail
cd "$(dirname "$0")/.."

DB_SERVICE="${DB_SERVICE:-db}"
DB_USER="${POSTGRES_USER:-user}"
DB_NAME="${POSTGRES_DB:-boardgameclub}"
MIGRATIONS_DIR="database/migrations"

run_sql() {
    docker compose exec -T "$DB_SERVICE" psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" "$@"
}

# db 컨테이너를 막 띄운 직후(완전 초기 기동 등)라면 Postgres가 연결을 받을
# 준비가 아직 안 됐을 수 있다 — 최대 30초 기다린다.
echo "[migrate] DB 준비 대기..."
ready=false
for _ in $(seq 1 15); do
    if docker compose exec -T "$DB_SERVICE" pg_isready -U "$DB_USER" -d "$DB_NAME" > /dev/null 2>&1; then
        ready=true
        break
    fi
    sleep 2
done
if [ "$ready" != "true" ]; then
    echo "[migrate] ❌ DB가 준비되지 않았습니다 (30초 초과) — 배포를 중단합니다."
    exit 1
fi

echo "[migrate] schema_migrations 테이블 확인..."
run_sql -c "CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())" > /dev/null

applied_any=false
for migration in $(ls "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
    name=$(basename "$migration")
    already=$(run_sql -tAc "SELECT 1 FROM schema_migrations WHERE filename = '$name'" | tr -d '[:space:]')
    if [ "$already" = "1" ]; then
        continue
    fi

    echo "[migrate] Applying $name..."
    # 파일 내용 + 기록용 INSERT를 한 트랜잭션(-1)으로 묶는다 — 파일 중간에
    # 실패하면 그 파일이 만든 변경도, "적용됨" 기록도 둘 다 남지 않는다.
    if (cat "$migration"; echo "INSERT INTO schema_migrations (filename) VALUES ('$name');") \
        | docker compose exec -T "$DB_SERVICE" psql -v ON_ERROR_STOP=1 -1 -U "$DB_USER" -d "$DB_NAME"; then
        applied_any=true
    else
        echo "[migrate] ❌ $name 적용 실패 — 배포를 중단합니다."
        exit 1
    fi
done

if [ "$applied_any" = false ]; then
    echo "[migrate] 새로 적용할 마이그레이션이 없습니다."
else
    echo "[migrate] ✅ 마이그레이션 적용 완료."
fi

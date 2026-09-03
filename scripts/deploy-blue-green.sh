#!/bin/bash
# 블루/그린 무중단 배포 스크립트.
#
# 매 배포마다: 지금 비활성인 색(blue/green)을 새로 빌드해서 띄우고, 헬스체크를
# 통과하면 Caddy를 그쪽으로 전환(무중단 reload)한 다음 이전 색을 정지한다.
# 헬스체크에 실패하면 아무것도 바꾸지 않고 그대로 중단 — 기존 색이 계속
# 서비스 중이므로 사용자에게는 영향이 없다.
#
# 상태 파일(.deploy_active_color)과 Caddy 스니펫(active_app.caddy)이 없으면
# 스크립트가 알아서 만들고 blue를 기존 활성으로 간주한 뒤 green으로 첫 배포를
# 진행하므로, 별도 수동 준비 없이 그냥 실행하면 된다.
#
# 예전 단일 app 서비스에서 넘어오는 첫 배포에서는 예외적으로 두 가지를 감안할 것:
#  1. docker-compose.yml의 caddy 서비스에 볼륨 마운트가 추가되어 있어서, 이 스크립트를
#     처음 돌리면 caddy 컨테이너가 한 번 재생성된다(수 초간 전체 트래픽 순간 끊김 — 이후
#     배포부터는 caddy를 안 건드리므로 이 순간 끊김은 최초 1회뿐).
#  2. 예전 app 컨테이너는 새 compose 파일에 더는 정의돼 있지 않아 정리 대상이 되지
#     않는다. 첫 배포가 끝난 뒤 여유 있을 때 수동으로 정리: docker compose rm -s -f app

set -euo pipefail
cd "$(dirname "$0")/.."

STATE_FILE=".deploy_active_color"
SNIPPET="active_app.caddy"
SNIPPET_EXAMPLE="active_app.caddy.example"
HEALTH_TIMEOUT=60
HEALTH_INTERVAL=2

if [ ! -f "$STATE_FILE" ]; then
    echo "[deploy] 상태 파일이 없어 blue로 초기화합니다 (최초 배포로 간주)."
    echo "blue" > "$STATE_FILE"
fi
if [ ! -f "$SNIPPET" ]; then
    cp "$SNIPPET_EXAMPLE" "$SNIPPET"
fi

CURRENT=$(cat "$STATE_FILE")
if [ "$CURRENT" = "blue" ]; then TARGET="green"; else TARGET="blue"; fi

echo "[deploy] 현재 활성: app_${CURRENT} → 새로 배포: app_${TARGET}"

# db/caddy는 항상 최신 상태 유지. ble-server는 코드가 바뀌었으면 재빌드
# (사용자 트래픽과 무관한 백그라운드 서비스라 짧은 재시작은 감수한다).
docker compose up -d db caddy

# 새 코드가 아직 없는 컬럼/제약을 가정할 수 있으므로, 새 앱 슬롯을 띄우기 전에
# 마이그레이션부터 적용한다. 실패하면 배포 자체를 중단한다(set -e).
./scripts/migrate-db.sh

docker compose up -d --build ble-server

# 비활성 슬롯을 새로 빌드/기동 — 이 사이 기존 활성 슬롯은 계속 트래픽을 받는다.
docker compose up -d --build "app_${TARGET}"

echo "[deploy] app_${TARGET} 헬스체크 대기 중..."
elapsed=0
healthy=false
while [ "$elapsed" -lt "$HEALTH_TIMEOUT" ]; do
    cid=$(docker compose ps -q "app_${TARGET}")
    status=$(docker inspect --format='{{.State.Health.Status}}' "$cid" 2>/dev/null || echo "unknown")
    if [ "$status" = "healthy" ]; then
        healthy=true
        break
    fi
    sleep "$HEALTH_INTERVAL"
    elapsed=$((elapsed + HEALTH_INTERVAL))
done

if [ "$healthy" != "true" ]; then
    echo "[deploy] ❌ app_${TARGET} 헬스체크 실패 (${HEALTH_TIMEOUT}초 초과) — 배포 중단."
    echo "[deploy] 기존 app_${CURRENT}가 계속 서비스 중이라 사용자 영향은 없습니다."
    docker compose logs --tail=50 "app_${TARGET}" || true
    exit 1
fi

echo "[deploy] ✅ app_${TARGET} 정상. Caddy를 전환합니다..."

cat > "$SNIPPET" <<EOF
reverse_proxy app_${TARGET}:3000 {
    header_up X-Forwarded-Host {host}
    header_up X-Forwarded-Proto {scheme}
    lb_try_duration 20s
    lb_try_interval 250ms
}
EOF

docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile

echo "[deploy] ✅ 트래픽이 app_${TARGET}로 전환됨."

# 전환 직후 아직 남아있을 수 있는 이전 슬롯의 진행 중 요청이 마무리될 시간을 준다.
# (server.js의 graceful shutdown이 SIGTERM 이후 최대 5초까지 기존 연결을 마무리함)
sleep 3
docker compose stop "app_${CURRENT}"

echo "$TARGET" > "$STATE_FILE"
echo "[deploy] 🎉 배포 완료: app_${CURRENT} → app_${TARGET}"

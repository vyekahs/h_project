#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <vector>
#include <set>
#include <NimBLEDevice.h>
#include <NimBLEHIDDevice.h>
#include <esp_bt.h>
#include <esp_task_wdt.h>
#include "esp_wifi.h"
#include <nvs_flash.h>
#include <lwip/etharp.h>
#include <lwip/ip4_addr.h>
#include <lwip/netif.h>
#include <lwip/tcpip.h>
// ESP-IDF NimBLE C API headers for direct access to security store
#include "host/ble_hs.h"
#include "host/ble_store.h"
#include "services/gap/ble_svc_gap.h"
// Local HTTP Server (WiFi MAC 등록 페이지용)
#include <WebServer.h>

// --- CONFIGURATION ---
const char* SERVER_URL = "https://damonpyo.mooo.com";
const char* WIFI_SSID = "KT_GiGA_3F81";
const char* WIFI_PASS = "a4ke01fh66";

// Server Config
const char* SCANNER_API_KEY = "hproject_scanner_secret_2026";


// WiFi Promiscuous Scan Config
const unsigned long WIFI_SCAN_INTERVAL = 60000;  // 60초마다 스캔
unsigned long lastWifiScanTime = 0;

// WiFi Promiscuous Mode - MAC 수집
std::set<String> promiscCollectedMacs;
String ownMacUpper = "";      // ESP32 자신의 MAC (필터용)
String gatewayMacUpper = "";  // 공유기 MAC (필터용)

// Promiscuous 콜백 — WiFi 태스크에서 실행되므로 최대한 가볍게
void IRAM_ATTR wifiPromiscuousCallback(void* buf, wifi_promiscuous_pkt_type_t type) {
    // 관리 프레임과 데이터 프레임만 처리 (컨트롤 프레임은 MAC 정보 없음)
    if (type != WIFI_PKT_MGMT && type != WIFI_PKT_DATA) return;

    const wifi_promiscuous_pkt_t* pkt = (wifi_promiscuous_pkt_t*)buf;
    const uint8_t* frame = pkt->payload;

    // 최소 802.11 헤더 크기 확인
    if (pkt->rx_ctrl.sig_len < 24) return;

    // addr2 (송신자 MAC) = 802.11 헤더 오프셋 10
    const uint8_t* addr2 = frame + 10;

    // 브로드캐스트 필터
    if (addr2[0] == 0xFF && addr2[1] == 0xFF && addr2[2] == 0xFF &&
        addr2[3] == 0xFF && addr2[4] == 0xFF && addr2[5] == 0xFF) return;

    // 멀티캐스트 필터 (첫 바이트 비트 0 = 멀티캐스트/브로드캐스트)
    if (addr2[0] & 0x01) return;

    char macStr[18];
    snprintf(macStr, sizeof(macStr), "%02X:%02X:%02X:%02X:%02X:%02X",
             addr2[0], addr2[1], addr2[2], addr2[3], addr2[4], addr2[5]);
    String mac(macStr);

    // 자기 자신과 공유기 필터
    if (mac == ownMacUpper || mac == gatewayMacUpper) return;

    promiscCollectedMacs.insert(mac);
}

// Static IP Config (네트워크 대역: 172.30.1.x)
IPAddress staticIP(172, 30, 1, 200);
IPAddress gateway(172, 30, 1, 254);
IPAddress subnet(255, 255, 255, 0);
IPAddress dns(168, 126, 63, 1);

// Local HTTP Server (WiFi MAC 등록 페이지 제공)
WebServer localServer(80);

// Custom GATT Service UUIDs for IRK retrieval (Web Bluetooth용)
#define IRK_SERVICE_UUID        "12345678-1234-5678-1234-56789abcdef0"
#define IRK_CHAR_UUID           "12345678-1234-5678-1234-56789abcdef1"

// BLE globals
NimBLEServer* pServer = NULL;
NimBLECharacteristic* pIrkCharacteristic = NULL;
uint16_t currentConnId = 0xFFFF;

// Polling Globals
unsigned long lastPollTime = 0;
const unsigned long POLL_INTERVAL_IDLE = 5000;   // idle 상태: 5초마다 폴링
bool isRegistering = false;
String myMacAddress = "";

// Stability: 힙 메모리 모니터링
const size_t HEAP_MIN_THRESHOLD = 30000;  // 30KB 이하면 재시작
unsigned long lastHeapLogTime = 0;
const unsigned long HEAP_LOG_INTERVAL = 30000;  // 30초마다 힙 로그

struct RegistrationRequest {
    int regId;
    String status;
    String errorMsg;
};

RegistrationRequest* currentRequest = nullptr;
bool uploadNeeded = false;
String pendingIrk = "";
bool pendingDisconnect = false;
unsigned long disconnectTargetTime = 0;
unsigned long authStartTime = 0;
unsigned long connectTime = 0;
unsigned long registerStartTime = 0;
const unsigned long REGISTER_TIMEOUT = 120000;  // 120초 (서버 PIN TTL과 동일)
uint32_t currentPasskey = 0; // 서버에서 받은 PIN

// IRK variable
String capturedIrk = "";
bool irkCaptured = false;

// Web Bluetooth flow state
bool isWebBtFlow = false;
unsigned long webBtAuthTime = 0;
unsigned long webBtFlowStartTime = 0;  // Web BT 플로우 시작 시간 (자동 리셋용)
const unsigned long WEB_BT_TIMEOUT = 60000;  // 60초 후 자동 리셋

// HTTP/HTTPS 자동 판별 헬퍼
bool isHttps() {
    return String(SERVER_URL).startsWith("https");
}

// 전역 HTTP 클라이언트 (매번 new/delete 대신 재사용 → lwIP 크래시 방지)
WiFiClient plainClient;
WiFiClientSecure secureClient;

WiFiClient& getHttpClient() {
    if (isHttps()) {
        secureClient.setInsecure();
        return secureClient;
    }
    return plainClient;
}

// Deferred actions (콜백 내에서 BLE 스택 재진입 방지)
bool pendingSecurityInit = false;
uint16_t pendingSecurityConnId = 0;
bool pendingAdvertisingRestart = false;

// Bond store write 콜백 - IRK가 저장되는 순간 캡처
int customStoreWriteCb(int obj_type, const union ble_store_value *val) {
    if (obj_type == BLE_STORE_OBJ_TYPE_PEER_SEC) {
        const struct ble_store_value_sec *sec = &val->sec;
        if (sec->irk_present) {
            char buf[33];
            for (int i = 0; i < 16; i++) {
                sprintf(&buf[i * 2], "%02x", sec->irk[i]);
            }
            capturedIrk = String(buf);
            irkCaptured = true;
            Serial.print("IRK intercepted from bond store write: ");
            Serial.println(capturedIrk);

            // IRK를 GATT 캐릭터리스틱에 즉시 세팅 + 알림
            if (pIrkCharacteristic != NULL) {
                pIrkCharacteristic->setValue((uint8_t*)buf, 32);
                pIrkCharacteristic->notify();
                Serial.println("IRK written + notified via GATT characteristic (from store callback)");
            }
        }
    }
    // NimBLE 기본 저장 처리 (NVS에 본딩 정보 저장)
    return 0;
}

// [NimBLE] 본딩 저장소에서 IRK 추출 시도
bool tryCaptureIrkFromBondStore() {
    if (currentConnId == 0xFFFF) return false;

    struct ble_gap_conn_desc desc;
    int rc = ble_gap_conn_find(currentConnId, &desc);
    if (rc != 0) {
        Serial.printf("Failed to find connection desc (rc=%d)\n", rc);
        return false;
    }

    struct ble_store_key_sec key_sec;
    memset(&key_sec, 0, sizeof(key_sec));
    key_sec.peer_addr = desc.peer_id_addr; // Use Identity Address for lookup

    struct ble_store_value_sec value_sec;
    memset(&value_sec, 0, sizeof(value_sec));

    // Query the security store
    rc = ble_store_read_peer_sec(&key_sec, &value_sec);
    if (rc == 0) {
        if (value_sec.irk_present) {
            char buf[33];
            for(int i=0; i<16; i++) {
                sprintf(&buf[i*2], "%02x", value_sec.irk[i]);
            }
            capturedIrk = String(buf);
            Serial.print("IRK Captured: ");
            Serial.println(capturedIrk);
            irkCaptured = true;

            // IRK를 GATT 캐릭터리스틱에도 세팅 + 알림 (Web Bluetooth용)
            if (pIrkCharacteristic != NULL) {
                pIrkCharacteristic->setValue((uint8_t*)buf, 32);
                pIrkCharacteristic->notify();
                Serial.println("IRK written + notified via GATT characteristic");
            }

            return true;
        } else {
             Serial.println("Bond record found, but IRK not present.");
        }
    } else {
        Serial.printf("No bond found in store for this peer (rc=%d)\n", rc);
    }
  return false;
}

void clearAllBonds() {
  NimBLEDevice::deleteAllBonds();
}

class MyServerCallbacks: public NimBLEServerCallbacks {
    void onConnect(NimBLEServer* pServer, NimBLEConnInfo& connInfo) override {
        currentConnId = connInfo.getConnHandle();
        connectTime = millis();
        Serial.println("Device connected. ConnID: " + String(currentConnId));

        // Web Bluetooth 플로우
        if (!isRegistering) {
            if (isWebBtFlow && irkCaptured) {
                // 재연결: IRK 이미 캡처됨 → 캐릭터리스틱에 IRK 세팅 + 알림
                Serial.println("Web BT reconnect - IRK already captured, ready to read");
                if (pIrkCharacteristic != NULL && capturedIrk.length() == 32) {
                    pIrkCharacteristic->setValue((uint8_t*)capturedIrk.c_str(), 32);
                    pIrkCharacteristic->notify();
                    Serial.println("IRK re-set + notified in characteristic for reconnect");
                }
            } else {
                // 첫 연결: JustWorks 페어링 설정
                Serial.println("Web Bluetooth flow detected - switching to JustWorks pairing");
                isWebBtFlow = true;
                webBtAuthTime = 0;
                webBtFlowStartTime = millis();
                irkCaptured = false;
                capturedIrk = "";
                // 첫 연결만 초기화
                if (pIrkCharacteristic != NULL) {
                    const char* empty = "00000000000000000000000000000000";
                    pIrkCharacteristic->setValue((uint8_t*)empty, 32);
                }
                // 딜레이 후 페어링 시작 (안드로이드 GATT 탐색 시간 확보)
                pendingSecurityInit = true;
                pendingSecurityConnId = connInfo.getConnHandle();
            }
            ble_hs_cfg.sm_io_cap = BLE_HS_IO_NO_INPUT_OUTPUT;
            ble_hs_cfg.sm_mitm = 0;
        } else {
            // iOS 플로우: 이전 Web BT 상태 클리어 + 초기화
            isWebBtFlow = false;
            webBtFlowStartTime = 0;
            webBtAuthTime = 0;
            if (pIrkCharacteristic != NULL) {
                const char* empty = "00000000000000000000000000000000";
                pIrkCharacteristic->setValue((uint8_t*)empty, 32);
            }
            // IO_CAP 재확인 (Web BT에서 변경됐을 수 있음)
            ble_hs_cfg.sm_io_cap = BLE_HS_IO_DISPLAY_ONLY;
            ble_hs_cfg.sm_mitm = 1;
            // 딜레이 후 페어링 강제 시작 (iOS 캐시된 본드로 PIN 없이 연결되는 것 방지)
            pendingSecurityInit = true;
            pendingSecurityConnId = connInfo.getConnHandle();
        }
    }

    void onDisconnect(NimBLEServer* pServer, NimBLEConnInfo& connInfo, int reason) override {
        currentConnId = 0xFFFF;
        connectTime = 0;
        Serial.println("Device disconnected, reason: " + String(reason));

        // Web BT 플로우에서 IRK 캡처 완료 전이면 모드 유지 (재연결 대비)
        if (isWebBtFlow && irkCaptured && webBtAuthTime == 0) {
            // 첫 끊김: IRK 캡처됨 → 재연결 대기
            Serial.println("Web BT: IRK captured, keeping JustWorks for reconnect");
            webBtAuthTime = 1;  // 재연결 구분용 플래그
        } else if (isWebBtFlow && irkCaptured && webBtAuthTime > 0) {
            // 재연결 후 끊김: 안드로이드가 IRK를 읽었으므로 플로우 완료 → 즉시 리셋
            Serial.println("Web BT: Flow complete, resetting to iOS mode");
            isWebBtFlow = false;
            irkCaptured = false;
            capturedIrk = "";
            webBtFlowStartTime = 0;
            webBtAuthTime = 0;
            ble_hs_cfg.sm_io_cap = BLE_HS_IO_DISPLAY_ONLY;
            ble_hs_cfg.sm_mitm = 1;
        } else {
            // IRK 캡처 실패 또는 iOS 플로우 → 원래 보안 설정 복원
            if (isWebBtFlow) {
                Serial.println("Web BT: IRK not captured, resetting to iOS mode");
                isWebBtFlow = false;
                webBtFlowStartTime = 0;
                webBtAuthTime = 0;
            }
            ble_hs_cfg.sm_io_cap = BLE_HS_IO_DISPLAY_ONLY;
            ble_hs_cfg.sm_mitm = 1;
        }

        // 등록 중이 아닐 때만 광고 재시작 (loop에서 처리)
        if (!pendingDisconnect) {
            pendingAdvertisingRestart = true;
        }
    }

    uint32_t onPassKeyDisplay() override {
        Serial.printf("onPassKeyDisplay: %06d (iOS will ask user to enter this)\n", currentPasskey);
        return currentPasskey;
    }

    void onAuthenticationComplete(NimBLEConnInfo& connInfo) override {
        Serial.println("=== Authentication Complete ===");
        Serial.printf("  encrypted=%d, authenticated=%d, bonded=%d\n",
                      connInfo.isEncrypted(), connInfo.isAuthenticated(), connInfo.isBonded());

        if (connInfo.isEncrypted() && connInfo.isBonded()) {
            Serial.println("Bonding Success!");
            if (!tryCaptureIrkFromBondStore()) {
                Serial.println("IRK not found immediately. Will retry in loop...");
                if (isWebBtFlow) {
                    webBtAuthTime = millis();
                } else if(currentRequest != nullptr) {
                    currentRequest->status = "authenticated";
                }
            } else {
                if (isWebBtFlow) {
                    Serial.println("Web BT: IRK ready in characteristic");
                } else if(currentRequest != nullptr) {
                    currentRequest->status = "irk_ready";
                }
            }
        } else {
            Serial.println("Bonding Failed");
            if(currentRequest != nullptr) {
                currentRequest->status = "failed";
                pendingDisconnect = true;
                disconnectTargetTime = millis() + 1000;
            }
        }
    }
};

// WiFi 재연결 (C3의 ensureWiFi와 동일)
void ensureWiFi() {
    if (WiFi.status() == WL_CONNECTED) return;
    Serial.println("WiFi reconnecting...");
    WiFi.disconnect();
    WiFi.config(staticIP, gateway, subnet, dns);
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
    }
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println(" Reconnected!");
    } else {
        Serial.println(" Failed!");
    }
}

// --- Local HTTP Server Handlers ---

// ARP 캐시에서 IP → MAC 매핑 조회
String getMacFromArp(IPAddress clientIP) {
    ip4_addr_t ipAddr;
    ipAddr.addr = (uint32_t)clientIP;

    struct eth_addr *eth_ret = NULL;
    const ip4_addr_t *ip_ret = NULL;

    // ARP 테이블 조회를 위해 먼저 etharp_request로 갱신 시도
    struct netif *netif = netif_list;
    if (netif) {
        LOCK_TCPIP_CORE();
        etharp_request(netif, &ipAddr);
        UNLOCK_TCPIP_CORE();
    }

    // 약간의 대기 후 ARP 캐시 조회
    delay(50);

    LOCK_TCPIP_CORE();
    int8_t idx = etharp_find_addr(netif, &ipAddr, &eth_ret, &ip_ret);
    String result = "";
    if (idx >= 0 && eth_ret != NULL) {
        char macStr[18];
        sprintf(macStr, "%02X:%02X:%02X:%02X:%02X:%02X",
                eth_ret->addr[0], eth_ret->addr[1], eth_ret->addr[2],
                eth_ret->addr[3], eth_ret->addr[4], eth_ret->addr[5]);
        result = String(macStr);
    }
    UNLOCK_TCPIP_CORE();
    return result;
}

// GET /mac - 요청자의 WiFi MAC 주소 반환 (JSON)
void handleGetMac() {
    IPAddress clientIP = localServer.client().remoteIP();
    Serial.printf("[WiFi] MAC request from IP: %s\n", clientIP.toString().c_str());

    String mac = getMacFromArp(clientIP);

    if (mac.length() > 0) {
        DynamicJsonDocument doc(128);
        doc["mac"] = mac;
        doc["ip"] = clientIP.toString();
        String json;
        serializeJson(doc, json);
        localServer.send(200, "application/json", json);
        Serial.printf("[WiFi] MAC found: %s\n", mac.c_str());
    } else {
        localServer.send(404, "application/json", "{\"error\":\"MAC not found in ARP cache\"}");
        Serial.println("[WiFi] MAC not found in ARP cache");
    }
}

// 입력값 sanitize (XSS 방지 - 허용 문자만 통과)
String sanitizeAlphaNum(const String& input, int maxLen = 64) {
    String result = "";
    int len = min((int)input.length(), maxLen);
    for (int i = 0; i < len; i++) {
        char c = input.charAt(i);
        if (isalnum(c) || c == '-' || c == '_') {
            result += c;
        }
    }
    return result;
}

String sanitizeUrl(const String& input, int maxLen = 128) {
    String result = "";
    int len = min((int)input.length(), maxLen);
    for (int i = 0; i < len; i++) {
        char c = input.charAt(i);
        // URL에 허용되는 문자만 통과 (스크립트 삽입 차단)
        if (isalnum(c) || c == ':' || c == '/' || c == '.' || c == '-' || c == '_') {
            result += c;
        }
    }
    return result;
}

// GET /register - WiFi MAC 등록 페이지 (ESP32가 직접 HTML 제공)
void handleRegisterPage() {
    String code = sanitizeAlphaNum(localServer.arg("code"), 32);
    String callbackUrl = sanitizeUrl(localServer.arg("callback"), 128);
    if (callbackUrl.length() == 0) callbackUrl = String(SERVER_URL);

    String html = R"rawliteral(
<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WiFi 등록</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px; text-align: center; background: #f5f5f5; }
  .card { background: #fff; padding: 30px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); margin-top: 40px; }
  .status { color: #007bff; font-weight: 600; margin: 20px 0; }
  .error { color: #dc3545; font-weight: bold; margin: 20px 0; }
  .success { color: #28a745; font-weight: bold; margin: 20px 0; font-size: 1.2em; }
  .spinner { width: 40px; height: 40px; border: 4px solid #e0e0e0; border-top: 4px solid #007bff; border-radius: 50%; animation: spin 1s linear infinite; margin: 20px auto; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .desc { color: #666; font-size: 0.9em; }
</style>
</head><body>
<div class="card">
  <h2>WiFi 등록</h2>
  <div id="status" class="status">MAC 주소를 감지하는 중...</div>
  <div id="spinner" class="spinner"></div>
  <p class="desc">잠시만 기다려주세요</p>
</div>
<script>
(async function() {
  const code = ')rawliteral" + code + R"rawliteral(';
  const callbackUrl = ')rawliteral" + callbackUrl + R"rawliteral(';
  const statusEl = document.getElementById('status');
  const spinnerEl = document.getElementById('spinner');

  if (!code) {
    statusEl.className = 'error';
    statusEl.textContent = '잘못된 접근입니다. (코드 없음)';
    spinnerEl.style.display = 'none';
    return;
  }

  try {
    // 1. MAC 감지 (같은 HTTP 서버이므로 Mixed Content 문제 없음)
    const macRes = await fetch('/mac');
    if (!macRes.ok) {
      statusEl.className = 'error';
      statusEl.textContent = 'MAC 주소를 감지하지 못했습니다. WiFi에 연결되어 있는지 확인하세요.';
      spinnerEl.style.display = 'none';
      return;
    }
    const macData = await macRes.json();
    statusEl.textContent = 'MAC 감지 완료 (' + macData.mac + '), 서버에 등록 중...';

    // 2. 외부 서버에 MAC + code 전송
    const regRes = await fetch(callbackUrl + '/api/devices/register/wifi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code, wifiMac: macData.mac })
    });
    const regData = await regRes.json();

    if (regData.success) {
      statusEl.className = 'success';
      statusEl.textContent = 'WiFi 등록 완료!';
      spinnerEl.style.display = 'none';
      document.querySelector('.desc').textContent = '3초 후 자동으로 돌아갑니다...';
      setTimeout(() => { window.location.href = callbackUrl + '/devices/register?wifi=done'; }, 3000);
    } else {
      statusEl.className = 'error';
      statusEl.textContent = regData.error || '등록 실패';
      spinnerEl.style.display = 'none';
    }
  } catch (e) {
    statusEl.className = 'error';
    statusEl.textContent = '네트워크 오류: ' + e.message;
    spinnerEl.style.display = 'none';
  }
})();
</script>
</body></html>
)rawliteral";

    localServer.send(200, "text/html", html);
    Serial.printf("[WiFi] Register page served (code=%s)\n", code.c_str());
}

// WiFi Promiscuous 스캔: 802.11 프레임 캡처로 주변 기기 MAC 수집 → 서버 전송
// AP isolation과 무관하게 동작 (패킷을 엿듣는 방식)
void scanLocalDevices() {
    if (isRegistering) return;

    ensureWiFi();
    if (WiFi.status() != WL_CONNECTED) return;

    Serial.println("[WiFi] Promiscuous scan starting...");
    Serial.printf("[WiFi] Free heap before scan: %d\n", ESP.getFreeHeap());

    // Phase 1: Promiscuous mode로 15초간 MAC 수집
    promiscCollectedMacs.clear();

    // BLE 광고 일시 중단 (Promiscuous 모드와 BLE 동시 사용 시 간섭)
    NimBLEDevice::stopAdvertising();
    Serial.println("[WiFi] BLE advertising paused for scan");

    esp_wifi_set_promiscuous_rx_cb(wifiPromiscuousCallback);
    esp_wifi_set_promiscuous(true);

    Serial.println("[WiFi] Promiscuous mode ON, scanning for 15 seconds...");
    bool scanAborted = false;
    unsigned long scanStart = millis();
    while (millis() - scanStart < 15000) {
        delay(100);  // 100ms 간격으로 체크 (BLE 연결 빠르게 감지)
        esp_task_wdt_reset();
        localServer.handleClient();  // WiFi 등록 요청 처리 유지
        // BLE 연결 감지 시 스캔 즉시 중단
        if (currentConnId != 0xFFFF || isRegistering) {
            Serial.println("[WiFi] BLE connection detected, stopping scan early");
            scanAborted = true;
            break;
        }
    }

    esp_wifi_set_promiscuous(false);
    Serial.printf("[WiFi] Promiscuous mode OFF, captured %d unique MACs\n", promiscCollectedMacs.size());

    // BLE 광고 재시작 (BLE 연결 중이 아닐 때만)
    if (currentConnId == 0xFFFF && !isRegistering) {
        NimBLEDevice::startAdvertising();
        Serial.println("[WiFi] BLE advertising resumed");
    }

    // BLE 연결로 스캔이 중단된 경우 불완전한 데이터 전송 스킵
    if (scanAborted) {
        promiscCollectedMacs.clear();
        return;
    }

    // Phase 2: set → vector 변환
    std::vector<String> macs(promiscCollectedMacs.begin(), promiscCollectedMacs.end());
    promiscCollectedMacs.clear();  // 메모리 해제

    if (macs.size() == 0) return;

    // Phase 3: 서버에 전송
    HTTPClient https;
    https.begin(getHttpClient(), String(SERVER_URL) + "/api/wifi/report");
    https.setTimeout(15000);
    https.addHeader("Content-Type", "application/json");
    https.addHeader("x-api-key", SCANNER_API_KEY);

    DynamicJsonDocument doc(macs.size() * 50 + 512);
    doc["scanner_id"] = "esp32_s3_wifi";
    doc["timestamp"] = millis();

    JsonArray devArr = doc.createNestedArray("devices");
    for (const auto& mac : macs) {
        JsonObject d = devArr.createNestedObject();
        d["mac"] = mac;
    }

    String jsonStr;
    serializeJson(doc, jsonStr);
    doc.clear();

    int responseCode = https.POST(jsonStr);
    Serial.printf("[WiFi] Report sent: %d (%d devices)\n", responseCode, macs.size());

    https.end();

    Serial.printf("[WiFi] Free heap after scan: %d\n", ESP.getFreeHeap());
}

void uploadIrk(String irk) {
    if(currentRequest == nullptr) return;

    ensureWiFi();
    if(WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        String url = String(SERVER_URL) + "/api/devices/register/complete";
        http.begin(getHttpClient(), url);
        http.setTimeout(10000);
        http.addHeader("Content-Type", "application/json");

        DynamicJsonDocument doc(256);
        doc["regId"] = currentRequest->regId;
        doc["irk"] = irk;

        String json;
        serializeJson(doc, json);

        int code = http.POST(json);
        Serial.printf("Upload Result: %d\n", code);

        if(code == 200) {
            Serial.println("IRK Uploaded Successfully!");
            currentRequest->status = "success";
        } else {
            Serial.println("Upload Failed. Code: " + String(code));
            String resp = http.getString();
            Serial.println("Response: " + resp);
            currentRequest->status = "failed";
        }
        http.end();
    }
}

void pollServer() {
    ensureWiFi();
    if (WiFi.status() != WL_CONNECTED) return;

    HTTPClient http;
    String shortId = myMacAddress.substring(myMacAddress.length() - 4);
    String baseUrl = String(SERVER_URL);
    String url = baseUrl + "/api/devices/poll?deviceId=" + shortId;
    http.begin(getHttpClient(), url);
    http.setTimeout(10000);
    int code = http.GET();

    Serial.printf("[Poll] code=%d\n", code);

    if (code == 200) {
        String payload = http.getString();
        DynamicJsonDocument doc(512);
        deserializeJson(doc, payload);

        if (doc["found"]) {
            int regId = doc["regId"];
            const char* pin = doc["pin"];

            Serial.println("Registration detected! regId: " + String(regId));
            Serial.println("Server PIN: " + String(pin));

            // 서버 PIN을 BLE passkey로 설정 (iOS에서 이 번호 입력)
            currentPasskey = atoi(pin);
            NimBLEDevice::setSecurityPasskey(currentPasskey);
            Serial.printf("BLE Passkey set to: %d\n", currentPasskey);

            // Start Registration Session
            isRegistering = true;
            registerStartTime = millis();

            if (currentRequest != nullptr) delete currentRequest;
            currentRequest = new RegistrationRequest();
            currentRequest->regId = regId;
            currentRequest->status = "waiting";

            // Reset State
            uploadNeeded = false;
            pendingDisconnect = false;
            irkCaptured = false;
            capturedIrk = "";
            authStartTime = 0;

            // Clear Bonds
            if (NimBLEDevice::getNumBonds() > 0) {
                clearAllBonds();
            }
        }
    }
    http.end();
}

void setup() {
  Serial.begin(115200);
  delay(2000);  // 시리얼 안정화 대기 늘림

  Serial.println("\n\n=== ESP32-S3 Registration Device ===");

  // Initialize NVS (본딩 데이터 손상 방지를 위해 매번 정리)
  esp_err_t ret = nvs_flash_init();
  if (ret != ESP_OK) {
      Serial.println("NVS init failed, erasing...");
      nvs_flash_erase();
      nvs_flash_init();
  }
  // BLE 본딩 저장소 초기화 (이전 등록 데이터가 크래시 유발 방지)
  nvs_handle_t nvs_handle;
  if (nvs_open("nimble_bond", NVS_READWRITE, &nvs_handle) == ESP_OK) {
      nvs_erase_all(nvs_handle);
      nvs_commit(nvs_handle);
      nvs_close(nvs_handle);
      Serial.println("NVS bond store cleared");
  }

  // WiFi Setup (Static IP)
  Serial.println("Connecting to WiFi: " + String(WIFI_SSID));
  WiFi.mode(WIFI_STA);
  WiFi.config(staticIP, gateway, subnet, dns);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int wifiAttempts = 0;
  while (WiFi.status() != WL_CONNECTED && wifiAttempts < 30) {
    delay(500);
    Serial.print(".");
    wifiAttempts++;
  }
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\nWiFi connection failed! Restarting...");
    delay(1000);
    ESP.restart();
  }
  Serial.println("\nWiFi Connected!");
  Serial.printf("IP: %s\n", WiFi.localIP().toString().c_str());

  // Get MAC
  myMacAddress = WiFi.macAddress();
  myMacAddress.replace(":", "");
  Serial.println("MAC: " + myMacAddress);

  // Promiscuous 필터용 MAC 캡처
  ownMacUpper = WiFi.macAddress();  // "XX:XX:XX:XX:XX:XX" 형태
  delay(500);
  gatewayMacUpper = getMacFromArp(gateway);  // 게이트웨이 MAC (ARP 1회)
  Serial.println("[WiFi] Own MAC: " + ownMacUpper);
  Serial.println("[WiFi] Gateway MAC: " + gatewayMacUpper);

    // BLE Init (NimBLE)
    NimBLEDevice::init("HN_SETUP");

    // Bond store write 콜백 등록 (IRK를 저장 시점에 캡처)
    ble_hs_cfg.store_write_cb = customStoreWriteCb;

    // 보안 설정 (NimBLE) - DisplayOnly 방식 (iOS PIN 입력 가능)
    NimBLEDevice::setSecurityAuth(true, true, true); // bonding, MITM, sc
    NimBLEDevice::setSecurityIOCap(BLE_HS_IO_DISPLAY_ONLY);
    NimBLEDevice::setSecurityInitKey(BLE_SM_PAIR_KEY_DIST_ENC | BLE_SM_PAIR_KEY_DIST_ID);
    NimBLEDevice::setSecurityRespKey(BLE_SM_PAIR_KEY_DIST_ENC | BLE_SM_PAIR_KEY_DIST_ID);

    Serial.printf("Security Config: io_cap=%d, bonding=%d, mitm=%d, sc=%d\n",
        ble_hs_cfg.sm_io_cap, ble_hs_cfg.sm_bonding, ble_hs_cfg.sm_mitm, ble_hs_cfg.sm_sc);

    // Clear Bonds at Startup
    if (NimBLEDevice::getNumBonds() > 0) {
      Serial.println("Clearing old bonds...");
      clearAllBonds();
    }

    pServer = NimBLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

    // HID Setup (가시성 복구)
  static const uint8_t reportMap[] = {
    0x05, 0x01,  0x09, 0x06,  0xA1, 0x01,  0x85, 0x01,  0x05, 0x07,
    0x19, 0xE0,  0x29, 0xE7,  0x15, 0x00,  0x25, 0x01,  0x75, 0x01,
    0x95, 0x08,  0x81, 0x02,  0x95, 0x01,  0x75, 0x08,  0x81, 0x01,
    0x95, 0x06,  0x75, 0x08,  0x15, 0x00,  0x25, 0x65,  0x05, 0x07,
    0x19, 0x00,  0x29, 0x65,  0x81, 0x00,  0xC0
  };

    NimBLEHIDDevice* hid = new NimBLEHIDDevice(pServer);
  hid->setReportMap((uint8_t*)reportMap, sizeof(reportMap));
  hid->setManufacturer("HonNol_Corp");
  hid->setPnp(0x02, 0xe502, 0xa111, 0x0210);
  hid->setHidInfo(0x00, 0x01);

  hid->startServices();

    // Custom IRK Service (Web Bluetooth에서 접근 가능)
    NimBLEService* pIrkService = pServer->createService(IRK_SERVICE_UUID);
    pIrkCharacteristic = pIrkService->createCharacteristic(
        IRK_CHAR_UUID,
        NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY  // 읽기 + 알림 (Web Bluetooth 호환)
    );
    const char* emptyIrk = "00000000000000000000000000000000";
    pIrkCharacteristic->setValue((uint8_t*)emptyIrk, 32);
    pIrkService->start();
    Serial.println("Custom IRK GATT Service started");

    NimBLEAdvertising *pAdvertising = NimBLEDevice::getAdvertising();
  pAdvertising->setAppearance(HID_KEYBOARD);
  pAdvertising->addServiceUUID(hid->getHidService()->getUUID());
    // Scan Response에 이름 + IRK Service UUID 포함
    // (advertising 패킷은 31바이트 제한이므로 HID UUID만 남기고 나머지는 scan response로)
    NimBLEAdvertisementData scanResp;
    scanResp.setName("HN_SETUP");
    scanResp.setCompleteServices(NimBLEUUID(IRK_SERVICE_UUID));
    pAdvertising->setScanResponseData(scanResp);
    NimBLEDevice::setPower(ESP_PWR_LVL_P9);
    NimBLEDevice::startAdvertising();

  // Local HTTP Server (WiFi MAC 등록 페이지 제공)
  localServer.on("/mac", HTTP_GET, handleGetMac);
  localServer.on("/register", HTTP_GET, handleRegisterPage);
  localServer.begin();
  Serial.println("Local HTTP server started on port 80");
  Serial.printf("Register page: http://%s/register\n", WiFi.localIP().toString().c_str());

  // Watchdog Timer (30초 타임아웃 - loop가 30초 이상 멈추면 자동 재시작)
  // ESP-IDF가 이미 TWDT를 초기화했으므로, 기존 것을 삭제 후 재설정
  esp_task_wdt_deinit();
  esp_task_wdt_config_t wdt_config = {
    .timeout_ms = 30000,
    .idle_core_mask = 0,
    .trigger_panic = true,
  };
  esp_task_wdt_init(&wdt_config);
  esp_task_wdt_add(NULL);

  Serial.printf("Setup Complete. Free heap: %d bytes\n", ESP.getFreeHeap());
  Serial.println("Waiting for commands...");
}

void loop() {
  // 0-a. Web BT 플로우 자동 리셋 (60초 후 iOS 모드로 복귀)
  if (isWebBtFlow && webBtFlowStartTime > 0 && millis() - webBtFlowStartTime > WEB_BT_TIMEOUT) {
      Serial.println("Web BT flow timeout - resetting to iOS mode");
      isWebBtFlow = false;
      irkCaptured = false;
      capturedIrk = "";
      webBtFlowStartTime = 0;
      if (pIrkCharacteristic != NULL) {
          const char* empty = "00000000000000000000000000000000";
          pIrkCharacteristic->setValue((uint8_t*)empty, 32);
      }
      ble_hs_cfg.sm_io_cap = BLE_HS_IO_DISPLAY_ONLY;
      ble_hs_cfg.sm_mitm = 1;
  }

  // 0. Deferred BLE actions (콜백에서 직접 호출하면 스택 오버플로우)
  if (pendingSecurityInit) {
      // 안드로이드 GATT 탐색 시간 확보 후 페어링 시작
      if (connectTime > 0 && millis() - connectTime > 2000) {
          pendingSecurityInit = false;
          Serial.println("Initiating security after 2s delay...");
          ble_gap_security_initiate(pendingSecurityConnId);
      }
  }
  if (pendingAdvertisingRestart) {
      pendingAdvertisingRestart = false;
      NimBLEDevice::startAdvertising();
      Serial.println("Started advertising again...");
  }

  // Local HTTP Server 처리 (비블로킹)
  localServer.handleClient();

  // 등록 세션 타임아웃 (120초 - 서버 PIN TTL과 동일)
  if (isRegistering && (millis() - registerStartTime) > REGISTER_TIMEOUT) {
      Serial.println("Registration timeout! No BLE connection received. Rebooting...");
      delay(500);
      ESP.restart();
  }

  // WiFi ARP 스캔 (idle 상태에서만, 60초마다)
  if (!isRegistering && millis() - lastWifiScanTime > WIFI_SCAN_INTERVAL) {
      lastWifiScanTime = millis();
      scanLocalDevices();
  }

  // Watchdog 리셋 (loop가 정상 동작 중임을 알림)
  esp_task_wdt_reset();

  // 힙 메모리 모니터링
  if (millis() - lastHeapLogTime > HEAP_LOG_INTERVAL) {
      lastHeapLogTime = millis();
      size_t freeHeap = ESP.getFreeHeap();
      Serial.printf("[HEAP] Free: %d bytes\n", freeHeap);
      if (freeHeap < HEAP_MIN_THRESHOLD) {
          Serial.println("[HEAP] Critical! Restarting...");
          delay(100);
          ESP.restart();
      }
  }

  // 1. Poll Server (idle 상태에서만 폴링)
  if (!isRegistering && millis() - lastPollTime > POLL_INTERVAL_IDLE) {
      lastPollTime = millis();
      pollServer();
  }

  // 2. Handle IRK Upload (iOS 플로우 - ESP32가 서버에 직접 업로드)
  if (isRegistering && !pendingDisconnect && !uploadNeeded &&
      (currentRequest && currentRequest->status != "success" && currentRequest->status != "failed") &&
      (irkCaptured || (currentRequest && currentRequest->status == "irk_ready"))) {

      if(capturedIrk.length() == 32) {
          pendingIrk = capturedIrk;
          uploadNeeded = true;
          currentRequest->status = "uploading";
      }
  }

  // 2.5. Web Bluetooth IRK Retry (1초 간격)
  if (isWebBtFlow && webBtAuthTime > 0 && !irkCaptured) {
      unsigned long elapsed = millis() - webBtAuthTime;
      if (elapsed > 500 && elapsed % 1000 < 50) {
          Serial.println("Web BT: Retrying IRK capture...");
          if (tryCaptureIrkFromBondStore()) {
              Serial.println("Web BT: IRK captured and written to characteristic!");
              webBtAuthTime = 0;
          } else if (elapsed > 10000) {
              Serial.println("Web BT: IRK capture timeout");
              webBtAuthTime = 0;
          }
      }
  }

  // 3. Retry IRK Extraction (if needed)
  if (isRegistering && currentRequest && currentRequest->status == "authenticated") {
      if (authStartTime == 0) authStartTime = millis();
      if (millis() - authStartTime > 2000) { // Wait 2s for storage
          int dev_num = NimBLEDevice::getNumBonds();
          if (millis() % 1000 < 50) {
            Serial.printf("Retry Loop... Bonded Devices Count: %d\n", dev_num);
          }
          tryCaptureIrkFromBondStore();
      }
      if(millis() - authStartTime > 15000) {
          Serial.println("Timeout waiting for IRK");
          currentRequest->status = "failed";
          pendingDisconnect = true;
          disconnectTargetTime = millis();
      }
  }

  // 4. Do Upload
  if (uploadNeeded) {
      uploadNeeded = false;
      uploadIrk(pendingIrk);

      // Done! Schedule disconnect
      pendingDisconnect = true;
      disconnectTargetTime = millis() + 3000; // 3s delay
  }

  // 5. Cleanup - 등록 완료 후 ESP32 재시작으로 완전 초기화
  if (pendingDisconnect && (millis() - disconnectTargetTime) < 0x80000000UL) {
      pendingDisconnect = false;
      Serial.println("Session Complete. Rebooting...");

      if(currentConnId != 0xFFFF) {
          pServer->disconnect(currentConnId);
          delay(500);
      }

      ESP.restart();
  }

  delay(10);
}

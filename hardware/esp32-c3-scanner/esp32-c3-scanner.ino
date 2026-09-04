#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>
#include <esp_bt.h>
#include <string.h>
#include "secrets.h"  // WIFI_SSID, WIFI_PASS, SCANNER_API_KEY — secrets.h.example 참고

// Server Config
const char* API_SERVER = "https://damonpyo.mooo.com";
const char* API_KEY = SCANNER_API_KEY;
const char* SCANNER_ID = "scanner_main_hall";

// BLE (서버에서 동적 업데이트 가능)
BLEScan* pBLEScan;
int scanTime = 10;
int scanRounds = 3;
int batchSize = 30;
unsigned long scanInterval = 30 * 1000;
unsigned long lastScanTime = 0;

// Buffer (multi-scan dedup)
//
// MAC을 Arduino String으로 들면 1건당 객체 16B + 힙 할당(내용 18B + malloc
// 오버헤드) ≈ 45B에 힙 단편화까지 생긴다. MAC은 원래 6바이트면 충분하므로
// 원시 바이트로 들면 1건당 7B — 같은 메모리로 훨씬 많이 담을 수 있다.
//
// 용량을 넉넉히 확보하는 게 핵심이다. 버퍼가 넘치는 순간 "누구를 버릴지"를
// 골라야 하는데, 스캐너는 IRK가 없어 어떤 MAC이 우리 회원인지 알 수 없다.
// RSSI로 고르면 주머니 속 폰(-85dBm)과 멀리 있는 행인 폰(-85dBm)이 구분되지
// 않는다. 애초에 안 넘치게 하는 것만이 확실한 해법이다.
const int MAX_DEVICES = 600;
uint8_t deviceMacs[MAX_DEVICES][6];
int8_t  deviceRssis[MAX_DEVICES];   // BLE RSSI는 -128~+20 범위라 int8_t로 충분
int deviceCount = 0;
int bufferEvictions = 0;  // 스캔 사이클당 버퍼 만석으로 밀려난 기기 수 (진단용)

// 이름은 패시브 스캔에선 거의 안 잡힌다 (보통 SCAN_RSP에 실려 오는데 패시브는
// SCAN_REQ를 보내지 않음). 서버에서도 디버그 로그용이라 소형 테이블만 둔다.
const int MAX_NAMED = 32;
const int MAX_NAME_LEN = 24;
int  namedIdx[MAX_NAMED];
char namedVals[MAX_NAMED][MAX_NAME_LEN];
int  namedCount = 0;

static bool macToBytes(const char* mac, uint8_t out[6]) {
  unsigned int v[6];
  if (sscanf(mac, "%x:%x:%x:%x:%x:%x", &v[0], &v[1], &v[2], &v[3], &v[4], &v[5]) != 6) {
    return false;
  }
  for (int i = 0; i < 6; i++) out[i] = (uint8_t)v[i];
  return true;
}

static void macToString(const uint8_t mac[6], char* out, size_t len) {
  snprintf(out, len, "%02x:%02x:%02x:%02x:%02x:%02x",
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
}

// char*로 반환한다 — ArduinoJson은 const char*는 포인터만 저장하고 char*는
// 내부 풀로 복사하므로, 복사되는 쪽이 수명 문제에서 안전하다.
static char* nameFor(int idx) {
  for (int i = 0; i < namedCount; i++) {
    if (namedIdx[i] == idx) return namedVals[i];
  }
  return nullptr;
}

static void removeNameFor(int idx) {
  for (int i = 0; i < namedCount; i++) {
    if (namedIdx[i] == idx) {
      namedIdx[i] = namedIdx[namedCount - 1];
      memcpy(namedVals[i], namedVals[namedCount - 1], MAX_NAME_LEN);
      namedCount--;
      return;
    }
  }
}

static void setNameFor(int idx, const char* name) {
  removeNameFor(idx);
  if (namedCount >= MAX_NAMED) return;
  namedIdx[namedCount] = idx;
  strncpy(namedVals[namedCount], name, MAX_NAME_LEN - 1);
  namedVals[namedCount][MAX_NAME_LEN - 1] = '\0';
  namedCount++;
}

void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println("\n\n=== BLE SCANNER ===");

  // WiFi Connect
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n*** WiFi Connected! ***");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi Failed! Restarting...");
    delay(3000);
    ESP.restart();
  }

  // BLE Init
  Serial.println("Initializing BLE...");
  BLEDevice::init(SCANNER_ID);

  // ESP32-C6-WROOM-1U: 외장 안테나 전용 모듈 (GPIO 제어 불필요)
  Serial.println("ESP32-C6-WROOM-1U detected (external antenna only)");

  // 송신 전력(esp_ble_tx_power_set)은 의도적으로 설정하지 않는다.
  // 이 장치는 패시브 스캔만 하므로 BLE 전파를 아예 송신하지 않는다
  // (ESP_BLE_PWR_TYPE_SCAN은 액티브 스캔의 SCAN_REQ 전송에만 쓰임).
  // 수신 감도는 TX 전력과 무관하며 안테나 품질/위치가 결정한다.
  // 전력만 올리면 발열과 소비전력만 늘고 탐지 거리는 그대로다.

  pBLEScan = BLEDevice::getScan();
  pBLEScan->setActiveScan(false);   // Passive scan (MAC+RSSI만 필요, RF 시간 절약)

  // WiFi/BLE 공존 튜닝: C6는 2.4GHz 라디오를 WiFi와 BLE가 공유한다.
  // window == interval(100% 듀티)로 두면 공존 중재기가 강제로 시간을 뺏어가고,
  // 그 손실은 약한 신호(주머니 속 폰)에 집중된다. 명시적 여유를 두는 편이
  // 실제 캡처 수가 늘어나는 경우가 많다.
  // 값 튜닝 시 A/B 비교 권장 (이전 설정: interval 160 / window 160 = 100%)
  pBLEScan->setInterval(160);       // 100ms 주기 (단위 0.625ms)
  pBLEScan->setWindow(112);         // 70ms 수신 = 70% 듀티, 나머지는 WiFi 몫

  Serial.println("=== SCANNER READY (passive, 70% duty) ===\n");
}

void addDevice(const uint8_t mac[6], int rssi, const char* name) {
  for (int i = 0; i < deviceCount; i++) {
    if (memcmp(deviceMacs[i], mac, 6) == 0) {
      if (rssi > deviceRssis[i]) {
        deviceRssis[i] = (int8_t)rssi; // keep strongest RSSI
      }
      return;
    }
  }

  int slot;
  if (deviceCount < MAX_DEVICES) {
    slot = deviceCount++;
  } else {
    // 최후 방어선. 위에서 용량을 늘렸으므로 여기까지 오면 안 되는 게 정상이다.
    // RSSI로 희생자를 고르는 건 근본 해법이 아니다 — 주머니 속 폰과 멀리 있는
    // 무관한 기기의 세기가 비슷하면 잘못 버릴 수 있다. 그래서 이건 "정답"이
    // 아니라 넘쳤을 때의 차선책일 뿐이고, 경고 로그로 MAX_DEVICES를 올리라고
    // 알리는 게 실제 대응이다.
    int weakestIdx = 0;
    for (int i = 1; i < deviceCount; i++) {
      if (deviceRssis[i] < deviceRssis[weakestIdx]) weakestIdx = i;
    }
    bufferEvictions++;
    if (rssi <= deviceRssis[weakestIdx]) return;
    slot = weakestIdx;
  }

  memcpy(deviceMacs[slot], mac, 6);
  deviceRssis[slot] = (int8_t)rssi;
  if (name && name[0]) setNameFor(slot, name);
  else removeNameFor(slot);
}

void ensureWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.println("WiFi reconnecting...");
  WiFi.disconnect();
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

bool sendBatch(int startIdx, int endIdx, int batchIndex, int totalBatches) {
  // WiFi 확인
  ensureWiFi();
  if (WiFi.status() != WL_CONNECTED) return false;

  int batchCount = endIdx - startIdx;

  // JSON 생성 (메모리 절약: 디바이스당 ~80바이트)
  DynamicJsonDocument doc(batchCount * 80 + 512);
  doc["scanner_id"] = SCANNER_ID;
  doc["timestamp"] = millis();
  doc["batch_index"] = batchIndex;
  doc["total_batches"] = totalBatches;

  JsonArray devArr = doc.createNestedArray("devices");
  char macStr[18];
  for (int i = startIdx; i < endIdx; i++) {
    JsonObject d = devArr.createNestedObject();
    // char*는 ArduinoJson이 내부 풀로 복사하므로 버퍼 재사용이 안전하다
    // (const char*였다면 포인터만 저장돼 재사용 시 값이 덮어써진다)
    macToString(deviceMacs[i], macStr, sizeof(macStr));
    d["mac"] = macStr;
    d["rssi"] = deviceRssis[i];
    char* nm = nameFor(i);
    if (nm) d["name"] = nm;
  }

  String jsonString;
  serializeJson(doc, jsonString);
  doc.clear();  // JSON 메모리 즉시 해제

  Serial.print("  Batch " + String(batchIndex + 1) + "/" + String(totalBatches) + " (" + String(batchCount) + " devices, " + String(jsonString.length()) + "B)... ");
  Serial.print("Free heap: " + String(ESP.getFreeHeap()) + " ");

  // HTTPS 연결 (인증서 검증 비활성화 - ESP32-C3 메모리 절약)
  WiFiClientSecure *client = new WiFiClientSecure;
  if (!client) {
    Serial.println("Error: client alloc failed");
    return false;
  }
  client->setInsecure();  // 인증서 검증 스킵 (메모리 절약)

  HTTPClient http;
  String url = String(API_SERVER) + "/api/ble/report";
  http.begin(*client, url);
  http.setTimeout(15000);  // 15초 타임아웃
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", API_KEY);

  int code = http.POST(jsonString);
  String response = http.getString();
  http.end();
  delete client;  // 메모리 해제

  if (code > 0) {
    Serial.println("OK (" + String(code) + ")");

    // 서버 응답에서 config 업데이트
    DynamicJsonDocument resDoc(256);
    if (deserializeJson(resDoc, response) == DeserializationError::Ok && resDoc.containsKey("config")) {
      JsonObject cfg = resDoc["config"];
      // 서버 값은 검증 후에만 반영한다. 특히 batch_size=0은 아래 totalBatches
      // 계산에서 0으로 나누기가 되어 즉시 리셋되고, scan_time=0은 스캔 자체를
      // 무력화한다. 범위를 벗어나면 조용히 기존 값을 유지한다.
      if (cfg.containsKey("scan_time")) {
        int v = cfg["scan_time"].as<int>();
        if (v >= 1 && v <= 60) scanTime = v;
        else Serial.println("  WARN: ignoring invalid scan_time=" + String(v));
      }
      if (cfg.containsKey("scan_rounds")) {
        int v = cfg["scan_rounds"].as<int>();
        if (v >= 1 && v <= 10) scanRounds = v;
        else Serial.println("  WARN: ignoring invalid scan_rounds=" + String(v));
      }
      if (cfg.containsKey("batch_size")) {
        int v = cfg["batch_size"].as<int>();
        if (v >= 1 && v <= MAX_DEVICES) batchSize = v;
        else Serial.println("  WARN: ignoring invalid batch_size=" + String(v));
      }
      if (cfg.containsKey("scan_interval")) {
        int v = cfg["scan_interval"].as<int>();
        if (v >= 1 && v <= 3600) scanInterval = (unsigned long)v * 1000UL;
        else Serial.println("  WARN: ignoring invalid scan_interval=" + String(v));
      }
      Serial.println("  Config updated: scan=" + String(scanTime) + "s x" + String(scanRounds) + " batch=" + String(batchSize) + " interval=" + String(scanInterval / 1000) + "s");
    }

    return true;
  } else {
    Serial.println("Error: " + String(code) + " " + response);
    return false;
  }
}

void loop() {
  if (millis() - lastScanTime < scanInterval) {
    delay(1000);
    return;
  }
  lastScanTime = millis();

  // WiFi 재연결 시도
  ensureWiFi();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi down, skipping");
    return;
  }

  // BLE 스캔 전 메모리 상태
  Serial.println("Free heap before scan: " + String(ESP.getFreeHeap()));

  // Multi-round scan
  deviceCount = 0;
  bufferEvictions = 0;
  namedCount = 0;  // 이름은 인덱스로 묶여 있으므로 버퍼와 함께 반드시 초기화
  for (int round = 1; round <= scanRounds; round++) {
    Serial.println("Scan round " + String(round) + "/" + String(scanRounds) + "...");
    BLEScanResults* foundDevices = pBLEScan->start(scanTime, false);
    int count = foundDevices->getCount();
    Serial.println("  Found: " + String(count) + " devices");

    for (int i = 0; i < count; i++) {
      BLEAdvertisedDevice device = foundDevices->getDevice(i);
      String mac = device.getAddress().toString().c_str();
      int rssi = device.getRSSI();
      String name = device.haveName() ? String(device.getName().c_str()) : "";

      uint8_t macBytes[6];
      if (!macToBytes(mac.c_str(), macBytes)) continue;  // 파싱 실패한 주소는 건너뜀

      addDevice(macBytes, rssi, name.c_str());

      // 디버깅: 가까운 디바이스 출력
      if (rssi > -70) {
        Serial.println("  Close device: " + mac + " RSSI=" + String(rssi));
      }
    }
    pBLEScan->clearResults();

    if (round < scanRounds) {
      delay(500);  // 라운드 간 대기 단축 (1초 → 0.5초)
    }
  }

  Serial.println("Total unique devices: " + String(deviceCount));

  // 버퍼 만석은 약한 신호 유실의 직접 원인이므로 반드시 눈에 띄게 남긴다
  if (bufferEvictions > 0) {
    Serial.println("WARNING: Device buffer FULL (" + String(MAX_DEVICES) + "). " +
                   String(bufferEvictions) + " device(s) competed for a slot. " +
                   "Weakest entries were evicted. Consider raising MAX_DEVICES.");
  }

  // 안테나 진단: RSSI 분포 출력
  if (deviceCount > 0) {
    int strongCount = 0, weakCount = 0, veryWeakCount = 0;
    for (int i = 0; i < deviceCount; i++) {
      if (deviceRssis[i] > -60) strongCount++;
      else if (deviceRssis[i] > -80) weakCount++;
      else veryWeakCount++;
    }
    Serial.println("RSSI Distribution: Strong(-60+)=" + String(strongCount) +
                   " Weak(-60~-80)=" + String(weakCount) +
                   " VeryWeak(-80-)=" + String(veryWeakCount));

    if (strongCount == 0 && deviceCount > 5) {
      Serial.println("WARNING: All signals weak! Check antenna connection!");
    }
  }

  if (deviceCount == 0) return;

  // Send in batches
  if (batchSize < 1) batchSize = 30;  // 방어: 0이면 아래가 0으로 나누기가 된다
  int totalBatches = (deviceCount + batchSize - 1) / batchSize;
  Serial.println("Sending in " + String(totalBatches) + " batch(es)");

  int successCount = 0;
  for (int batch = 0; batch < totalBatches; batch++) {
    int startIdx = batch * batchSize;
    int endIdx = min(startIdx + batchSize, deviceCount);

    if (sendBatch(startIdx, endIdx, batch, totalBatches)) {
      successCount++;
    }

    if (batch < totalBatches - 1) {
      delay(1000);  // 배치 간 1초 대기 (메모리 회수 + TLS 안정성)
    }
  }

  Serial.println("Report done: " + String(successCount) + "/" + String(totalBatches) + " batches OK");
}

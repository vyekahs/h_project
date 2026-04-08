#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>
#include <esp_bt.h>

// WiFi 직접 입력
const char* WIFI_SSID = "KT_GiGA_3F81";
const char* WIFI_PASS = "a4ke01fh66";

// Server Config
const char* API_SERVER = "https://damonpyo.mooo.com";
const char* API_KEY = "hproject_scanner_secret_2026";
const char* SCANNER_ID = "scanner_main_hall";

// BLE (서버에서 동적 업데이트 가능)
BLEScan* pBLEScan;
int scanTime = 10;
int scanRounds = 3;
int batchSize = 30;
unsigned long scanInterval = 30 * 1000;
unsigned long lastScanTime = 0;

// Buffer (multi-scan dedup)
const int MAX_DEVICES = 300;
String deviceMacs[MAX_DEVICES];
int deviceRssis[MAX_DEVICES];
String deviceNames[MAX_DEVICES];
int deviceCount = 0;

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

  // BLE 최대 송신 전력 설정
  // ESP32-C6 지원 레벨: P9(9dBm), P12(12dBm), P15(15dBm), P18(18dBm), P21(21dBm)
  // 주의: 높은 전력은 과열 및 전력 소모 증가
  esp_err_t err1 = esp_ble_tx_power_set(ESP_BLE_PWR_TYPE_SCAN, ESP_PWR_LVL_P9);
  esp_err_t err2 = esp_ble_tx_power_set(ESP_BLE_PWR_TYPE_ADV, ESP_PWR_LVL_P9);
  esp_err_t err3 = esp_ble_tx_power_set(ESP_BLE_PWR_TYPE_DEFAULT, ESP_PWR_LVL_P9);

  Serial.print("BLE TX Power set to 9dBm (safe max) - Status: ");
  Serial.print((err1 == ESP_OK && err2 == ESP_OK && err3 == ESP_OK) ? "OK" : "FAILED");
  if (err1 != ESP_OK) Serial.print(" SCAN:" + String(err1));
  if (err2 != ESP_OK) Serial.print(" ADV:" + String(err2));
  if (err3 != ESP_OK) Serial.print(" DEF:" + String(err3));
  Serial.println();

  pBLEScan = BLEDevice::getScan();
  pBLEScan->setActiveScan(false);   // Passive scan (MAC+RSSI만 필요, RF 시간 절약)
  pBLEScan->setInterval(160);       // 100ms 간격
  pBLEScan->setWindow(160);         // 100ms 윈도우 = 100% 듀티 (연속 수신)

  Serial.println("=== SCANNER READY (passive, 100% duty, 30s interval) ===\n");
}

void addDevice(String mac, int rssi, String name) {
  for (int i = 0; i < deviceCount; i++) {
    if (deviceMacs[i] == mac) {
      if (rssi > deviceRssis[i]) {
        deviceRssis[i] = rssi; // keep strongest RSSI
      }
      return;
    }
  }
  if (deviceCount < MAX_DEVICES) {
    deviceMacs[deviceCount] = mac;
    deviceRssis[deviceCount] = rssi;
    deviceNames[deviceCount] = name;
    deviceCount++;
  }
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
  for (int i = startIdx; i < endIdx; i++) {
    JsonObject d = devArr.createNestedObject();
    d["mac"] = deviceMacs[i];
    d["rssi"] = deviceRssis[i];
    if (deviceNames[i].length() > 0) {
      d["name"] = deviceNames[i];
    }
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
      if (cfg.containsKey("scan_time"))     scanTime     = cfg["scan_time"].as<int>();
      if (cfg.containsKey("scan_rounds"))   scanRounds   = cfg["scan_rounds"].as<int>();
      if (cfg.containsKey("batch_size"))    batchSize     = cfg["batch_size"].as<int>();
      if (cfg.containsKey("scan_interval")) scanInterval  = cfg["scan_interval"].as<int>() * 1000UL;
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

      addDevice(mac, rssi, name);

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

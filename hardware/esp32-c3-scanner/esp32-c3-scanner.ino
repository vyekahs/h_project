#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>

// WiFi 직접 입력
const char* WIFI_SSID = "KT_GiGA_3F81";
const char* WIFI_PASS = "a4ke01fh66";

// Server Config
const char* API_SERVER = "https://damonpyo.mooo.com";
const char* API_KEY = "hproject_scanner_secret_2026";
const char* SCANNER_ID = "scanner_sub_hall";

// BLE
BLEScan* pBLEScan;
const int SCAN_TIME = 5;
const int SCAN_ROUNDS = 3;
const int BATCH_SIZE = 30;  // 50→30: ESP32-C3 메모리 안정성
const unsigned long SCAN_INTERVAL = 60 * 1000;
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
  pBLEScan = BLEDevice::getScan();
  pBLEScan->setActiveScan(true);
  pBLEScan->setInterval(100);
  pBLEScan->setWindow(99);

  Serial.println("=== SCANNER READY ===\n");
}

void addDevice(String mac, int rssi, String name) {
  for (int i = 0; i < deviceCount; i++) {
    if (deviceMacs[i] == mac) {
      deviceRssis[i] = rssi; // update RSSI
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
    return true;
  } else {
    Serial.println("Error: " + String(code) + " " + response);
    return false;
  }
}

void loop() {
  if (millis() - lastScanTime < SCAN_INTERVAL) {
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
  for (int round = 1; round <= SCAN_ROUNDS; round++) {
    Serial.println("Scan round " + String(round) + "/" + String(SCAN_ROUNDS) + "...");
    BLEScanResults* foundDevices = pBLEScan->start(SCAN_TIME, false);
    int count = foundDevices->getCount();
    Serial.println("  Found: " + String(count) + " devices");

    for (int i = 0; i < count; i++) {
      BLEAdvertisedDevice device = foundDevices->getDevice(i);
      String mac = device.getAddress().toString().c_str();
      int rssi = device.getRSSI();
      String name = device.haveName() ? String(device.getName().c_str()) : "";
      addDevice(mac, rssi, name);
    }
    pBLEScan->clearResults();

    if (round < SCAN_ROUNDS) {
      delay(1000);
    }
  }

  Serial.println("Total unique devices: " + String(deviceCount));

  if (deviceCount == 0) return;

  // Send in batches
  int totalBatches = (deviceCount + BATCH_SIZE - 1) / BATCH_SIZE;
  Serial.println("Sending in " + String(totalBatches) + " batch(es)");

  int successCount = 0;
  for (int batch = 0; batch < totalBatches; batch++) {
    int startIdx = batch * BATCH_SIZE;
    int endIdx = min(startIdx + BATCH_SIZE, deviceCount);

    if (sendBatch(startIdx, endIdx, batch, totalBatches)) {
      successCount++;
    }

    if (batch < totalBatches - 1) {
      delay(1000);  // 배치 간 1초 대기 (메모리 회수 + TLS 안정성)
    }
  }

  Serial.println("Report done: " + String(successCount) + "/" + String(totalBatches) + " batches OK");
}

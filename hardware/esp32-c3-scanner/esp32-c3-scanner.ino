#include <WiFi.h>
#include <HTTPClient.h>
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
const char* SCANNER_ID = "scanner_main_hall";

// BLE
BLEScan* pBLEScan;
const int SCAN_TIME = 3;
const int SCAN_ROUNDS = 3;
const int BATCH_SIZE = 50;
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

bool sendBatch(int startIdx, int endIdx, int batchIndex, int totalBatches) {
  HTTPClient http;
  String url = String(API_SERVER) + "/api/ble/report";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", API_KEY);

  int batchCount = endIdx - startIdx;
  DynamicJsonDocument doc(4096);
  doc["scanner_id"] = SCANNER_ID;
  doc["timestamp"] = millis();
  doc["batch_index"] = batchIndex;
  doc["total_batches"] = totalBatches;

  JsonArray devArr = doc.createNestedArray("devices");
  for (int i = startIdx; i < endIdx; i++) {
    JsonObject d = devArr.createNestedObject();
    d["mac"] = deviceMacs[i];
    d["rssi"] = deviceRssis[i];
    d["name"] = deviceNames[i];
  }

  String jsonString;
  serializeJson(doc, jsonString);

  Serial.print("  Batch " + String(batchIndex + 1) + "/" + String(totalBatches) + " (" + String(batchCount) + " devices)... ");
  int code = http.POST(jsonString);
  http.end();

  if (code > 0) {
    Serial.println("OK (" + String(code) + ")");
    return true;
  } else {
    Serial.println("Error: " + String(code));
    return false;
  }
}

void loop() {
  if (millis() - lastScanTime < SCAN_INTERVAL) {
    delay(1000);
    return;
  }
  lastScanTime = millis();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi down, skipping");
    return;
  }

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
      delay(200);
    }
  }

  Serial.println("Report done: " + String(successCount) + "/" + String(totalBatches) + " batches OK");
}

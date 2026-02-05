#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>

// WiFi 직접 입력
const char* WIFI_SSID = "U+NetE836";
const char* WIFI_PASS = "7356361EM!";

// Server Config
const char* API_SERVER = "192.168.219.120";
const int API_PORT = 5173;
const char* API_KEY = "hproject_scanner_secret_2026";
const char* SCANNER_ID = "scanner_main_hall";

// BLE
BLEScan* pBLEScan;
const int SCAN_TIME = 3;
const int REPORT_INTERVAL = 10 * 1000;
unsigned long lastReportTime = 0;

// Buffer
const int MAX_DEVICES = 50;
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
  pBLEScan->setActiveScan(true); // Active Scan for iPhone detection
  pBLEScan->setInterval(100);
  pBLEScan->setWindow(99);
  
  Serial.println("=== SCANNER READY ===\n");
}

void sendReport() {
  if (WiFi.status() != WL_CONNECTED || deviceCount == 0) {
    Serial.println("No devices or WiFi down");
    return;
  }
  
  HTTPClient http;
  String url = String("http://") + API_SERVER + ":" + String(API_PORT) + "/api/ble/report";
  Serial.println("URL: " + url);
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-api-key", API_KEY);

  DynamicJsonDocument doc(4096);
  doc["scanner_id"] = SCANNER_ID;
  doc["timestamp"] = millis();
  
  JsonArray devices = doc.createNestedArray("devices");
  for (int i = 0; i < deviceCount; i++) {
    JsonObject d = devices.createNestedObject();
    d["mac"] = deviceMacs[i];
    d["rssi"] = deviceRssis[i];
    
    d["name"] = deviceNames[i];
  }
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.print("Sending " + String(deviceCount) + " devices... ");
  int code = http.POST(jsonString);
  
  if (code > 0) {
    Serial.println("OK (" + String(code) + ")");
  } else {
    Serial.println("Error: " + String(code));
  }
  http.end();
}

void loop() {
  // Scan
  Serial.println("Scanning BLE...");
  BLEScanResults foundDevices = pBLEScan->start(SCAN_TIME, false);
  int count = foundDevices.getCount();
  Serial.println("Found: " + String(count) + " devices");
  
  for (int i = 0; i < count; i++) {
    BLEAdvertisedDevice device = foundDevices.getDevice(i);
    String mac = device.getAddress().toString().c_str();
    int rssi = device.getRSSI();

    bool existing = false;
    for (int j = 0; j < deviceCount; j++) {
      if (deviceMacs[j] == mac) {
        deviceRssis[j] = rssi;
        existing = true;
        break;
      }
    }
    
    if (!existing && deviceCount < MAX_DEVICES) {
      deviceMacs[deviceCount] = mac;
      deviceRssis[deviceCount] = rssi;
      
      if (device.haveName()) {
        deviceNames[deviceCount] = device.getName().c_str();
      } else {
        deviceNames[deviceCount] = "";
      }
      
      deviceCount++;
    }
  }
  pBLEScan->clearResults();

  // Report
  if (millis() - lastReportTime > REPORT_INTERVAL) {
    sendReport();
    lastReportTime = millis();
    deviceCount = 0;
  }
  
  delay(1000);
}

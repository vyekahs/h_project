
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>
#include <WiFiManager.h> // https://github.com/tzapu/WiFiManager
#include <FS.h>
#include <SPIFFS.h>

// --- DEFAULTS ---
// These will be overwritten by config.json if it exists
char api_server[60] = "192.168.0.10";
char api_port[6] = "3000";
char api_key[40] = "hproject_scanner_secret_2026";
char scanner_id[32] = "scanner_main_hall";

// Flags
bool shouldSaveConfig = false;

// --- GLOBALS ---
BLEScan* pBLEScan;
unsigned long lastReportTime = 0;
const int SCAN_TIME = 5; 
const int REPORT_INTERVAL = 300 * 1000; 

// Buffer
const int MAX_DEVICES = 50;
String deviceMacs[MAX_DEVICES];
int deviceRssis[MAX_DEVICES];
int deviceCount = 0;

// Callback notifying us of the need to save config
void saveConfigCallback () {
  Serial.println("Should save config");
  shouldSaveConfig = true;
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\nStarting Scanner...");

  // 1. Mount SPIFFS & Load Config
  if (SPIFFS.begin(true)) {
    Serial.println("mounted file system");
    if (SPIFFS.exists("/config.json")) {
      Serial.println("reading config file");
      File configFile = SPIFFS.open("/config.json", "r");
      if (configFile) {
        size_t size = configFile.size();
        std::unique_ptr<char[]> buf(new char[size]);
        configFile.readBytes(buf.get(), size);
        
        DynamicJsonDocument json(1024);
        DeserializationError error = deserializeJson(json, buf.get());
        if (!error) {
          Serial.println("\nparsed json");
          strcpy(api_server, json["api_server"]);
          strcpy(api_port, json["api_port"]);
          strcpy(api_key, json["api_key"]);
          strcpy(scanner_id, json["scanner_id"]);
        } else {
          Serial.println("failed to load json config");
        }
      }
    }
  } else {
    Serial.println("failed to mount FS");
  }

  // 2. WiFiManager Setup
  WiFiManager wm;
  wm.setSaveConfigCallback(saveConfigCallback);

  // Custom Parameters
  WiFiManagerParameter custom_api_server("server", "Server IP", api_server, 60);
  WiFiManagerParameter custom_api_port("port", "Port", api_port, 6);
  WiFiManagerParameter custom_api_key("apikey", "API Key", api_key, 40);
  WiFiManagerParameter custom_scanner_id("id", "Scanner ID", scanner_id, 32);

  wm.addParameter(&custom_api_server);
  wm.addParameter(&custom_api_port);
  wm.addParameter(&custom_api_key);
  wm.addParameter(&custom_scanner_id);

  // set static ip?
  // wm.setSTAStaticIPConfig(IPAddress(10,0,1,99), IPAddress(10,0,1,1), IPAddress(255,255,255,0));

  if (!wm.autoConnect("Scanner_Setup")) {
    Serial.println("failed to connect and hit timeout");
    delay(3000);
    ESP.restart();
    delay(5000);
  }

  Serial.println("connected...yeey :)");
  
  // Read updated parameters
  strcpy(api_server, custom_api_server.getValue());
  strcpy(api_port, custom_api_port.getValue());
  strcpy(api_key, custom_api_key.getValue());
  strcpy(scanner_id, custom_scanner_id.getValue());

  // Save to SPIFFS if needed
  if (shouldSaveConfig) {
    Serial.println("saving config");
    DynamicJsonDocument json(1024);
    json["api_server"] = api_server;
    json["api_port"] = api_port;
    json["api_key"] = api_key;
    json["scanner_id"] = scanner_id;

    File configFile = SPIFFS.open("/config.json", "w");
    if (!configFile) {
      Serial.println("failed to open config file for writing");
    }
    serializeJson(json, Serial);
    serializeJson(json, configFile);
    configFile.close();
    Serial.println("config saved");
  }

  Serial.println("Local IP");
  Serial.println(WiFi.localIP());
  Serial.print("Target Server: ");
  Serial.println(api_server);

  // 3. Init BLE
  BLEDevice::init(scanner_id);
  pBLEScan = BLEDevice::getScan();
  pBLEScan->setActiveScan(false); 
  pBLEScan->setInterval(100);
  pBLEScan->setWindow(99);
}

void loop() {
  // 1. Scan
  Serial.println("Scanning...");
  BLEScanResults foundDevices = pBLEScan->start(SCAN_TIME, false);
  int count = foundDevices.getCount();
  
  for (int i = 0; i < count; i++) {
    BLEAdvertisedDevice device = foundDevices.getDevice(i);
    String mac = device.getAddress().toString().c_str();
    int rssi = device.getRSSI();

    bool existing = false;
    for(int j=0; j<deviceCount; j++) {
        if(deviceMacs[j] == mac) {
            deviceRssis[j] = rssi; 
            existing = true;
            break;
        }
    }
    
    if(!existing && deviceCount < MAX_DEVICES) {
        deviceMacs[deviceCount] = mac;
        deviceRssis[deviceCount] = rssi;
        deviceCount++;
    }
  }
  pBLEScan->clearResults(); 

  // 2. Report
  unsigned long now = millis();
  if (now - lastReportTime > REPORT_INTERVAL) {
    sendReport();
    lastReportTime = now;
    deviceCount = 0;
  }
  
  delay(1000);
}

void sendReport() {
  if(WiFi.status() == WL_CONNECTED && deviceCount > 0) {
    HTTPClient http;
    
    String url = "http://" + String(api_server) + ":" + String(api_port) + "/api/ble/report";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-api-key", api_key);

    DynamicJsonDocument doc(4096);
    doc["scanner_id"] = scanner_id;
    doc["timestamp"] = millis(); 
    
    JsonArray devices = doc.createNestedArray("devices");
    for(int i=0; i<deviceCount; i++) {
        JsonObject d = devices.createNestedObject();
        d["mac"] = deviceMacs[i];
        d["rssi"] = deviceRssis[i];
    }
    
    String jsonString;
    serializeJson(doc, jsonString);
    
    Serial.print("Sending Report to " + url + "... ");
    int httpResponseCode = http.POST(jsonString);
    
    if(httpResponseCode > 0) {
      String response = http.getString();
      Serial.println("Res: " + String(httpResponseCode)); 
    } else {
      Serial.print("Error: ");
      Serial.println(httpResponseCode);
    }
    http.end();
  } else {
      Serial.println("No devices or WiFi Disconnected.");
  }
}

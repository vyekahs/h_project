#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <vector>
#include <NimBLEDevice.h>
#include <NimBLEHIDDevice.h>
#include <esp_bt.h>
#include <nvs_flash.h>
// ESP-IDF NimBLE C API headers for direct access to security store
#include "host/ble_hs.h"
#include "host/ble_store.h"
#include "services/gap/ble_svc_gap.h"

// --- CONFIGURATION ---
const char* SERVER_URL = "http://192.168.219.120:3000";
const char* WIFI_SSID = "U+NetE836";
const char* WIFI_PASS = "7356361EM!";

// Custom GATT Service UUIDs for IRK retrieval (Web Bluetooth용)
#define IRK_SERVICE_UUID        "12345678-1234-5678-1234-56789abcdef0"
#define IRK_CHAR_UUID           "12345678-1234-5678-1234-56789abcdef1"

// BLE globals
NimBLEServer* pServer = NULL;
NimBLECharacteristic* pIrkCharacteristic = NULL;
uint16_t currentConnId = 0xFFFF;

// Polling Globals
unsigned long lastPollTime = 0;
const unsigned long POLL_INTERVAL = 2000; // 2초마다 체크
bool isRegistering = false;
String myMacAddress = "";

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
bool securityStarted = false;
unsigned long connectTime = 0;
uint32_t currentPasskey = 0; // 서버에서 받은 PIN

// IRK variable
String capturedIrk = "";
bool irkCaptured = false;

// Web Bluetooth flow state
bool isWebBtFlow = false;
unsigned long webBtAuthTime = 0;

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

            // IRK를 GATT 캐릭터리스틱에 즉시 세팅
            if (pIrkCharacteristic != NULL) {
                pIrkCharacteristic->setValue((uint8_t*)buf, 32);
                Serial.println("IRK written to GATT characteristic (from store callback)");
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

            // IRK를 GATT 캐릭터리스틱에도 세팅 (Web Bluetooth용)
            if (pIrkCharacteristic != NULL) {
                pIrkCharacteristic->setValue((uint8_t*)buf, 32);
                Serial.println("IRK written to GATT characteristic");
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
        securityStarted = false;
        Serial.println("Device connected. ConnID: " + String(currentConnId));

        // Web Bluetooth 플로우 (서버 등록 없이 직접 연결된 경우)
        // → Just Works 페어링 사용 (PIN 불필요)
        if (!isRegistering) {
            Serial.println("Web Bluetooth flow detected - switching to JustWorks pairing");
            isWebBtFlow = true;
            webBtAuthTime = 0;
            irkCaptured = false;
            capturedIrk = "";
            ble_hs_cfg.sm_io_cap = BLE_HS_IO_NO_INPUT_OUTPUT;
            ble_hs_cfg.sm_mitm = 0;
            // 서버 측에서 본딩 시작
            ble_gap_security_initiate(connInfo.getConnHandle());
        }

        // IRK 캐릭터리스틱 초기화 (새 연결마다)
        if (pIrkCharacteristic != NULL) {
            const char* empty = "00000000000000000000000000000000";
            pIrkCharacteristic->setValue((uint8_t*)empty, 32);
        }
    }

    void onDisconnect(NimBLEServer* pServer, NimBLEConnInfo& connInfo, int reason) override {
        currentConnId = 0xFFFF;
        connectTime = 0;
        securityStarted = false;
        Serial.println("Device disconnected, reason: " + String(reason));

        // 상태 리셋
        isWebBtFlow = false;
        webBtAuthTime = 0;

        // iOS 플로우를 위해 원래 보안 설정 복원
        ble_hs_cfg.sm_io_cap = BLE_HS_IO_DISPLAY_ONLY;
        ble_hs_cfg.sm_mitm = 1;
        // 등록 중이 아닐 때만 광고 재시작 (등록 완료 후 끊길 때는 재시작 안 함)
        if (!pendingDisconnect) {
            NimBLEDevice::startAdvertising();
            Serial.println("Started advertising again...");
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

void uploadIrk(String irk) {
    if(currentRequest == nullptr) return;

    if(WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        String url = String(SERVER_URL) + "/api/devices/register/complete";
        http.begin(url);
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

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n\n=== ESP32-S3 Registration Device ===");

  // Initialize NVS
  esp_err_t ret = nvs_flash_init();
  if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
      nvs_flash_erase();
      nvs_flash_init();
  }

  // WiFi Setup
  Serial.println("Connecting to WiFi: " + String(WIFI_SSID));
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected!");
  Serial.println(WiFi.localIP());

  // Get MAC
  myMacAddress = WiFi.macAddress();
  myMacAddress.replace(":", "");
  Serial.println("MAC: " + myMacAddress);

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

    NimBLECharacteristic* input = hid->getInputReport(1);

  hid->startServices();

    // Custom IRK Service (Web Bluetooth에서 접근 가능)
    NimBLEService* pIrkService = pServer->createService(IRK_SERVICE_UUID);
    pIrkCharacteristic = pIrkService->createCharacteristic(
        IRK_CHAR_UUID,
        NIMBLE_PROPERTY::READ
    );
    const char* emptyIrk = "00000000000000000000000000000000";
    pIrkCharacteristic->setValue((uint8_t*)emptyIrk, 32);
    pIrkService->start();
    Serial.println("Custom IRK GATT Service started");

    NimBLEAdvertising *pAdvertising = NimBLEDevice::getAdvertising();
  pAdvertising->setAppearance(HID_KEYBOARD);
  pAdvertising->addServiceUUID(hid->getHidService()->getUUID());
  pAdvertising->addServiceUUID(IRK_SERVICE_UUID); // Web Bluetooth 필터용
    NimBLEDevice::setPower(ESP_PWR_LVL_P9);
    NimBLEDevice::startAdvertising();

  Serial.println("Setup Complete. Waiting for commands...");
}

void loop() {
  // 1. Poll Server
  if (WiFi.status() == WL_CONNECTED && !isRegistering &&
      millis() - lastPollTime > POLL_INTERVAL) {
      lastPollTime = millis();

      HTTPClient http;
      String shortId = myMacAddress.substring(myMacAddress.length() - 4);
      http.begin(String(SERVER_URL) + "/api/devices/poll?deviceId=" + shortId);
      int code = http.GET();

      if(code == 200) {
          String payload = http.getString();
          DynamicJsonDocument doc(512);
          deserializeJson(doc, payload);

          if(doc["found"]) {
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

              if(currentRequest != nullptr) delete currentRequest;
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

  // 2.5. Web Bluetooth IRK Retry
  if (isWebBtFlow && webBtAuthTime > 0 && !irkCaptured) {
      if (millis() - webBtAuthTime > 500) {
          Serial.println("Web BT: Retrying IRK capture...");
          if (tryCaptureIrkFromBondStore()) {
              Serial.println("Web BT: IRK captured and written to characteristic!");
              webBtAuthTime = 0;
          } else if (millis() - webBtAuthTime > 10000) {
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

  // 5. Cleanup
  if (pendingDisconnect && millis() > disconnectTargetTime) {
      pendingDisconnect = false;
      Serial.println("Session Complete. Resetting.");

      if(currentConnId != 0xFFFF) {
          pServer->disconnect(currentConnId);
      }

      isRegistering = false;

        // Clear bonds again to be safe
          if (NimBLEDevice::getNumBonds() > 0) {
            clearAllBonds();
          }
      NimBLEDevice::startAdvertising(); // Ready for next person
  }

  delay(10);
}

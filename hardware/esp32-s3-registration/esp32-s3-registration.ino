
#include <WiFi.h>
#include <DNSServer.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <esp_bt_main.h>
#include <esp_gap_ble_api.h>
#include <BLEHIDDevice.h>
#include <BLE2902.h>

#include <WiFiManager.h> // https://github.com/tzapu/WiFiManager
#include <ESPmDNS.h>
#include <vector>

// --- CONFIGURATION ---
const char* SERVER_URL  = "http://192.168.219.120:5173";// Main Server

const char* AP_SSID     = "BoardGame_Signup";    // User connects here (Captive Portal)
const char* AP_PASSWORD = "";                    // Open network for captive portal

const byte DNS_PORT = 53;
DNSServer dnsServer;
WebServer server(80);

// Types
struct RegRequest {
    String username;
    String password;
    String confirmPassword;
    String deviceName;
    String mode;
    unsigned long timestamp;
    String status; // "waiting", "processing", "success", "failed", "uploading"
    String errorMsg;
};

std::vector<RegRequest> requestQueue;
RegRequest* currentRequest = nullptr;

// BLE globals
BLEServer* pServer = NULL;
BLESecurity *pSecurity = NULL;
bool bondingInProgress = false;
unsigned long bondingStartTime = 0;
const unsigned long BONDING_TIMEOUT = 60000; // 60 sec timeout
const unsigned long JOB_RETENTION_TIME = 100; // Fast clear!
const int MAX_QUEUE_SIZE = 20;
uint16_t currentConnId = 0xFFFF;
bool pendingDisconnect = false;
unsigned long disconnectTargetTime = 0;
// Upload Queue
String pendingIrk = "";
bool uploadNeeded = false;

// Buffer for the last finished job so user can see result even if queue moved on
struct JobResult {
    String username;
    String status;
    String errorMsg;
    unsigned long finishTime;
};
JobResult lastFinishedJob = {"", "", "", 0};

// HTML Content
const char index_html[] PROGMEM = R"rawliteral(
<!DOCTYPE HTML><html><head>
  <meta charset="UTF-8">
  <title>Hon-Nol Lounge Registration</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: 'Apple SD Gothic Neo', sans-serif; text-align: center; padding: 20px; background: #f8f9fa; color: #333; }
    .card { background: white; padding: 0; border-radius: 16px; max-width: 400px; margin: auto; box-shadow: 0 4px 15px rgba(0,0,0,0.08); overflow: hidden; }
    .header { padding: 25px 25px 10px 25px; }
    h2 { margin: 0 0 5px 0; color: #1a1a1a; font-size: 1.4em; }
    p { color: #666; font-size: 0.9em; margin: 0; }
    
    .tabs { display: flex; border-bottom: 1px solid #eee; margin-top: 20px; }
    .tab { flex: 1; padding: 15px; cursor: pointer; background: #f1f3f5; color: #888; font-weight: bold; border-bottom: 2px solid transparent; }
    .tab.active { background: white; color: #339af0; border-bottom: 2px solid #339af0; }
    
    .form-content { padding: 25px; }
    .input-group { text-align: left; margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; font-size: 0.85em; color: #555; }
    input { width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 16px; box-sizing: border-box; transition: border 0.2s; }
    input:focus { border-color: #339af0; outline: none; }
    .hidden { display: none; }
    
    button { width: 100%; padding: 14px; background: #339af0; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; font-weight: bold; transition: background 0.2s; margin-top: 10px; }
    button:active { background: #1c7ed6; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    
    .status { margin-top: 20px; font-size: 14px; color: #555; min-height: 20px; line-height: 1.4; white-space: pre-wrap; }
  </style>
</head><body>
  <div class="card">
    <div class="header">
        <h2>혼놀 라운지</h2>
        <p>블루투스 출입증 발급</p>
    </div>
    <div class="tabs">
        <div class="tab active" onclick="setMode('login')" id="tab-login">로그인</div>
        <div class="tab" onclick="setMode('signup')" id="tab-signup">회원가입</div>
    </div>
    <div class="form-content">
        <div id="form-inputs">
            <div class="input-group">
                <label>이름 (ID)</label>
                <input type="text" id="username" placeholder="이름 입력">
            </div>
            <div class="input-group">
                <label>비밀번호</label>
                <input type="password" id="password" placeholder="비밀번호">
            </div>
            <div class="input-group hidden" id="group-confirm">
                <label>비밀번호 확인</label>
                <input type="password" id="confirm-password" placeholder="비밀번호 다시 입력">
            </div>
            <div class="input-group">
                <label>기기 이름 (별칭)</label>
                <input type="text" id="devName" placeholder="예: 내 아이폰">
            </div>
            <button onclick="startBonding()" id="btn-submit">대기열 등록 및 시작</button>
        </div>
        <div class="status" id="status"></div>
    </div>
  </div>

  <script>
    let currentMode = 'login';
    let myUsername = '';
    let statusInterval = null;

    function setMode(mode) {
        currentMode = mode;
        document.getElementById('tab-login').className = mode === 'login' ? 'tab active' : 'tab';
        document.getElementById('tab-signup').className = mode === 'signup' ? 'tab active' : 'tab';
        
        const confirmGroup = document.getElementById('group-confirm');
        const btn = document.getElementById('btn-submit');
        if(mode === 'signup') {
            confirmGroup.classList.remove('hidden');
            btn.innerText = "회원가입 대기열 등록";
        } else {
            confirmGroup.classList.add('hidden');
            btn.innerText = "로그인 대기열 등록";
        }
    }

    function startBonding() {
      var u = document.getElementById('username').value;
      var p = document.getElementById('password').value;
      var d = document.getElementById('devName').value;
      
      if(!u || !p || !d) { alert("모두 입력해주세요."); return; }
      
      var query = 'u=' + encodeURIComponent(u) + '&p=' + encodeURIComponent(p) + '&d=' + encodeURIComponent(d) + '&m=' + currentMode;
      if(currentMode === 'signup') {
          var cp = document.getElementById('confirm-password').value;
          if(p !== cp) { alert("비밀번호 불일치!"); return; }
          query += '&cp=' + encodeURIComponent(cp);
      }
      
      myUsername = u;
      document.getElementById('btn-submit').disabled = true;
      document.getElementById('status').innerText = "대기열 등록 중...";
      
      fetch('/api/queue_add?' + query)
        .then(res => res.json())
        .then(data => {
            if(data.success) {
                document.getElementById('form-inputs').style.display = 'none'; // Hide form
                checkStatus(u);
            } else {
                document.getElementById('status').innerText = "오류: " + data.error;
                document.getElementById('btn-submit').disabled = false;
            }
        })
        .catch(error => {
            document.getElementById('status').innerText = "네트워크 오류: " + error;
            document.getElementById('btn-submit').disabled = false;
        });
    }

    function checkStatus(user) {
        if (statusInterval) {
            clearInterval(statusInterval);
        }
        statusInterval = setInterval(() => {
            fetch('/api/queue_status?u=' + encodeURIComponent(user))
              .then(res => res.json())
              .then(data => {
                  if(data.error) {
                      document.getElementById('status').innerText = data.error;
                      clearInterval(statusInterval);
                      statusInterval = null;
                      document.getElementById('btn-submit').disabled = false;
                      return;
                  }
                  
                  if (data.status === 'processing') {
                      document.getElementById('status').innerText = "🚀 내 차례입니다! \n블루투스 설정에서 'HonNol' 연결!\n'연결됨' 뜨면 1초 뒤에 이 화면으로 오세요.\n(자동으로 연결 해제됩니다)";
                      document.getElementById('status').style.color = "#d63384";
                      document.getElementById('status').style.fontWeight = "bold";
                  } else if (data.status === 'waiting') {
                      let msg = "⏳ 대기 중... " + data.position + "번째 (총 " + data.total + "명)";
                      if(data.current_user && data.current_user !== "없음") {
                          msg += "\n▶️ 현재 진행 중: " + data.current_user + "님";
                      }
                      document.getElementById('status').innerText = msg;
                      document.getElementById('status').style.color = "#fd7e14";
                  } else if (data.status === 'uploading') {
                      document.getElementById('status').innerText = "📡 서버에 정보 전송 중...";
                      document.getElementById('status').style.color = "#339af0";
                  } else if (data.status === 'success') {
                      document.getElementById('status').innerText = "✅ 등록 완료! 환영합니다.";
                      document.getElementById('status').style.color = "green";
                      clearInterval(statusInterval);
                      statusInterval = null;
                      document.getElementById('btn-submit').disabled = false;
                      alert("등록 성공!");
                  } else if (data.status === 'failed') {
                      document.getElementById('status').innerText = "❌ 실패: " + data.msg;
                      document.getElementById('status').style.color = "red";
                      clearInterval(statusInterval);
                      statusInterval = null;
                      document.getElementById('form-inputs').style.display = 'block'; // Show form again
                      document.getElementById('btn-submit').disabled = false;
                  }
              })
              .catch(error => {
                  document.getElementById('status').innerText = "네트워크 오류: " + error;
                  clearInterval(statusInterval);
                  statusInterval = null;
                  document.getElementById('form-inputs').style.display = 'block'; // Show form again
                  document.getElementById('btn-submit').disabled = false;
              });
        }, 1500);
    }
  </script>
</body></html>
)rawliteral";

// Forward declarations

// Forward declarations
void uploadIrk(String irk);

class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      Serial.println("Device connected (No param)");
    };

    void onConnect(BLEServer* pServer, esp_ble_gatts_cb_param_t *param) {
      currentConnId = param->connect.conn_id;
      Serial.println("Device connected. ConnID: " + String(currentConnId));
    }

    void onDisconnect(BLEServer* pServer) {
      currentConnId = 0xFFFF;
      pendingDisconnect = false; // Cancel pending disconnect if already gone
      Serial.println("Device disconnected");
    }
};

// Callback Class for Bonding
class MySecurity : public BLESecurityCallbacks {
  uint32_t onPassKeyRequest(){ return 123456; }
  void onPassKeyNotify(uint32_t pass_key){}
  bool onConfirmPIN(uint32_t pass_key){ return true; }
  bool onSecurityRequest(){ return true; }
  
  void onAuthenticationComplete(esp_ble_auth_cmpl_t cmpl){
        if(currentRequest == nullptr) {
            Serial.println("Bonding complete but no current request.");
            bondingInProgress = false;
            return;
        }

        if(cmpl.success){
            Serial.println("Bonding Success!");
            currentRequest->status = "uploading";
            
            // Extract IRK logic...
            esp_ble_bond_key_info_t key_info;
            int dev_num = esp_ble_get_bond_device_num();
            esp_ble_bond_dev_t *dev_list = (esp_ble_bond_dev_t *)malloc(sizeof(esp_ble_bond_dev_t) * dev_num);
            esp_ble_get_bond_device_list(&dev_num, dev_list);
            
            String irkHex = "";
            for(int i = 0; i < dev_num; i++) {
                if (memcmp(dev_list[i].bd_addr, cmpl.bd_addr, 6) == 0) {
                     for(int j=0; j<16; j++){
                        if(dev_list[i].bond_key.pid_key.irk[j] < 16) irkHex += "0";
                        irkHex += String(dev_list[i].bond_key.pid_key.irk[j], HEX);
                     }
                     break; // Found the device, no need to check others
                }
            }
            free(dev_list);
            
            if(irkHex.length() == 32) {
                // DON'T upload here (Blocking!). Just save it.
                pendingIrk = irkHex;
                uploadNeeded = true;
                // Disconnect will be scheduled AFTER upload in the loop
            } else {
                currentRequest->status = "failed";
                currentRequest->errorMsg = "IRK 추출 실패";
                // Fail immediately
                pendingDisconnect = true;
                disconnectTargetTime = millis() + 1000;
            }
        } else {
            Serial.println("Bonding Failed");
            currentRequest->status = "failed";
            currentRequest->errorMsg = "블루투스 연결 실패 (코드: " + String(cmpl.fail_reason) + ")";
        }
        // Finish current job
        bondingInProgress = false;
  }
};

// ... (Top of file unchanged)

void uploadIrk(String irk) {
    if(currentRequest == nullptr) return;
    
    if(WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        String url = String(SERVER_URL) + "/api/devices/register";
        http.begin(url);
        http.addHeader("Content-Type", "application/json");
        
        DynamicJsonDocument doc(1024);
        doc["username"] = currentRequest->username;
        doc["password"] = currentRequest->password;
        if(currentRequest->mode == "signup") {
             doc["confirmPassword"] = currentRequest->confirmPassword;
        }
        doc["name"] = currentRequest->deviceName;
        doc["mode"] = currentRequest->mode;
        doc["irk"] = irk;
        
        String json;
        serializeJson(doc, json);
        
        int code = http.POST(json);
        Serial.printf("Upload Result: %d\n", code);
        
        if(code == 200) {
            currentRequest->status = "success";
        } else {
            currentRequest->status = "failed";
            // Map common HTTP codes to Korean
            if(code == 401) currentRequest->errorMsg = "비밀번호가 틀렸습니다. 다시 확인해주세요.";
            else if(code == 404) currentRequest->errorMsg = "사용자를 찾을 수 없습니다. 아이디를 확인해주세요.";
            else if(code == 409) currentRequest->errorMsg = "이미 존재하는 사용자입니다. 다른 아이디를 써보세요.";
            else currentRequest->errorMsg = "서버 오류 (" + String(code) + "). 관리자에게 문의하세요.";
        }
        http.end();
    } else {
        currentRequest->status = "failed";
        currentRequest->errorMsg = "인터넷 연결 끊김. 관리자에게 문의하세요.";
    }
}

void setup() {
  Serial.begin(115200);
  delay(1000); 

  // 1. WiFiManager Setup
  WiFiManager wm;
  bool res = wm.autoConnect("HonNol_Kiosk_Setup", "12346789"); 

  if(!res) {
      Serial.println("Failed to connect");
      // ESP.restart(); 
  } 
  else {
      Serial.println("Connected to Internet!");
      Serial.println(WiFi.localIP());
  }

  // mDNS Setup
  if (MDNS.begin("honnol")) {
    Serial.println("MDNS started: http://honnol.local");
  }

  // 2. Start Captive Portal AP
  WiFi.mode(WIFI_AP_STA);
  IPAddress apIP(192, 168, 4, 1);
  IPAddress netMsk(255, 255, 255, 0);
  WiFi.softAPConfig(apIP, apIP, netMsk); // Force standard IP
  WiFi.softAP(AP_SSID, AP_PASSWORD);
  delay(100); // Give it a moment to start
  
  dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
  dnsServer.start(DNS_PORT, "*", apIP);

  // 3. Web Server
  server.on("/", []() {
      server.send(200, "text/html", index_html);
  });
  
  // API: Add to Queue
  server.on("/api/queue_add", []() {
      if(server.hasArg("u") && server.hasArg("p") && server.hasArg("d") && server.hasArg("m")) {
          RegRequest req;
          req.username = server.arg("u");
          req.password = server.arg("p");
          req.deviceName = server.arg("d");
          req.mode = server.arg("m");
          if(server.hasArg("cp")) req.confirmPassword = server.arg("cp");
          else req.confirmPassword = "";
          req.status = "waiting";
          req.timestamp = millis();
          req.errorMsg = "";
          
          // Check for duplicate
          for(const auto& r : requestQueue) {
              if(r.username == req.username && (r.status == "waiting" || r.status == "processing" || r.status == "uploading")) {
                  server.send(409, "application/json", "{\"success\":false, \"error\":\"이미 대기열에 있습니다! 잠시만 기다려주세요.\"}");
                  // If already in queue, just say success so client resumes monitoring
                  server.send(200, "application/json", "{\"success\":true, \"msg\":\"이미 대기열에 있습니다! 잠시만 기다려주세요.\"}");
                  return;
              }
          }
          if(currentRequest != nullptr && currentRequest->username == req.username && (currentRequest->status == "processing" || currentRequest->status == "uploading")) {
              server.send(200, "application/json", "{\"success\":true, \"msg\":\"이미 처리 중입니다! 기기 연결을 시도해주세요.\"}");
              return;
          }

          if(requestQueue.size() >= MAX_QUEUE_SIZE) {
              server.send(503, "application/json", "{\"success\":false, \"error\":\"대기열이 꽉 찼습니다. 30초 후 다시 시도해주세요.\"}");
              return;
          }

          requestQueue.push_back(req);
          Serial.println("Added to queue: " + req.username);
          server.send(200, "application/json", "{\"success\":true}");
      } else {
          server.send(400, "application/json", "{\"success\":false, \"error\":\"정보가 부족합니다! 빈칸을 모두 채워주세요.\"}");
      }
  });

  // API: Check Status
  server.on("/api/queue_status", []() {
      if(!server.hasArg("u")) { server.send(400, "application/json", "{\"error\":\"사용자 정보가 없습니다.\"}"); return; }
      String u = server.arg("u");
      
      if(currentRequest != nullptr && currentRequest->username == u) {
          String json = "{\"status\":\"" + currentRequest->status + "\", \"msg\":\"" + currentRequest->errorMsg + "\"}";
          server.send(200, "application/json", json);
          return;
      }
      
      int pos = 0;
      bool found = false;
      for(const auto& r : requestQueue) {
          pos++;
          if(r.username == u) {
              found = true;
              break;
          }
      }
      
      if(found) {
          String currentUser = (currentRequest != nullptr) ? currentRequest->username : "없음";
          String json = "{\"status\":\"waiting\", \"position\":" + String(pos) + ", \"total\":" + String(requestQueue.size()) + ", \"current_user\":\"" + currentUser + "\"}";
          server.send(200, "application/json", json);
      } else {
          // Check if it was the recently finished job
          if(lastFinishedJob.username == u && (millis() - lastFinishedJob.finishTime < 60000)) {
               // Return the buffered result
               String json = "{";
               json += "\"status\":\"" + lastFinishedJob.status + "\",";
               if(lastFinishedJob.status == "failed") {
                   json += "\"msg\":\"" + lastFinishedJob.errorMsg + "\"";
               } else {
                   json += "\"msg\":\"Success\"";
               }
               json += "}";
               server.send(200, "application/json", json);
          } else {
              server.send(200, "application/json", "{\"error\":\"대기열에서 찾을 수 없거나 이미 종료되었습니다.\"}");
          }
      }
  });
  
  // Explicit Redirects for Captive Detection (Android/iOS)
  // These URLs are used by phones to check for "Internet". We redirect them to our portal.
  // Explicit Redirects for Captive Detection (Android/iOS)
  
  // 1. Redirect to Portal (for Catch-all / Browsing)
  auto handleRedirect = []() {
      server.sendHeader("Location", String("http://") + WiFi.softAPIP().toString(), true);
      server.send(302, "text/plain", "");
  };

  // 2. Serve Portal Directly (for iOS/Windows specific checks)
  auto servePortal = []() {
      server.send(200, "text/html", index_html);
  };

  // Android: Redirect is often more reliable to trigger the "Sign In" popup
  server.on("/generate_204", handleRedirect); 
  server.on("/gen_204", handleRedirect);
  
  // iOS/Windows: Serve directly
  server.on("/hotspot-detect.html", servePortal); // iOS
  server.on("/canonical.html", servePortal);
  server.on("/ncsi.txt", servePortal); // Windows
  server.on("/connecttest.txt", servePortal); // MS

  // Catch-all (302 Method)
  server.onNotFound(handleRedirect);
  
  server.begin();

  // 4. BLE Setup (HID Mode)
  BLEDevice::init("HonNol");
  BLEDevice::setEncryptionLevel(ESP_BLE_SEC_ENCRYPT);
  BLEDevice::setSecurityCallbacks(new MySecurity());
  
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  
  /* HID Setup: Emulate Keyboard to appear in Settings */
  BLEHIDDevice* hid = new BLEHIDDevice(pServer);
  hid->manufacturer()->setValue("HonNol_Corp");
  hid->pnp(0x02, 0xe502, 0xa111, 0x0210);
  hid->hidInfo(0x00, 0x01);
  hid->startServices();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->setAppearance(HID_KEYBOARD);
  pAdvertising->addServiceUUID(hid->hidService()->getUUID());
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);

  pSecurity = new BLESecurity();
  pSecurity->setAuthenticationMode(ESP_LE_AUTH_REQ_SC_BOND); 
  pSecurity->setCapability(ESP_IO_CAP_NONE);
  pSecurity->setInitEncryptionKey(ESP_BLE_ENC_KEY_MASK | ESP_BLE_ID_KEY_MASK);
}

void processQueue() {
    // If we are free and queue has items
    if(currentRequest == nullptr && !requestQueue.empty()) {
        // Take the first request from the queue
        currentRequest = &requestQueue.front(); // currentRequest now points to the first element
        currentRequest->status = "processing";
        bondingInProgress = true;
        bondingStartTime = millis();
        
        // CLEAR ALL BONDS before starting!
        int dev_num = esp_ble_get_bond_device_num();
        esp_ble_bond_dev_t *dev_list = (esp_ble_bond_dev_t *)malloc(sizeof(esp_ble_bond_dev_t) * dev_num);
        esp_ble_get_bond_device_list(&dev_num, dev_list);
        for (int i = 0; i < dev_num; i++) {
            esp_ble_remove_bond_device(dev_list[i].bd_addr);
        }
        free(dev_list);
        Serial.println("Cleared " + String(dev_num) + " old bonds.");

        // Start Advertising for this user
        // We can't target specifically without whitelist, so we just open the gate
        BLEDevice::getAdvertising()->start();
        Serial.println("Started processing for: " + currentRequest->username);
    }
    
    // Timeout logic for current processing request
    if(currentRequest != nullptr && bondingInProgress) {
        if(millis() - bondingStartTime > BONDING_TIMEOUT) {
             currentRequest->status = "failed";
             currentRequest->errorMsg = "시간 초과 (30초)";
             if(currentConnId != 0xFFFF) pServer->disconnect(currentConnId);
             bondingInProgress = false; // Mark job finished
        }
        
        // If status is final (success/failed), Copy to buffer and remove from queue
        // We use a short delay (JOB_RETENTION_TIME) just to ensure state settles, then clear.
        if(currentRequest->status == "success" || currentRequest->status == "failed") {
            static unsigned long finishedTime = 0;
            if(finishedTime == 0) finishedTime = millis();
            
            if(millis() - finishedTime > JOB_RETENTION_TIME) {
                 // Copy to buffer
                 lastFinishedJob.username = currentRequest->username;
                 lastFinishedJob.status = currentRequest->status;
                 lastFinishedJob.errorMsg = currentRequest->errorMsg;
                 lastFinishedJob.finishTime = millis();
                 
                 requestQueue.erase(requestQueue.begin());
                 currentRequest = nullptr;
                 finishedTime = 0;
                 Serial.println("Job Moved to Buffer & Cleared. Queue size: " + String(requestQueue.size()));
            }
        }
    }
}

void loop() {
  dnsServer.processNextRequest();
  server.handleClient();
  
  processQueue();

  // 1. Handle Upload safely in Loop
  if(uploadNeeded) {
      uploadIrk(pendingIrk);
      uploadNeeded = false;
      pendingIrk = "";
      
      // Now schedule disconnect
      pendingDisconnect = true;
      disconnectTargetTime = millis() + 5000; // Wait 5s AFTER upload for user to read "Success"
  }

  // 2. Non-blocking disconnect logic
  if(pendingDisconnect && millis() > disconnectTargetTime) {
      if(currentConnId != 0xFFFF) {
          Serial.println("Disconnecting device via timer...");
          pServer->disconnect(currentConnId);
      }
      pendingDisconnect = false;
  }
  
  delay(1); // Reduce delay for faster DNS response
}

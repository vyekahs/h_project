
<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { browser } from '$app/environment';

    export let data: any;

    // --- 공통 상태 ---
    let error = '';
    let step = 'input'; // 'input' → 'pairing'/'web_bt_connecting' → 'pin_verify' → 'success' → 'wifi_register'

    // --- OS 감지 ---
    let isAndroid = false;
    let hasWebBluetooth = false;

    // --- WiFi 등록 ---
    let wifiError = '';

    function getDeviceName(): string {
        const ua = navigator.userAgent;
        if (/iPhone/i.test(ua)) return 'iPhone';
        if (/iPad/i.test(ua)) return 'iPad';
        // Android: 모델명 추출 시도 (예: "SM-G991B", "Pixel 7")
        const androidMatch = ua.match(/;\s*([^;)]+)\s*Build\//);
        if (androidMatch) return androidMatch[1].trim();
        if (/Android/i.test(ua)) return 'Android';
        return 'Phone';
    }

    onMount(async () => {
        isAndroid = /Android/i.test(navigator.userAgent);
        hasWebBluetooth = isAndroid && !!(navigator as any).bluetooth; // Android + Web Bluetooth API 사용 가능할 때만 (HTTPS 필요)

        // WiFi 등록 완료 후 리다이렉트 처리
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('wifi') === 'done') {
            // URL에서 파라미터 제거 (히스토리 교체)
            window.history.replaceState({}, '', window.location.pathname);
            step = 'wifi_success';
            return;
        }

        // 페이지 새로고침 시 진행 중인 등록 복원
        const savedRegId = sessionStorage.getItem('reg_regId');
        const savedPin = sessionStorage.getItem('reg_pin');
        const savedExpires = sessionStorage.getItem('reg_expiresAt');

        if (savedRegId) {
            // 서버에서 현재 상태 확인
            try {
                const res = await fetch(`/api/devices/register/status?regId=${savedRegId}`);
                const json = await res.json();

                if (json.step === 'completed') {
                    sessionStorage.removeItem('reg_regId');
                    sessionStorage.removeItem('reg_pin');
                    sessionStorage.removeItem('reg_expiresAt');
                    step = 'success';
                    return;
                }

                // 아직 진행 중이면 복원
                if (json.step === 'pending' || json.step === 'polling') {
                    regId = Number(savedRegId);
                    pin = savedPin || '';
                    if (savedExpires) expiresAt = new Date(savedExpires);
                    step = 'pairing';
                    startTimer();
                    startStatusPolling();
                    return;
                }
            } catch (e) {
                // 조회 실패 시 세션 정리
            }
            sessionStorage.removeItem('reg_regId');
            sessionStorage.removeItem('reg_pin');
            sessionStorage.removeItem('reg_expiresAt');
        }

        document.addEventListener('visibilitychange', handleVisibilityChange);
    });

    // ============================================
    // Android Web Bluetooth 플로우
    // ============================================
    let webBtStatus = '';

    async function startWebBluetoothFlow() {
        error = '';
        webBtStatus = '블루투스 기기를 검색합니다...';
        step = 'web_bt_connecting';

        let device: any = null;

        try {
            if (!(navigator as any).bluetooth) {
                error = 'HTTPS 환경에서만 블루투스를 사용할 수 있습니다. (https:// 주소로 접속해주세요)';
                step = 'input';
                return;
            }

            // 1. Web Bluetooth로 ESP32 선택 (사용자가 직접 선택 = 본인 확인)
            device = await (navigator as any).bluetooth.requestDevice({
                filters: [
                    { services: ['12345678-1234-5678-1234-56789abcdef0'] },
                    { name: 'HN_SETUP' }
                ],
                optionalServices: ['12345678-1234-5678-1234-56789abcdef0']
            });

            // GATT 연결 (ESP32 WiFi 스캔 중이면 실패할 수 있으므로 재시도)
            webBtStatus = '기기에 연결 중...';
            let server: any = null;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    server = await device.gatt!.connect();
                    break;
                } catch (connErr: any) {
                    console.warn(`GATT connect attempt ${attempt}/3 failed:`, connErr.message);
                    if (attempt === 3) throw connErr;
                    webBtStatus = `연결 재시도 중... (${attempt}/3)`;
                    await new Promise(r => setTimeout(r, 2000));
                }
            }

            webBtStatus = '기기등록 중...';
            const service = await server.getPrimaryService('12345678-1234-5678-1234-56789abcdef0');
            const characteristic = await service.getCharacteristic('12345678-1234-5678-1234-56789abcdef1');

            // 2. IRK 수신 (notification + polling 병행)
            let irk = '';

            // IRK를 notification + polling 병행으로 수신
            async function waitForIrk(char: any, timeoutMs: number): Promise<string> {
                return new Promise<string>((resolve) => {
                    let resolved = false;
                    let pollInterval: ReturnType<typeof setInterval>;

                    const cleanup = () => {
                        clearInterval(pollInterval);
                        try { char.removeEventListener('characteristicvaluechanged', onNotify); } catch {}
                        try { char.stopNotifications(); } catch {}
                    };

                    const done = (val: string) => {
                        if (resolved) return;
                        resolved = true;
                        clearTimeout(timer);
                        cleanup();
                        resolve(val);
                    };

                    // 타임아웃
                    const timer = setTimeout(() => done(''), timeoutMs);

                    // Notification 리스너
                    const onNotify = (event: any) => {
                        const decoder = new TextDecoder();
                        const val = decoder.decode(event.target.value);
                        console.log('IRK notification:', val);
                        if (val && val.length === 32 && val !== '00000000000000000000000000000000') {
                            done(val);
                        }
                    };

                    // Notification 구독 (비동기이지만 Promise 체인 불필요)
                    (async () => {
                        try {
                            char.addEventListener('characteristicvaluechanged', onNotify);
                            await char.startNotifications();
                            console.log('Notifications started');
                        } catch (e: any) {
                            console.warn('Notification setup failed, polling only:', e.message);
                        }
                    })();

                    // Polling 병행 (1.5초 간격, notification 실패 대비)
                    pollInterval = setInterval(async () => {
                        if (resolved) return;
                        try {
                            const value = await char.readValue();
                            const decoder = new TextDecoder();
                            const val = decoder.decode(value);
                            if (val && val.length === 32 && val !== '00000000000000000000000000000000') {
                                done(val);
                            }
                        } catch {}
                    }, 1500);
                });
            }

            webBtStatus = '기기등록 중... (IRK 대기)';
            irk = await waitForIrk(characteristic, 15000);

            // 첫 연결에서 못 받았으면 재연결 시도
            if (!irk) {
                webBtStatus = '재연결 중...';
                if (device.gatt?.connected) {
                    device.gatt.disconnect();
                }
                await new Promise(r => setTimeout(r, 2000));

                try {
                    const server2 = await device.gatt!.connect();
                    const service2 = await server2.getPrimaryService('12345678-1234-5678-1234-56789abcdef0');
                    const char2 = await service2.getCharacteristic('12345678-1234-5678-1234-56789abcdef1');

                    webBtStatus = '기기등록 중... (재연결 IRK 대기)';
                    irk = await waitForIrk(char2, 15000);
                } catch (reconErr: any) {
                    console.warn('Reconnect failed:', reconErr.message);
                }
            }

            // 연결 해제
            if (device?.gatt?.connected) {
                device.gatt.disconnect();
            }

            if (!irk) {
                error = '기기를 등록할 수 없습니다. 다시 시도해주세요.';
                step = 'input';
                return;
            }

            webBtStatus = '서버에 등록 중...';

            // 3. 서버에 직접 등록 (PIN 불필요)
            const attendeeId = data.user.id;
            const deviceName = getDeviceName();
            const res = await fetch('/api/devices/register/direct', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attendeeId, irk, deviceName })
            });

            const json = await res.json();
            if (json.success) {
                step = 'success';
            } else {
                error = json.error || '등록 실패';
                step = 'input';
            }

        } catch (e: any) {
            console.error('Web Bluetooth error:', e);
            if (e.name === 'NotFoundError') {
                error = '기기를 선택하지 않았습니다.';
            } else if (e.name === 'SecurityError') {
                error = 'HTTPS 환경에서만 블루투스를 사용할 수 있습니다.';
            } else {
                error = '블루투스 연결 실패: ' + (e.message || '알 수 없는 오류');
            }
            step = 'input';
        } finally {
            // 성공/실패 무관하게 BLE 연결 확실히 해제
            try {
                if (device?.gatt?.connected) {
                    device.gatt.disconnect();
                }
            } catch {}
        }
    }

    // ============================================
    // iOS 기존 플로우 (ESP32 → 서버 업로드 → PIN 검증)
    // ============================================
    let pin = '';
    let pinInput = '';
    let expiresAt: Date | null = null;
    let timerStr = '';
    let interval: any;
    let regId: number | null = null;
    let statusInterval: any;
    let pinError = '';

    async function startRegistration() {
        error = '';
        try {
            const attendeeId = data.user.id;
            const deviceName = getDeviceName();
            const res = await fetch('/api/devices/register/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId: 'ALL', attendeeId, deviceName })
            });
            const json = await res.json();
            if (res.ok) {
                pin = json.pin;
                expiresAt = new Date(json.expiresAt);
                regId = json.regId;
                step = 'pairing';

                // 새로고침 복원용 저장
                sessionStorage.setItem('reg_regId', String(regId));
                sessionStorage.setItem('reg_pin', pin);
                sessionStorage.setItem('reg_expiresAt', expiresAt.toISOString());

                startTimer();
                startStatusPolling();
            } else {
                error = json.error || '등록 시작 실패';
            }
        } catch (e) {
            error = '서버 오류';
        }
    }

    function startTimer() {
        if (interval) clearInterval(interval);
        interval = setInterval(() => {
            if (!expiresAt) return;
            const now = new Date();
            const diff = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);
            if (diff <= 0) {
                timerStr = '만료됨';
                stopIntervals();
                sessionStorage.removeItem('reg_regId');
                sessionStorage.removeItem('reg_pin');
                sessionStorage.removeItem('reg_expiresAt');
                step = 'input';
                alert('시간이 만료되었습니다. 다시 시도해주세요.');
            } else {
                timerStr = `${diff}초`;
            }
        }, 1000);
    }

    function startStatusPolling() {
        if (statusInterval) clearInterval(statusInterval);
        statusInterval = setInterval(async () => {
            if (!regId) return;
            try {
                const res = await fetch(`/api/devices/register/status?regId=${regId}`);
                const json = await res.json();
                if (json.step === 'completed') {
                    stopIntervals();
                    sessionStorage.removeItem('reg_regId');
                    sessionStorage.removeItem('reg_pin');
                    sessionStorage.removeItem('reg_expiresAt');
                    step = 'success';
                }
            } catch (e) {
                console.error('Status poll error:', e);
            }
        }, 2000);
    }

    async function verifyPin() {
        pinError = '';
        if (!pinInput || pinInput.length !== 4) {
            pinError = '4자리 PIN을 입력해주세요';
            return;
        }
        try {
            const res = await fetch('/api/devices/register/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ regId, pin: pinInput })
            });
            const json = await res.json();
            if (json.success) {
                stopIntervals();
                step = 'success';
            } else {
                pinError = json.error || 'PIN이 일치하지 않습니다';
            }
        } catch (e) {
            pinError = '서버 오류';
        }
    }

    function stopIntervals() {
        if (interval) clearInterval(interval);
        if (statusInterval) clearInterval(statusInterval);
    }

    // iOS Safari: 블루투스 설정에서 돌아올 때 즉시 상태 확인
    // (백그라운드에서 setInterval이 일시정지되므로 visibilitychange로 보완)
    function handleVisibilityChange() {
        if (document.visibilityState === 'visible' && regId && step === 'pairing') {
            fetch(`/api/devices/register/status?regId=${regId}`)
                .then(res => res.json())
                .then(json => {
                    if (json.step === 'completed') {
                        stopIntervals();
                        sessionStorage.removeItem('reg_regId');
                        sessionStorage.removeItem('reg_pin');
                        sessionStorage.removeItem('reg_expiresAt');
                        step = 'success';
                    }
                })
                .catch(() => {});
        }
    }

    // ============================================
    // WiFi MAC 등록 플로우
    // ============================================
    async function startWifiRegistration() {
        wifiError = '';

        try {
            // 1. 서버에서 ESP32 IP 조회
            const ipRes = await fetch('/api/esp32/ip?scanner_id=esp32_s3_registration');
            const ipData = await ipRes.json();
            if (!ipRes.ok || !ipData.ip) {
                wifiError = 'ESP32 기기를 찾을 수 없습니다. 기기가 켜져 있는지 확인해주세요.';
                return;
            }
            const esp32Url = `http://${ipData.ip}`;

            // 2. 서버에서 일회용 코드 발급
            const attendeeId = data.user.id;
            const codeRes = await fetch('/api/wifi/code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attendeeId })
            });

            const codeData = await codeRes.json();
            if (!codeData.success || !codeData.code) {
                wifiError = '코드 발급 실패: ' + (codeData.error || '서버 오류');
                return;
            }

            // 3. ESP32 로컬 HTTP 서버의 등록 페이지로 이동
            const callbackUrl = encodeURIComponent(window.location.origin);
            window.location.href = `${esp32Url}/register?code=${codeData.code}&callback=${callbackUrl}`;

        } catch (e: any) {
            wifiError = 'WiFi 등록 실패: ' + (e.message || '네트워크 오류');
        }
    }

    onDestroy(() => {
        stopIntervals();
        if (browser) {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        }
    });
</script>

<div class="container">
    <h1>기기 등록</h1>

    {#if step === 'input'}
        <!-- 블루투스 등록 (권장) -->
        <div class="card recommended">
            <div class="badge">권장</div>
            {#if isAndroid && hasWebBluetooth}
                <p><strong>블루투스 등록</strong></p>
                <p class="desc">가장 정확한 출석 체크 방식입니다. 자동으로 기기를 인식합니다.</p>
                <div class="instructions">
                    <p>1. 아래 <strong>블루투스 등록</strong> 버튼을 누르세요</p>
                    <p>2. 팝업에서 <strong>"HN_SETUP"</strong>을 선택하세요</p>
                    <p>3. 페어링 요청을 수락하면 자동 등록됩니다</p>
                </div>
                {#if error}
                    <p class="error">{error}</p>
                {/if}
                <button on:click={startWebBluetoothFlow}>블루투스 등록</button>
            {:else}
                <p><strong>블루투스 등록</strong></p>
                <p class="desc">가장 정확한 출석 체크 방식입니다. 자동으로 기기를 인식합니다.</p>
                <div class="instructions">
                    <p>1. 아래 <strong>블루투스 등록</strong> 버튼을 누르세요</p>
                    <p>2. 블루투스 설정에서 <strong>"HN_SETUP"</strong>을 연결하세요</p>
                    <p>3. 화면에 표시된 PIN을 입력하면 등록 완료!</p>
                </div>
                {#if error}
                    <p class="error">{error}</p>
                {/if}
                <button on:click={startRegistration}>블루투스 등록</button>
            {/if}
        </div>

        <!-- WiFi 등록 (보조) -->
        <div class="card alt">
            <p><strong>WiFi 등록</strong></p>
            <p class="desc">블루투스가 안 될 경우 WiFi로도 등록할 수 있습니다.</p>
            {#if wifiError}
                <p class="error">{wifiError}</p>
            {/if}
            <button class="btn-alt" on:click={startWifiRegistration}>WiFi로 등록</button>
        </div>

    {:else if step === 'web_bt_connecting'}
        <!-- Android Web Bluetooth 진행 중 -->
        <div class="card active">
            <h2>연결 중...</h2>
            <div class="pairing-animation">
                <div class="dot-pulse"></div>
            </div>
            <p class="status-text">{webBtStatus}</p>
            <p class="desc">잠시만 기다려주세요.</p>
        </div>

    {:else if step === 'pairing'}
        <!-- iOS 기존 플로우: 블루투스 설정에서 연결 대기 -->
        <div class="card active">
            <h2>블루투스 연결 대기 중...</h2>
            <p>블루투스 설정에서 <strong>"HN_SETUP"</strong> 기기를 연결하세요.</p>
            <div class="pin-display">
                <p class="pin-label">페어링 시 아래 PIN을 입력하세요</p>
                <div class="pin-code">{pin}</div>
            </div>
            <div class="pairing-animation">
                <div class="dot-pulse"></div>
            </div>
            <div class="timer">남은 시간: {timerStr}</div>
            <button on:click={() => { stopIntervals(); step = 'input'; }}>취소</button>
        </div>

    {:else if step === 'pin_verify'}
        <!-- iOS 기존 플로우: PIN 입력 -->
        <div class="card verify">
            <h2>PIN 확인</h2>
            <p>등록을 완료하려면 아래에 PIN을 입력하세요.</p>
            <div class="pin-input-area">
                <input
                    type="tel"
                    maxlength="4"
                    placeholder="4자리 PIN"
                    bind:value={pinInput}
                    on:keydown={(e) => e.key === 'Enter' && verifyPin()}
                />
            </div>
            {#if pinError}
                <p class="error">{pinError}</p>
            {/if}
            <div class="timer">남은 시간: {timerStr}</div>
            <button on:click={verifyPin}>확인</button>
        </div>

    {:else if step === 'wifi_success'}
        <div class="card success">
            <div class="success-icon">✅</div>
            <h2>WiFi 등록 완료!</h2>
            <p>WiFi 기기가 성공적으로 등록되었습니다.</p>
            <button class="btn-primary" on:click={() => window.location.href = '/'}>홈으로 가기</button>
        </div>

    {:else }
        <div class="card success">
            <div class="success-icon">✅</div>
            <h2>블루투스 등록 성공!</h2>
            <p>기기가 성공적으로 등록되었습니다.</p>
            <button class="btn-primary" on:click={() => window.location.href = '/'}>홈으로 가기</button>
        </div>
    {/if}
</div>

<style>
    .container { max-width: 400px; margin: 0 auto; padding: 20px; text-align: center; }
    .card { background: var(--bg-primary); padding: 30px; border-radius: 16px; box-shadow: 0 4px 20px var(--shadow-sm); margin-bottom: 16px; }
    .card.recommended { border: 2px solid var(--color-blue-bright); position: relative; }
    .card.alt { border: 1px solid var(--border-default); padding: 20px; }
    .card.active { border: 2px solid var(--color-blue-bright); background: var(--color-info-bg); }
    .card.success { border: 2px solid var(--color-green); background: var(--color-success-bg); }
    .card.verify { border: 2px solid var(--color-blue-bright); background: var(--color-info-bg); }
    .badge { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: var(--color-blue-bright); color: var(--bg-primary); padding: 4px 16px; border-radius: 20px; font-size: 0.8em; font-weight: bold; }
    .success-icon { font-size: 4em; margin-bottom: 20px; }
    input { width: 80%; padding: 14px; font-size: 2em; text-align: center; margin: 15px auto; border: 2px solid var(--color-blue-bright); border-radius: 12px; letter-spacing: 8px; font-family: monospace; }
    button { width: 100%; padding: 12px; background: var(--color-blue-bright); color: var(--bg-primary); border: none; border-radius: 8px; font-size: 1.1em; font-weight: bold; cursor: pointer; transition: background 0.2s; }
    button:hover { background: var(--color-blue-bright); }
    .btn-primary { background: var(--color-green); }
    .btn-primary:hover { background: var(--color-green-dark); }
    .btn-alt { background: var(--text-secondary); }
    .btn-alt:hover { background: var(--color-slate-dark); }
    .error { color: var(--color-red); margin: 10px 0; font-weight: bold; }
    .desc { color: var(--text-secondary); margin-bottom: 20px; font-size: 0.9em; }
    .timer { font-size: 1.2em; color: var(--color-red); font-weight: bold; margin-bottom: 20px; }
    .instructions { text-align: left; background: var(--color-info-bg); padding: 15px; border-radius: 8px; margin: 20px 0; }
    .instructions p { margin: 8px 0; font-size: 0.95em; }
    .pin-input-area { margin: 20px 0; }
    .pairing-animation { display: flex; justify-content: center; margin: 30px 0; }
    .dot-pulse { width: 12px; height: 12px; border-radius: 50%; background: var(--color-blue-bright); animation: pulse 1.5s infinite ease-in-out; }
    @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(2); opacity: 0.4; } }
    .status-text { color: var(--color-blue-bright); font-weight: 600; font-size: 1em; margin: 15px 0; }
    .pin-display { margin: 20px 0; padding: 20px; background: var(--bg-primary); border-radius: 12px; border: 2px dashed var(--color-blue-bright); }
    .pin-label { color: var(--text-secondary); font-size: 0.9em; margin-bottom: 10px; }
    .pin-code { font-size: 2.5em; font-weight: bold; letter-spacing: 12px; color: var(--color-blue-bright); font-family: monospace; }
</style>

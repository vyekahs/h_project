
<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    
    // We get 'user' from page data (assuming layout provides it or we fetch it)
    // For now, let's just use a simple store or fetch user/me if needed.
    // Assuming root layout sets some user context.
    
    export let data; // PageServerLoad might provide user info
    
    let deviceId = '';
    let pin = '';
    let expiresAt: Date | null = null;
    let timerStr = '';
    let interval: any;
    let error = '';
    let step = 'input'; // 'input', 'timer', 'success'
    let regId: number | null = null;
    let statusInterval: any;

    async function startRegistration() {
        error = '';
        
        try {
            const attendeeId = data.user?.id || 1; 

            const res = await fetch('/api/devices/register/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId: 'ALL', attendeeId }) // Use 'ALL' for single device
            });

            const json = await res.json();
            if (res.ok) {
                pin = json.pin;
                expiresAt = new Date(json.expiresAt);
                regId = json.regId; // Capture regId
                step = 'timer';
                startTimer();
                startStatusPolling(); // Start polling for completion
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
                    step = 'success';
                }
            } catch (e) {
                console.error('Status poll error:', e);
            }
        }, 2000);
    }

    function stopIntervals() {
        if (interval) clearInterval(interval);
        if (statusInterval) clearInterval(statusInterval);
    }

    onDestroy(() => {
        stopIntervals();
    });
</script>

<div class="container">
    <h1>기기 등록</h1>
    
    {#if step === 'input'}
        <div class="card">
            <p><strong>블루투스 페어링</strong></p>
            <p class="desc">1분 안에 페어링을 완료해주세요.</p>
            {#if pin}
                <div class="pin-display">
                    <p class="pin-label">비밀번호 (PIN)</p>
                    <p class="pin-value">{pin}</p>
                </div>
            {/if}
            <div class="instructions">
                <p>📱 <strong>블루투스 설정</strong>에서</p>
                <p><strong>"HonNol"</strong> 기기를 찾아 연결하세요</p>
                <p>비밀번호를 물어보면 위 번호를 입력하세요</p>
            </div>
            {#if error}
                <p class="error">{error}</p>
            {/if}

            <button on:click={startRegistration}>등록 시작</button>
        </div>
    {:else if step === 'timer'}
        <div class="card active">
            <h2>기기 설정 변경 중...</h2>
            <p>블루투스 설정에서 <strong>"HonNol"</strong> 기기를 선택하고 아래 PIN을 입력하세요.</p>
            
            <div class="pin-box">{pin}</div>
            <div class="timer">남은 시간: {timerStr}</div>
            
            <button on:click={() => { stopIntervals(); step = 'input'; }}>취소 / 다시하기</button>
        </div>
    {:else if step === 'success'}
        <div class="card success">
            <div class="success-icon">✅</div>
            <h2>등록 성공!</h2>
            <p>기기가 성공적으로 등록되었습니다.</p>
            <p class="desc">이제 서비스를 이용하실 수 있습니다.</p>
            <button class="btn-primary" on:click={() => window.location.href = '/'}>홈으로 가기</button>
        </div>
    {/if}
</div>

<style>
    .container { max-width: 400px; margin: 0 auto; padding: 20px; text-align: center; }
    .card { background: #fff; padding: 30px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .card.success { border: 2px solid #28a745; background: #f8fff9; }
    .success-icon { font-size: 4em; margin-bottom: 20px; }
    input { width: 100%; padding: 10px; font-size: 1.2em; text-align: center; margin: 10px 0; }
    button { width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 8px; font-size: 1.1em; font-weight: bold; cursor: pointer; transition: background 0.2s; }
    button:hover { background: #0056b3; }
    .btn-primary { background: #28a745; }
    .btn-primary:hover { background: #218838; }
    .error { color: #dc3545; margin: 10px 0; font-weight: bold; }
    .desc { color: #666; margin-bottom: 20px; font-size: 0.9em; }
    .pin-box { font-size: 3.5em; font-weight: bold; letter-spacing: 8px; margin: 20px 0; color: #333; font-family: monospace; }
    .timer { font-size: 1.2em; color: #ff4d4f; font-weight: bold; margin-bottom: 20px; }
    .instructions { text-align: left; background: #f0f7ff; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .instructions p { margin: 5px 0; font-size: 0.95em; }
</style>

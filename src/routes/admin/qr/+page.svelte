<script lang="ts">
    import { invalidateAll } from '$app/navigation';

    export let data;
</script>

<div class="qr-container">
    <div class="header">
        <a href="/admin" class="back-link">← 관리자 대시보드</a>
        <h1>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
            QR 체크인
        </h1>
    </div>

    <div class="qr-card">
        <div class="qr-wrapper">
            {#if data.qrCode}
                <img src={data.qrCode} alt="Check-in QR Code" />
            {:else}
                <p>QR 코드를 생성 중입니다...</p>
            {/if}
        </div>
        


        <div class="instructions">
            <p>1. 카메라 앱을 켜세요.</p>
            <p>2. 위 QR 코드를 스캔하세요.</p>
            <p>3. 자동으로 입장이 완료됩니다!</p>
        </div>
    </div>
</div>

<style>
    .qr-container {
        max-width: 600px;
        margin: 0 auto;
        padding: 2rem;
        text-align: center;
        min-height: 100vh;
        background: #f0f2f5;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }
    .header {
        margin-bottom: 2rem;
        width: 100%;
        text-align: left;
    }
    .back-link {
        text-decoration: none;
        color: #666;
        font-size: 0.9rem;
        display: inline-block;
        margin-bottom: 1rem;
    }
    h1 {
        margin: 0;
        color: #333;
        text-align: center;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
    }
    .qr-card {
        background: white;
        padding: 3rem;
        border-radius: 20px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        width: 100%;
        max-width: 400px;
    }
    .qr-wrapper {
        margin-bottom: 2rem;
    }
    .qr-wrapper img {
        width: 100%;
        max-width: 300px;
        height: auto;
        display: block;
        margin: 0 auto;
    }
    .timer {
        margin-bottom: 2rem;
    }
    .timer p {
        color: #666;
        font-size: 0.9rem;
        margin: 0;
    }
    .instructions {
        text-align: left;
        background: #f8f9fa;
        padding: 1.5rem;
        border-radius: 12px;
    }
    .instructions p {
        margin: 0.5rem 0;
        color: #555;
        font-size: 1rem;
    }
</style>

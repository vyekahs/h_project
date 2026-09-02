<script lang="ts">
    import { invalidateAll } from '$app/navigation';

    let { data }: { data: any } = $props();
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
                <p class="qr-loading">QR 코드를 생성 중입니다…</p>
            {/if}
        </div>
        


        <ol class="instructions">
            <li>휴대폰 카메라로 위 QR을 찍으세요.</li>
            <li>Chrome으로 자동으로 넘어갑니다.</li>
            <li>처음이면 회원가입, 이미 계정이 있으면 로그인하세요.</li>
            <li>확인을 누르면 입장 처리됩니다.</li>
        </ol>
        <p class="qr-note">이 QR은 고정입니다. 출력해서 붙여두고 계속 쓸 수 있습니다.</p>
    </div>
</div>

<style>
    .qr-container {
        max-width: 600px;
        margin: 0 auto;
        padding: 2rem;
        text-align: center;
        min-height: 100vh;
        background: var(--bg-surface, #f5f5f5);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, sans-serif);
        color: var(--text-primary, #333);
    }
    .header {
        margin-bottom: 2rem;
        width: 100%;
        text-align: left;
    }
    .back-link {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        text-decoration: none;
        color: var(--text-secondary, #666);
        font-size: var(--text-sm, 0.875rem);
        margin-bottom: 1rem;
    }
    h1 {
        margin: 0;
        font-size: var(--text-xl, 1.5rem);
        text-align: center;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
    }
    .qr-card {
        background: var(--bg-primary, #fff);
        padding: 2.5rem;
        border-radius: var(--radius-card, 12px);
        border: 1px solid var(--border-default, #ddd);
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
    .qr-loading {
        color: var(--text-secondary, #666);
        font-size: var(--text-sm, 0.875rem);
    }
    .instructions {
        text-align: left;
        background: var(--bg-secondary, #f8f9fa);
        padding: 1.25rem 1.25rem 1.25rem 2.25rem;
        border-radius: var(--radius-control, 6px);
        margin: 0;
    }
    .instructions li {
        margin: 0.4rem 0;
        color: var(--text-dark, #495057);
        font-size: var(--text-sm, 0.875rem);
        line-height: 1.5;
    }
    .qr-note {
        margin: 0.75rem 0 0;
        font-size: var(--text-xs, 0.75rem);
        color: var(--text-secondary, #666);
    }
</style>
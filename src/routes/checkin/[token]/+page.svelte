<script lang="ts">
    import { enhance } from '$app/forms';

    let { data, form } = $props();
    let loading = $state(false);

    const phase = $derived.by(() => {
        if (form?.success) return 'success';
        if (form && !form.success) return 'error';
        return data.phase;
    });

    const errorMessage = $derived(form?.error ?? (data.phase === 'error' ? data.error : ''));
    const displayName = $derived(form?.userName ?? (data.phase === 'confirm' ? data.userName : ''));
</script>

<div class="checkin-container">
    <div class="card">
        {#if phase === 'confirm'}
            <div class="icon confirm">👋</div>
            <h1>입장 확인</h1>
            <p class="message"><strong>{displayName}</strong>님,<br>입장하시겠습니까?</p>
            <form method="POST" action="?/checkin" use:enhance={() => {
                loading = true;
                return async ({ update }) => {
                    loading = false;
                    await update();
                };
            }}>
                <button type="submit" class="btn-checkin" disabled={loading}>
                    {loading ? '처리 중...' : '입장하기'}
                </button>
            </form>
            <a href="/" class="btn-fallback">메인으로 이동</a>
        {:else if phase === 'success'}
            <div class="icon success">✅</div>
            <h1>입장 완료!</h1>
            <p class="message">환영합니다, <strong>{displayName}</strong>님!</p>
            <p class="sub-message">즐거운 보드게임 시간 되세요.</p>
            <a href="/" class="btn-home">메인으로 이동</a>
        {:else}
            <div class="icon error">❌</div>
            <h1>체크인 실패</h1>
            <p class="message">{errorMessage}</p>
            <a href="/" class="btn-home">메인으로 이동</a>
        {/if}
    </div>
</div>

<style>
    .checkin-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background: #f0f2f5;
        font-family: sans-serif;
        padding: 1rem;
    }
    .card {
        background: white;
        padding: 3rem 2rem;
        border-radius: 20px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        text-align: center;
        width: 100%;
        max-width: 360px;
    }
    .icon {
        font-size: 4rem;
        margin-bottom: 1.5rem;
    }
    h1 {
        margin: 0 0 1rem 0;
        color: #333;
    }
    .message {
        font-size: 1.2rem;
        color: #555;
        margin-bottom: 0.5rem;
        line-height: 1.6;
    }
    .sub-message {
        color: #888;
        margin-bottom: 2rem;
    }
    .btn-checkin {
        display: block;
        width: 100%;
        padding: 0.85rem;
        background: #22c55e;
        color: white;
        border: none;
        border-radius: 12px;
        font-size: 1.1rem;
        font-weight: 700;
        cursor: pointer;
        margin-top: 1.5rem;
        transition: background 0.2s;
    }
    .btn-checkin:hover {
        background: #16a34a;
    }
    .btn-checkin:disabled {
        background: #9ca3af;
        cursor: not-allowed;
    }
    .btn-fallback {
        display: block;
        color: #888;
        text-decoration: none;
        font-size: 0.9rem;
        padding: 0.75rem;
        margin-top: 0.5rem;
    }
    .btn-fallback:hover {
        color: #333;
    }
    .btn-home {
        display: inline-block;
        padding: 0.75rem 2rem;
        background: #007bff;
        color: white;
        text-decoration: none;
        border-radius: 25px;
        font-weight: bold;
        transition: background 0.2s;
    }
    .btn-home:hover {
        background: #0056b3;
    }
</style>

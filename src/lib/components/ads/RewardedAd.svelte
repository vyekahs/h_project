<script lang="ts">
    import { onDestroy } from 'svelte';

    let { onReward } = $props<{ onReward: () => void }>();

    let isWatching = $state(false);
    let error: string | null = $state(null);
    let timeLeft = $state(30);
    let intervalId: ReturnType<typeof setInterval> | null = null;

    function clearTimer() {
        if (intervalId !== null) {
            clearInterval(intervalId);
            intervalId = null;
        }
    }

    function watchAd() {
        isWatching = true;
        timeLeft = 5;
        clearTimer();

        intervalId = setInterval(() => {
            if (timeLeft > 0) {
                timeLeft--;
            } else {
                clearTimer();
                completeAd();
            }
        }, 1000);
    }

    async function completeAd() {
        isWatching = false;
        onReward();
    }

    function closeAd() {
        if (timeLeft > 0) {
            if (!confirm('광고 시청을 중단하시겠습니까? 보상을 받을 수 없습니다.')) return;
        }
        clearTimer();
        isWatching = false;
    }

    onDestroy(clearTimer);
</script>

<button class="btn-ad-trigger" onclick={watchAd}>
    <span>📺</span>
    <div class="text">
        <span class="title">광고 보고 보너스</span>
        <span class="reward">+20 P</span>
    </div>
</button>

{#if isWatching}
    <div class="ad-overlay">
        <div class="ad-content">
            <div class="ad-header">
                <span>Sponsored Video</span>
                <span class="timer">남은 시간: {timeLeft}초</span>
            </div>
            <div class="ad-video-mock">
                ▶️ Video Playing...
            </div>
            <div class="ad-footer">
                <button class="btn-close" onclick={closeAd}>닫기</button>
            </div>
        </div>
    </div>
{/if}

<style>
    .btn-ad-trigger {
        display: flex;
        align-items: center;
        gap: 0.8rem;
        background: linear-gradient(135deg, #6200ea, #3700b3);
        color: var(--bg-primary);
        border: none;
        padding: 0.8rem 1.5rem;
        border-radius: 12px;
        cursor: pointer;
        width: 100%;
        max-width: 300px;
        transition: transform 0.2s;
        box-shadow: 0 4px 12px rgba(98, 0, 234, 0.3);
    }
    
    .btn-ad-trigger:hover {
        transform: translateY(-2px);
    }
    
    .btn-ad-trigger span {
        font-size: 1.5rem;
    }
    
    .text {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
    }
    
    .text .title {
        font-size: 0.9rem;
        font-weight: 500;
        opacity: 0.9;
    }
    
    .text .reward {
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--color-amber);
    }
    
    .ad-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: var(--bg-dark);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .ad-content {
        width: 100%;
        max-width: 400px;
        height: 100%;
        max-height: 80vh;
        background: #111;
        display: flex;
        flex-direction: column;
        color: var(--bg-primary);
    }
    
    .ad-header {
        padding: 1rem;
        display: flex;
        justify-content: space-between;
        font-size: 0.9rem;
        background: rgba(255,255,255,0.1);
    }
    
    .ad-video-mock {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5rem;
        background: #222;
    }
    
    .ad-footer {
        padding: 1rem;
        display: flex;
        justify-content: flex-end;
    }
    
    .btn-close {
        background: transparent;
        border: 1px solid rgba(255,255,255,0.3);
        color: var(--bg-primary);
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
    }
</style>

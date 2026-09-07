<script lang="ts">
    import RewardedAd from '$lib/components/ads/RewardedAd.svelte';

    interface Props {
        isWon: boolean;
        title?: string;
        message?: string;
        stats: Array<{ label: string; value: string; highlight?: boolean }>;
        showAd?: boolean;
        onAdReward?: () => void;
        primaryAction: { label: string; onclick: () => void };
        secondaryAction: { label: string; onclick: () => void };
        newTitleName?: string | null;
        showVisitPrompt?: boolean;
    }

    const {
        isWon,
        title,
        message,
        stats,
        showAd = false,
        onAdReward,
        primaryAction,
        secondaryAction,
        newTitleName = null,
        showVisitPrompt = false,
    }: Props = $props();
</script>

<div class="overlay backdrop-blur">
    <div class="result-card {isWon ? 'win' : 'lose'}">
        <div class="result-icon-container">
            {#if isWon}
                <div class="result-icon win-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
                    </svg>
                    <div class="particles">
                        <span>✨</span><span>🎉</span><span>⭐</span>
                    </div>
                </div>
            {:else}
                <div class="result-icon lose-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                </div>
            {/if}
        </div>

        <h2 class="result-title">{title ?? (isWon ? 'SUCCESS!' : 'GAME OVER')}</h2>
        {#if message}
            <p class="result-message">{message}</p>
        {/if}

        <div class="result-stats-grid">
            {#each stats as stat}
                <div class="stat-item" class:highlight={stat.highlight}>
                    <span class="stat-label">{stat.label}</span>
                    <span class="stat-value">{stat.value}</span>
                </div>
            {/each}
        </div>

        {#if newTitleName}
            <div class="title-acquired">
                <div class="title-sparkle-row">
                    <span class="sparkle">✦</span>
                    <span class="sparkle">✦</span>
                    <span class="sparkle">✦</span>
                </div>
                <div class="title-label">칭호 획득!</div>
                <div class="title-name">{newTitleName}</div>
            </div>
        {/if}

        {#if showVisitPrompt}
            <div class="visit-prompt">
                <div class="visit-icon">🏠</div>
                <div class="visit-text">혼놀에 방문하시면 기록을 저장하고<br>랭킹에 도전할 수 있어요!</div>
            </div>
        {/if}

        {#if showAd && onAdReward}
            <RewardedAd onReward={onAdReward} />
        {/if}

        <div class="result-actions">
            <button class="btn-primary huge-btn" onclick={() => setTimeout(primaryAction.onclick, 0)}>
                {primaryAction.label}
            </button>
            <button class="btn-text secondary-btn" onclick={() => setTimeout(secondaryAction.onclick, 0)}>
                {secondaryAction.label}
            </button>
        </div>
    </div>
</div>

<style>
    /* Redesigned Result Modal - copied from sudoku */
    .overlay.backdrop-blur {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100;
        backdrop-filter: blur(8px);
        background: var(--shadow-deep);
        overflow-y: auto;
        padding: 1rem 0;
        touch-action: manipulation;
    }

    .result-card {
        background: var(--bg-primary);
        padding: 3.5rem 2rem 2.5rem 2rem;
        border-radius: 32px;
        width: 90%;
        max-width: 420px;
        text-align: center;
        box-shadow: 0 20px 60px var(--shadow-heavy);
        animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1.5rem;
        position: relative;
        overflow: visible;
    }

    .result-card.win {
        border: 2px solid rgba(255, 215, 0, 0.3);
    }

    /* Icon Animation */
    .result-icon-container {
        position: relative;
        margin-top: -1rem;
    }

    .result-icon {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto;
        color: var(--bg-primary);
        box-shadow: 0 10px 20px var(--overlay-medium);
    }

    .win-icon {
        background: linear-gradient(135deg, var(--color-amber), #FFA500);
        animation: bounce 2s infinite;
    }

    .lose-icon {
        background: linear-gradient(135deg, var(--color-red), #ee5253);
    }

    .result-icon svg {
        width: 40px;
        height: 40px;
    }

    .result-title {
        font-size: 2rem;
        font-weight: 800;
        margin: 0;
        letter-spacing: -1px;
        background: linear-gradient(45deg, var(--bg-dark), var(--text-secondary));
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
    }

    .result-card.win .result-title {
        background: linear-gradient(45deg, var(--color-amber), #FFA500);
        -webkit-background-clip: text;
        background-clip: text;
    }

    .result-message {
        color: var(--text-secondary);
        font-size: 1.1rem;
        margin: -0.5rem 0 0.5rem 0;
        line-height: 1.4;
    }

    /* Stats Grid */
    .result-stats-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        width: 100%;
        background: var(--bg-secondary);
        padding: 1.5rem;
        border-radius: 20px;
    }

    .stat-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.2rem;
    }

    .stat-label {
        font-size: 0.8rem;
        color: var(--text-tertiary);
        font-weight: 600;
        text-transform: uppercase;
    }

    .stat-value {
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--text-primary);
    }

    .stat-item.highlight .stat-value {
        color: var(--color-blue);
        font-size: 1.3rem;
    }

    /* Actions */
    .result-actions {
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
        width: 100%;
        margin-top: 0.5rem;
    }

    .huge-btn {
        width: 100%;
        padding: 1rem;
        font-size: 1.1rem;
        border-radius: 16px;
        box-shadow: 0 8px 20px rgba(59, 130, 246, 0.3);
        background: var(--bg-dark);
        color: var(--bg-primary);
        border: none;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }

    .huge-btn:active {
        transform: scale(0.98);
    }

    .secondary-btn {
        color: var(--text-tertiary);
        font-weight: 500;
        background: none;
        border: none;
        cursor: pointer;
        padding: 0.8rem 1rem;
        font-size: 1rem;
        min-height: 44px;
    }

    .secondary-btn:hover {
        color: var(--text-primary);
        background: none;
    }

    @keyframes popIn {
        from { transform: scale(0.8); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
    }

    @keyframes bounce {
        0%, 20%, 50%, 80%, 100% {transform: translateY(0);}
        40% {transform: translateY(-10px);}
        60% {transform: translateY(-5px);}
    }

    .particles {
        position: absolute;
        width: 100%;
        height: 100%;
        pointer-events: none;
    }

    .particles span {
        position: absolute;
        animation: float 2s infinite ease-in-out;
    }
    .particles span:nth-child(1) { top: -10px; left: -10px; animation-delay: 0s; font-size: 1.2rem; }
    .particles span:nth-child(2) { top: 0px; right: -15px; animation-delay: 0.5s; font-size: 1rem; }
    .particles span:nth-child(3) { bottom: -5px; left: 50%; animation-delay: 1s; font-size: 0.8rem; }

    @keyframes float {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
    }

    /* Title Acquired */
    .title-acquired {
        width: 100%;
        padding: 16px;
        border-radius: 16px;
        background: linear-gradient(135deg, rgba(251, 191, 36, 0.12) 0%, rgba(245, 158, 11, 0.08) 100%);
        border: 1px solid rgba(251, 191, 36, 0.3);
        text-align: center;
        animation: titlePopIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.5s both;
        box-shadow: 0 0 20px rgba(251, 191, 36, 0.1);
    }
    .title-sparkle-row {
        display: flex;
        justify-content: center;
        gap: 8px;
        margin-bottom: 6px;
    }
    .sparkle {
        font-size: 0.9rem;
        color: var(--color-amber-dark);
        animation: sparklePulse 1.5s ease-in-out infinite;
    }
    .sparkle:nth-child(2) { animation-delay: 0.3s; }
    .sparkle:nth-child(3) { animation-delay: 0.6s; }
    .title-label {
        font-size: 0.7rem;
        font-weight: 600;
        color: var(--color-amber-darker);
        letter-spacing: 0.1em;
        text-transform: uppercase;
        margin-bottom: 4px;
    }
    .title-name {
        font-size: 1.2rem;
        font-weight: 800;
        background: linear-gradient(135deg, var(--color-amber-dark) 0%, var(--color-amber-darker) 30%, var(--color-amber) 60%, var(--color-amber-darker) 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
    }
    /* Visit Prompt */
    .visit-prompt {
        width: 100%;
        padding: 16px;
        border-radius: 16px;
        background: linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(217, 119, 6, 0.06) 100%);
        border: 1px solid rgba(245, 158, 11, 0.25);
        text-align: center;
    }
    .visit-icon {
        font-size: 1.8rem;
        margin-bottom: 6px;
    }
    .visit-text {
        font-size: 0.9rem;
        color: var(--color-amber-darker);
        font-weight: 500;
        line-height: 1.5;
    }

    @keyframes titlePopIn {
        from { opacity: 0; transform: scale(0.5) translateY(10px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
    }
    @keyframes sparklePulse {
        0%, 100% { opacity: 0.4; transform: scale(0.8); }
        50% { opacity: 1; transform: scale(1.2); }
    }
</style>

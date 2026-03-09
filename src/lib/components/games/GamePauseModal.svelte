<script lang="ts">
    interface Props {
        stats: Array<{ label: string; value: string }>;
        onResume: () => void;
        onQuit: () => void;
        onRestart: () => void;
    }

    const { stats, onResume, onQuit, onRestart }: Props = $props();
</script>

<div 
    class="overlay" 
    onclick={onResume} 
    onkeydown={(e) => e.key === 'Escape' && onResume()} 
    role="button" 
    tabindex="-1"
>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal pause-modal" onclick={(e) => e.stopPropagation()}>
        <h2>일시정지</h2>
        <div class="pause-stats">
            {#each stats as stat}
                <span>{stat.label}: {stat.value}</span>
            {/each}
        </div>
        <div class="modal-actions">
            <button class="btn-secondary" onclick={onQuit}>나가기</button>
            <button class="btn-secondary" onclick={onRestart}>다시하기</button>
            <button class="btn-primary" onclick={onResume}>계속하기</button>
        </div>
    </div>
</div>

<style>
    .overlay {
        position: fixed;
        inset: 0;
        background: var(--shadow-heavy);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100;
    }

    .modal {
        background: var(--bg-primary);
        border-radius: 24px;
        padding: 2rem;
        width: 90%;
        max-width: 340px;
        text-align: center;
        box-shadow: 0 20px 60px var(--shadow-lg);
        animation: popIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
    }

    .modal h2 {
        margin: 0 0 1rem 0;
        font-size: 1.3rem;
        font-weight: 700;
        color: var(--text-primary);
    }

    .pause-stats {
        display: flex;
        justify-content: center;
        gap: 1.5rem;
        margin-bottom: 1.5rem;
        color: var(--text-tertiary);
        font-size: 0.9rem;
    }

    .modal-actions {
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        gap: 0.8rem;
    }

    .btn-primary {
        background: var(--bg-dark);
        color: var(--bg-primary);
        border: none;
        padding: 0.85rem 1.5rem;
        border-radius: 14px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        width: 100%;
    }

    .btn-primary:active {
        transform: scale(0.97);
        background: #111;
    }

    .btn-secondary {
        background: var(--bg-tertiary);
        color: var(--text-primary);
        border: none;
        padding: 0.85rem 1.5rem;
        border-radius: 14px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        width: 100%;
    }

    .btn-secondary:active {
        transform: scale(0.97);
        background: var(--bg-hover);
    }

    @keyframes popIn {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
    }
</style>

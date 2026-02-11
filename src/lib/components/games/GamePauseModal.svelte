<script lang="ts">
    interface Props {
        stats: Array<{ label: string; value: string }>;
        onResume: () => void;
        onQuit: () => void;
        onRestart: () => void;
    }

    const { stats, onResume, onQuit, onRestart }: Props = $props();
</script>

<div class="overlay" onclick={onResume}>
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
        background: rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100;
    }

    .modal {
        background: white;
        border-radius: 24px;
        padding: 2rem;
        width: 90%;
        max-width: 340px;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0,0,0,0.15);
        animation: popIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
    }

    .modal h2 {
        margin: 0 0 1rem 0;
        font-size: 1.3rem;
        font-weight: 700;
        color: #333;
    }

    .pause-stats {
        display: flex;
        justify-content: center;
        gap: 1.5rem;
        margin-bottom: 1.5rem;
        color: #888;
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
        background: #333;
        color: white;
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
        background: #f1f3f5;
        color: #333;
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
        background: #e9ecef;
    }

    @keyframes popIn {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
    }
</style>

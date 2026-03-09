<script lang="ts">
    /* eslint-disable */
    
    let { isNoteMode = $bindable(false), completedNumbers = [], onnumber, onaction, onnewgame } = $props<{
        isNoteMode: boolean;
        completedNumbers?: number[];
        onnumber: (n: number) => void;
        onaction: (a: 'undo' | 'erase' | 'hint' | 'time_stop' | 'refresh_prob') => void;
        onnewgame: () => void;
    }>();
</script>

<div class="controls">

    <div class="tools">
        <button class="tool-btn" onclick={() => onaction('undo')} aria-label="Undo" title="실행 취소">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
            <span class="label">취소</span>
        </button>
        <button class="tool-btn" onclick={() => onaction('erase')} aria-label="Erase" title="지우기">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
            <span class="label">지우기</span>
        </button>
        <button 
            class="tool-btn" 
            class:active={isNoteMode} 
            onclick={() => isNoteMode = !isNoteMode}
            aria-label="Notes"
            title="메모 모드"
        >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/><path d="M9 13h1"/><path d="M9 17h1"/><path d="M14 13h1"/><path d="M14 17h1"/></svg>
            <span class="label">메모</span>
            <div class="toggle-indicator" class:on={isNoteMode}>{isNoteMode ? 'ON' : 'OFF'}</div>
        </button>
        <!-- <button class="tool-btn" onclick={() => onaction('hint')} aria-label="Hint" title="힌트">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-1 1.5-2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
            <span class="label">힌트</span>
        </button> -->
    </div>
    <div class="numpad">
        {#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as num}
            <button 
                class="num-btn" 
                class:hidden={completedNumbers.includes(num)}
                onclick={() => onnumber(num)}
            >
                {num}
            </button>
        {/each}
    </div>

    
</div>

<style>
    .controls {
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        align-items: center;
        width: 100%;
        margin-top: 1rem;
    }

    .numpad {
        display: flex;
        justify-content: space-between;
        gap: 0.2rem;
        width: 100%;
        max-width: 500px;
        padding: 0 0.5rem;
    }
    
    .num-btn {
        flex: 1;
        aspect-ratio: 0.8;
        font-size: 2rem;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: var(--color-blue-bright);
        border: none;
        background: transparent;
        cursor: pointer;
        transition: all 0.15s;
        font-weight: 300;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        margin: 0;
        touch-action: manipulation;
    }
    
    @media (max-width: 360px) {
        .num-btn {
            font-size: 1.5rem;
        }
    }

    .num-btn:active {
        transform: scale(0.9);
        background: var(--overlay-light);
        border-radius: 8px;
    }
    
    .num-btn.hidden {
        opacity: 0;
        pointer-events: none;
    }
    
    .tools {
        display: flex;
        width: 100%;
        justify-content: space-around;
        padding: 0 1rem;
    }
    
    .tool-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.4rem;
        background: none;
        border: none;
        cursor: pointer;
        color: var(--text-tertiary); /* IOS Gray */
        transition: color 0.2s;
        position: relative;
        min-width: 60px;
        touch-action: manipulation;
    }
    
    .tool-btn svg {
        width: 26px;
        height: 26px;
        stroke-width: 1.8;
    }
    
    .tool-btn .label {
        font-size: 0.75rem;
        font-weight: 500;
    }

    .toggle-indicator {
        font-size: 0.6rem;
        background: var(--border-default);
        padding: 1px 6px;
        border-radius: 10px;
        color: var(--text-secondary);
        position: absolute;
        top: -8px;
        right: 0;
    }
    
    .toggle-indicator.on {
        background: var(--color-blue-bright);
        color: var(--bg-primary);
    }
    
    .tool-btn:hover {
        color: var(--text-primary);
    }
    
    .tool-btn.active {
        color: var(--color-blue-bright); /* Active Blue */
    }
    
    .tool-btn.active svg {
        fill: rgba(0, 122, 255, 0.1);
    }
</style>

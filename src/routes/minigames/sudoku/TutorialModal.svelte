<script lang="ts">
    import { TUTORIALS } from './tutorialData';

    // Props
    let { tutorialId = 'sudoku_easy_1', onclose } = $props();

    let step = $state(0);
    
    // Derived state for current tutorial
    let tutorial = $derived(TUTORIALS[tutorialId] || TUTORIALS['sudoku_easy_1']);
    let currentStepData = $derived(tutorial.steps[step]);
    let totalSteps = $derived(tutorial.steps.length);

    function next() {
        if (step < totalSteps - 1) step++;
        else onclose();
    }

    function prev() {
        if (step > 0) step--;
    }
    
    // Helper to check highlights
    function isHighlighted(r: number, c: number, type: 'row'|'col'|'box') {
        if (!currentStepData.highlights) return false;
        
        if (type === 'row') return currentStepData.highlights.includes(`row-${r}`);
        if (type === 'col') return currentStepData.highlights.includes(`col-${c}`);
        if (type === 'box') {
            const boxIdx = Math.floor(r/3)*3 + Math.floor(c/3);
            return currentStepData.highlights.includes(`box-${boxIdx}`);
        }
        return false;
    }
    
    // Helper for specific cell targeting
    function isTarget(r: number, c: number) {
        return currentStepData.targetCells?.includes(`cell-${r}-${c}`);
    }

    // Helper for board content
    function getCellValue(r: number, c: number) {
        // 1. Static Setup
        if (currentStepData.boardSetup) {
            const key = `${r}-${c}`;
            if (currentStepData.boardSetup[key]) return currentStepData.boardSetup[key];
        }
        // 2. Animations
        if (currentStepData.fillAnimation) {
             const anim = currentStepData.fillAnimation.find((a: any) => a.r === r && a.c === c);
             if (anim) return null; // Will show animated number instead
        }
        
        // Default visual fillers for "Rules" (Game 1)
        if (tutorialId === 'sudoku_easy_1') {
            if (step === 1 && r === 4 && c !== 8) return c + 1;
            if (step === 2 && c === 4 && r !== 8) return r + 1;
            if (step === 3 && r >= 3 && r <= 5 && c >= 3 && c <= 5 && !(r === 4 && c === 4)) return (r - 3) * 3 + (c - 3) + 1;
        }
        return null;
    }
    
    function getAnimatedValue(r: number, c: number) {
        if (currentStepData.fillAnimation) {
             const anim = currentStepData.fillAnimation.find((a: any) => a.r === r && a.c === c);
             return anim ? anim.val : null;
        }
        // Default for Game 1
        if (tutorialId === 'sudoku_easy_1') {
             if (step === 1 && r === 4 && c === 8) return 9;
             if (step === 2 && r === 8 && c === 4) return 9;
             if (step === 3 && r === 4 && c === 4) return 9;
        }
        return null;
    }
</script>

<div class="modal-backdrop">
    <div class="modal-content">
        <div class="modal-header">
            <div>
                <span class="difficulty-badge">{tutorial.title}</span>
                <h2>{currentStepData.title}</h2>
            </div>
            <span class="step-indicator">{step + 1} / {totalSteps}</span>
        </div>

        <div class="visual-area">
            <div class="mini-board">
                {#each Array(9) as _, r}
                    <div class="row">
                        {#each Array(9) as _, c}
                            {@const val = getCellValue(r, c)}
                            <div class="cell" 
                                 class:active-row={isHighlighted(r, c, 'row')}
                                 class:active-col={isHighlighted(r, c, 'col')}
                                 class:active-box={isHighlighted(r, c, 'box')}
                                 class:target-cell={isTarget(r, c)}
                            >
                                {#if Array.isArray(val)}
                                    <div class="note-grid">
                                        {#each val as n}
                                            <span class="note-item n-{n}">{n}</span>
                                        {/each}
                                    </div>
                                {:else}
                                    {val || ''}
                                {/if}
                                
                                {#if getAnimatedValue(r, c)}
                                    <span class="anim-num">{getAnimatedValue(r, c)}</span>
                                {/if}
                            </div>
                        {/each}
                    </div>
                {/each}
            </div>
            
            <div class="animation-overlay">
                {#if currentStepData.arrow === 'horizontal'}
                    <div class="arrow-indicator horizontal"></div>
                {/if}
                {#if currentStepData.arrow === 'vertical'}
                    <div class="arrow-indicator vertical"></div>
                {/if}
            </div>
        </div>

        <div class="desc-area">
            <p>{@html currentStepData.desc}</p>
        </div>

        <div class="actions">
            {#if step > 0}
                <button class="btn-text" onclick={prev}>이전</button>
            {:else}
                <div></div>
            {/if}
            
            <div class="action-buttons">
                {#if step === totalSteps - 1}
                    <button class="btn-primary" onclick={() => onclose()}>닫기</button>
                {:else}
                    <button class="btn-primary" onclick={next}>다음</button>
                {/if}
            </div>
        </div>
    </div>
</div>

<style>
    .modal-backdrop {
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.6);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 2000;
        backdrop-filter: blur(4px);
    }
    .modal-content {
        background: white;
        padding: 1.5rem;
        border-radius: 16px;
        width: 90%;
        max-width: 400px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
    }
    .modal-header h2 {
        margin: 0.2rem 0 0 0;
        font-size: 1.25rem;
        color: #333;
    }
    .difficulty-badge {
        font-size: 0.75rem;
        background: #e9ecef;
        color: #495057;
        padding: 0.1rem 0.5rem;
        border-radius: 4px;
        font-weight: 700;
        display: inline-block;
    }
    .step-indicator {
        font-size: 0.85rem;
        color: #888;
        font-weight: 600;
        background: #f1f3f5;
        padding: 0.2rem 0.6rem;
        border-radius: 12px;
    }

    .visual-area {
        background: #f8f9fa;
        border-radius: 8px;
        padding: 1rem;
        display: flex;
        justify-content: center;
        align-items: center;
        position: relative;
        min-height: 200px;
    }

    .mini-board {
        display: flex;
        flex-direction: column;
        border: 2px solid #333;
        background: white;
    }
    .row {
        display: flex;
    }
    .cell {
        width: 25px; /* Slightly larger for notes */
        height: 25px;
        border: 1px solid #ddd;
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: 0.7rem;
        font-weight: bold;
        color: #333;
        position: relative;
    }
    /* Thicker borders for boxes */
    .cell:nth-child(3n) { border-right: 2px solid #333; }
    .cell:nth-child(9) { border-right: 1px solid #ddd; } 
    .row:nth-child(3n) .cell { border-bottom: 2px solid #333; }
    .row:nth-child(9) .cell { border-bottom: 1px solid #ddd; }
    
    /* Highlight Styles */
    .cell.active-row, .cell.active-col, .cell.active-box {
        background: #e7f5ff;
        border-color: #74c0fc;
    }
    
    .cell.target-cell {
        background: #fff9db;
        border: 2px solid #fab005;
        animation: pulse 1.5s infinite;
    }
    
    /* Note Styles */
    .note-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        width: 100%;
        height: 100%;
        font-size: 6px; /* Very small */
        line-height: 1;
        padding: 1px;
    }
    .note-item {
        display: flex;
        justify-content: center;
        align-items: center;
        color: #868e96;
    }
    .note-item.n-1 { grid-area: 1 / 1; }
    .note-item.n-2 { grid-area: 1 / 2; }
    .note-item.n-3 { grid-area: 1 / 3; }
    .note-item.n-4 { grid-area: 2 / 1; }
    .note-item.n-5 { grid-area: 2 / 2; }
    .note-item.n-6 { grid-area: 2 / 3; }
    .note-item.n-7 { grid-area: 3 / 1; }
    .note-item.n-8 { grid-area: 3 / 2; }
    .note-item.n-9 { grid-area: 3 / 3; }
    
    @keyframes pulse {
        0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(250, 176, 5, 0.4); }
        70% { transform: scale(1.1); box-shadow: 0 0 0 6px rgba(250, 176, 5, 0); }
        100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(250, 176, 5, 0); }
    }

    .anim-num {
        color: #fab005;
        animation: fadeInDrop 0.5s ease-out forwards;
        font-weight: 800;
        position: absolute; /* Overlay on notes */
        font-size: 1rem;
        background: rgba(255,255,255,0.8);
        width: 100%; height: 100%;
        display: flex; justify-content: center; align-items: center;
    }
    @keyframes fadeInDrop {
        from { opacity: 0; transform: scale(3); }
        to { opacity: 1; transform: scale(1); }
    }

    .desc-area {
        text-align: center;
        color: #495057;
        font-size: 0.95rem;
        line-height: 1.5;
        min-height: 4.5rem; 
    }

    .actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 0.5rem;
    }

    .btn-primary {
        background: #4c6ef5;
        color: white;
        border: none;
        padding: 0.6rem 1.2rem;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
    }
    .btn-primary:hover {
        background: #364fc7;
    }
    .btn-text {
        background: none;
        border: none;
        color: #868e96;
        cursor: pointer;
        font-size: 0.9rem;
    }
    .btn-text:hover {
        color: #333;
    }

    .action-buttons {
        display: flex;
        gap: 0.5rem;
    }

    .btn-secondary {
        background: #f1f3f5;
        color: #495057;
        border: none;
        padding: 0.6rem 1.2rem;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
    }
    .btn-secondary:hover {
        background: #e9ecef;
    }
</style>

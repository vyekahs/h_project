<script lang="ts">
    import { KILLER_TUTORIALS, type KillerTutorialStep } from './killerTutorialData';

    let { tutorialId = 'killer_easy_1', onclose } = $props();

    let step = $state(0);

    let tutorial = $derived(KILLER_TUTORIALS[tutorialId] || KILLER_TUTORIALS['killer_easy_1']);
    let currentStepData: KillerTutorialStep = $derived(tutorial.steps[step]);
    let totalSteps = $derived(tutorial.steps.length);

    function next() {
        if (step < totalSteps - 1) step++;
        else onclose();
    }

    function prev() {
        if (step > 0) step--;
    }

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

    function isTarget(r: number, c: number) {
        return currentStepData.targetCells?.includes(`cell-${r}-${c}`);
    }

    function getCellValue(r: number, c: number) {
        if (currentStepData.boardSetup) {
            const key = `${r}-${c}`;
            if (currentStepData.boardSetup[key]) return currentStepData.boardSetup[key];
        }
        if (currentStepData.fillAnimation) {
            const anim = currentStepData.fillAnimation.find((a: any) => a.r === r && a.c === c);
            if (anim) return null;
        }
        return null;
    }

    function getAnimatedValue(r: number, c: number) {
        if (currentStepData.fillAnimation) {
            const anim = currentStepData.fillAnimation.find((a: any) => a.r === r && a.c === c);
            return anim ? anim.val : null;
        }
        return null;
    }

    // Cage helpers for mini-board
    type MiniCage = { cells: { row: number; col: number }[]; sum: number };

    let cageList = $derived(currentStepData.cages || [] as MiniCage[]);

    function findCage(r: number, c: number, cageList: MiniCage[]): MiniCage | null {
        for (const cage of cageList) {
            if (cage.cells.some(cell => cell.row === r && cell.col === c)) {
                return cage;
            }
        }
        return null;
    }

    function sameCage(r1: number, c1: number, r2: number, c2: number, cageList: MiniCage[]): boolean {
        if (r2 < 0 || r2 > 8 || c2 < 0 || c2 > 8) return false;
        const cage1 = findCage(r1, c1, cageList);
        const cage2 = findCage(r2, c2, cageList);
        return cage1 !== null && cage2 !== null && cage1 === cage2;
    }

    function isCageSumCell(r: number, c: number, cageList: MiniCage[]): MiniCage | null {
        for (const cage of cageList) {
            let topLeft = cage.cells[0];
            for (const cell of cage.cells) {
                if (cell.row < topLeft.row || (cell.row === topLeft.row && cell.col < topLeft.col)) {
                    topLeft = cell;
                }
            }
            if (topLeft.row === r && topLeft.col === c) return cage;
        }
        return null;
    }

    function isInAnyCage(r: number, c: number, cageList: MiniCage[]): boolean {
        return findCage(r, c, cageList) !== null;
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
                            {@const sumCage = isCageSumCell(r, c, cageList)}
                            {@const inCage = isInAnyCage(r, c, cageList)}
                            <div class="cell"
                                 class:active-row={isHighlighted(r, c, 'row')}
                                 class:active-col={isHighlighted(r, c, 'col')}
                                 class:active-box={isHighlighted(r, c, 'box')}
                                 class:target-cell={isTarget(r, c)}
                                 class:cage-cell={inCage}
                                 class:cage-border-top={inCage && !sameCage(r, c, r-1, c, cageList)}
                                 class:cage-border-bottom={inCage && !sameCage(r, c, r+1, c, cageList)}
                                 class:cage-border-left={inCage && !sameCage(r, c, r, c-1, cageList)}
                                 class:cage-border-right={inCage && !sameCage(r, c, r, c+1, cageList)}
                            >
                                {#if sumCage}
                                    <span class="cage-sum">{sumCage.sum}</span>
                                {/if}
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
        background: var(--shadow-deep);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 2000;
        backdrop-filter: blur(4px);
    }
    .modal-content {
        background: var(--bg-primary);
        padding: 1.5rem;
        border-radius: 16px;
        width: 90%;
        max-width: 400px;
        box-shadow: 0 10px 25px var(--overlay-medium);
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
        color: var(--text-primary);
    }
    .difficulty-badge {
        font-size: 0.75rem;
        background: var(--bg-hover);
        color: var(--text-dark);
        padding: 0.1rem 0.5rem;
        border-radius: 4px;
        font-weight: 700;
        display: inline-block;
    }
    .step-indicator {
        font-size: 0.85rem;
        color: var(--text-tertiary);
        font-weight: 600;
        background: var(--bg-tertiary);
        padding: 0.2rem 0.6rem;
        border-radius: 12px;
    }

    .visual-area {
        background: var(--bg-secondary);
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
        border: 2px solid var(--text-primary);
        background: var(--bg-primary);
    }
    .row {
        display: flex;
    }
    .cell {
        width: 25px;
        height: 25px;
        border: 1px solid var(--border-default);
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: 0.7rem;
        font-weight: bold;
        color: var(--text-primary);
        position: relative;
    }
    /* Thicker borders for 3x3 boxes */
    .cell:nth-child(3n) { border-right: 2px solid var(--text-primary); }
    .cell:nth-child(9) { border-right: 1px solid var(--border-default); }
    .row:nth-child(3n) .cell { border-bottom: 2px solid var(--text-primary); }
    .row:nth-child(9) .cell { border-bottom: 1px solid var(--border-default); }

    /* Cage borders - dashed */
    .cell.cage-border-top { border-top: 1.5px dashed var(--text-tertiary); }
    .cell.cage-border-bottom { border-bottom: 1.5px dashed var(--text-tertiary); }
    .cell.cage-border-left { border-left: 1.5px dashed var(--text-tertiary); }
    .cell.cage-border-right { border-right: 1.5px dashed var(--text-tertiary); }

    /* Box borders still override */
    .cell:nth-child(3n).cage-border-right { border-right: 2px solid var(--text-primary); }
    .row:nth-child(3n) .cell.cage-border-bottom { border-bottom: 2px solid var(--text-primary); }

    /* Cage sum label */
    .cage-sum {
        position: absolute;
        top: 0;
        left: 1px;
        font-size: 5px;
        font-weight: 700;
        color: var(--text-tertiary);
        line-height: 1;
        z-index: 2;
        pointer-events: none;
    }

    /* Highlight Styles */
    .cell.active-row, .cell.active-col, .cell.active-box {
        background: var(--color-info-bg);
        border-color: var(--color-blue);
    }

    .cell.target-cell {
        background: var(--color-warning-bg);
        border: 2px solid var(--color-amber);
        animation: pulse 1.5s infinite;
    }

    /* Note Styles */
    .note-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        width: 100%;
        height: 100%;
        font-size: 6px;
        line-height: 1;
        padding: 1px;
    }
    .note-item {
        display: flex;
        justify-content: center;
        align-items: center;
        color: var(--text-tertiary);
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
        color: var(--color-amber);
        animation: fadeInDrop 0.5s ease-out forwards;
        font-weight: 800;
        position: absolute;
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
        color: var(--text-dark);
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
        background: var(--color-blue);
        color: var(--bg-primary);
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
        color: var(--text-tertiary);
        cursor: pointer;
        font-size: 0.9rem;
    }
    .btn-text:hover {
        color: var(--text-primary);
    }

    .action-buttons {
        display: flex;
        gap: 0.5rem;
    }

    .btn-secondary {
        background: var(--bg-tertiary);
        color: var(--text-dark);
        border: none;
        padding: 0.6rem 1.2rem;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
    }
    .btn-secondary:hover {
        background: var(--bg-hover);
    }
</style>

<script lang="ts">
    import type { Block } from '$lib/games/unblock-me/levels';
    import { onDestroy } from 'svelte';

    let { blocks = $bindable([]), isGameOver, onbeforemove, onmove, onwin, exitRow = 2 } = $props<{
        blocks: Block[],
        isGameOver: boolean,
        onbeforemove: () => void,
        onmove: () => void,
        onwin: () => void,
        exitRow?: number
    }>();

    let boardEl: HTMLDivElement;
    let draggingBlockId: number | null = $state(null);
    let initialX = 0;
    let initialY = 0;
    let startBlockX = 0;
    let startBlockY = 0;
    let cellSize = 0;

    function handleStart(e: MouseEvent | TouchEvent, block: Block) {
        if (isGameOver) return;

        e.preventDefault();
        onbeforemove();

        draggingBlockId = block.id;
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        initialX = clientX;
        initialY = clientY;
        startBlockX = block.x;
        startBlockY = block.y;

        if (boardEl) {
            cellSize = boardEl.offsetWidth / 6;
        }

        window.addEventListener('mousemove', handleMoveEvent);
        window.addEventListener('touchmove', handleMoveEvent, { passive: false });
        window.addEventListener('mouseup', handleEnd);
        window.addEventListener('touchend', handleEnd);
    }

    function calculateConstraints(block: Block) {
        let min = 0;
        let max = 6 - block.length;

        if (block.orientation === 'horizontal') {
            for (const other of blocks) {
                if (other.id === block.id) continue;
                let otherYEnd = other.y + (other.orientation === 'vertical' ? other.length : 1);
                if (other.y <= block.y && otherYEnd > block.y) {
                    let otherRight = other.x + (other.orientation === 'horizontal' ? other.length : 1);
                    if (otherRight <= block.x) {
                        min = Math.max(min, otherRight);
                    }
                    if (other.x >= block.x + block.length) {
                        max = Math.min(max, other.x - block.length);
                    }
                }
            }
        } else {
            for (const other of blocks) {
                if (other.id === block.id) continue;
                 let otherXEnd = other.x + (other.orientation === 'horizontal' ? other.length : 1);
                 if (other.x <= block.x && otherXEnd > block.x) {
                     let otherBottom = other.y + (other.orientation === 'vertical' ? other.length : 1);
                     if (otherBottom <= block.y) {
                         min = Math.max(min, otherBottom);
                     }
                     if (other.y >= block.y + block.length) {
                         max = Math.min(max, other.y - block.length);
                     }
                 }
            }
        }
        return { min, max };
    }

    function handleMoveEvent(e: MouseEvent | TouchEvent) {
         if (draggingBlockId === null || !boardEl) return;
        e.preventDefault();

        const blockIndex = blocks.findIndex((b: Block) => b.id === draggingBlockId);
        if (blockIndex === -1) return;
        const block = blocks[blockIndex];

        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        const deltaPixels = block.orientation === 'horizontal'
            ? clientX - initialX
            : clientY - initialY;

        const deltaUnits = Math.round(deltaPixels / cellSize);

        const constraints = calculateConstraints(block);

        let newPos = (block.orientation === 'horizontal' ? startBlockX : startBlockY) + deltaUnits;
        newPos = Math.max(constraints.min, Math.min(constraints.max, newPos));

        if (block.orientation === 'horizontal') {
            blocks[blockIndex].x = newPos;
        } else {
            blocks[blockIndex].y = newPos;
        }
    }

    function handleEnd() {
        if (draggingBlockId !== null) {
            const block = blocks.find((b: Block) => b.id === draggingBlockId);
            if (block) {
                if (block.x !== startBlockX || block.y !== startBlockY) {
                    onmove();
                    if (block.type === 'hero') {
                         if (block.x === 6 - block.length) {
                             onwin();
                         }
                    }
                }
            }
        }

        draggingBlockId = null;
        window.removeEventListener('mousemove', handleMoveEvent);
        window.removeEventListener('touchmove', handleMoveEvent);
        window.removeEventListener('mouseup', handleEnd);
        window.removeEventListener('touchend', handleEnd);
    }

    function cleanupListeners() {
        window.removeEventListener('mousemove', handleMoveEvent);
        window.removeEventListener('touchmove', handleMoveEvent);
        window.removeEventListener('mouseup', handleEnd);
        window.removeEventListener('touchend', handleEnd);
        draggingBlockId = null;
    }

    onDestroy(cleanupListeners);

    function getBlockStyle(block: Block) {
        const x = block.x * 100 / 6;
        const y = block.y * 100 / 6;
        const width = block.orientation === 'horizontal' ? (block.length * 100 / 6) : (100 / 6);
        const height = block.orientation === 'vertical' ? (block.length * 100 / 6) : (100 / 6);

        return `
            left: ${x}%;
            top: ${y}%;
            width: ${width}%;
            height: ${height}%;
            --block-color: ${block.color};
        `;
    }
</script>

<div class="board-wrapper">
    <div class="board" bind:this={boardEl}>
        <!-- Grid Background -->
        <div class="grid-bg">
            {#each Array(6) as _, r}
                {#each Array(6) as _, c}
                    <div class="grid-cell" class:exit-cell={r === exitRow && c === 5}></div>
                {/each}
            {/each}
        </div>

        <!-- Blocks -->
        <div class="blocks-layer">
            {#each blocks as block (block.id)}
                 <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                    class="block"
                    class:hero={block.type === 'hero'}
                    class:dragging={draggingBlockId === block.id}
                    class:vertical={block.orientation === 'vertical'}
                    style={getBlockStyle(block)}
                    onmousedown={(e) => handleStart(e, block)}
                    ontouchstart={(e) => handleStart(e, block)}
                >
                    <div class="block-inner">
                        {#if block.type === 'hero'}
                            <div class="hero-arrow">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                            </div>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>
    </div>

    <!-- Exit indicator -->
    <div class="exit-indicator" style="top: calc({exitRow} * 100% / 6 + 100% / 12);">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
    </div>
</div>

<style>
    .board-wrapper {
        position: relative;
        width: 100%;
        max-width: 500px;
        padding-right: 24px;
    }

    .board {
        position: relative;
        width: 100%;
        aspect-ratio: 1/1;
        background: #f8f9fa;
        border-radius: 16px;
        border: 3px solid #333;
        overflow: hidden;
        box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
    }

    .grid-bg {
        position: absolute;
        inset: 0;
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        grid-template-rows: repeat(6, 1fr);
    }

    .grid-cell {
        border: 1px solid rgba(0,0,0,0.04);
    }

    .grid-cell.exit-cell {
        border-right-color: transparent;
        background: linear-gradient(to right, transparent 60%, rgba(239, 83, 80, 0.05));
    }

    /* Exit indicator */
    .exit-indicator {
        position: absolute;
        right: 0;
        transform: translateY(-50%);
        color: #ef5350;
        opacity: 0.7;
        animation: nudge 2s infinite ease-in-out;
    }

    @keyframes nudge {
        0%, 100% { transform: translateY(-50%) translateX(0); }
        50% { transform: translateY(-50%) translateX(3px); }
    }

    /* Blocks */
    .blocks-layer {
        position: absolute;
        inset: 0;
    }

    .block {
        position: absolute;
        padding: 3px;
        box-sizing: border-box;
        touch-action: none;
        cursor: grab;
        transition: left 0.15s cubic-bezier(0.2, 0.8, 0.2, 1), top 0.15s cubic-bezier(0.2, 0.8, 0.2, 1);
        z-index: 5;
    }

    .block.dragging {
        z-index: 20;
        cursor: grabbing;
        transition: none;
    }

    .block-inner {
        width: 100%;
        height: 100%;
        border-radius: 8px;
        position: relative;
        overflow: hidden;
        background: var(--block-color);
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .block.dragging .block-inner {
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }

    /* Hero block */
    .block.hero {
        z-index: 10;
    }

    .block.hero .block-inner {
        background: #ef5350;
        box-shadow: 0 2px 8px rgba(239,83,80,0.3);
    }

    .block.hero.dragging .block-inner {
        box-shadow: 0 4px 16px rgba(239,83,80,0.4);
    }

    .hero-arrow {
        position: absolute;
        right: 6px;
        top: 50%;
        transform: translateY(-50%);
        color: rgba(255,255,255,0.8);
        display: flex;
        align-items: center;
    }
</style>

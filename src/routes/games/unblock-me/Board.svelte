<script lang="ts">
    import type { Block } from '$lib/games/unblock-me/levels';
    
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

        const blockIndex = blocks.findIndex(b => b.id === draggingBlockId);
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
            const block = blocks.find(b => b.id === draggingBlockId);
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

<div class="board-frame">
    <!-- Frame Exit Indicator (Outside Grid) -->
    <div 
        class="frame-exit-indicator" 
        style="top: calc(16px + (100% - 32px) * {exitRow} / 6); height: calc((100% - 32px) / 6);"
    >
        <div class="exit-label">EXIT</div>
        <div class="exit-arrow-icon"></div>
    </div>

    <!-- Inner Board Container -->
    <div class="board-container" bind:this={boardEl}>
        <!-- Grid Background -->
        <div class="grid-background">
            
            <!-- Grid Lines -->
            {#each Array(6) as _, r}
                {#each Array(6) as _, c}
                    <div class="grid-cell" class:has-exit={r === exitRow && c === 5}>
                    </div>
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
                        <div class="block-highlight"></div>
                    </div>
                </div>
            {/each}
        </div>
    </div>
</div>

<style>
    /* 
      NEW DESIGN CONCEPT: "Modern Minimalist"
      - Clean lines, soft shadows, matte finishes.
      - No wood textures or grooves.
      - Frame: Sleek dark grey/metallic.
    */
    
    .board-frame {
        position: relative;
        width: 100%;
        max-width: 500px;
        padding: 16px;
        /* Sleek dark frame */
        background: #2d3436; 
        border-radius: 20px;
        box-shadow: 
            0 20px 40px rgba(0,0,0,0.3),
            0 0 0 1px rgba(255,255,255,0.05);
        box-sizing: border-box;
    }
    
    .board-container {
        position: relative;
        width: 100%;
        aspect-ratio: 1/1;
        /* Clean light grey background for contrast */
        background: #f5f6fa;
        border-radius: 12px;
        overflow: hidden; 
        box-shadow: inset 0 2px 10px rgba(0,0,0,0.1);
    }
    
    .grid-background {
        position: absolute;
        inset: 0;
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        grid-template-rows: repeat(6, 1fr);
    }
    
    .grid-cell {
        /* Very subtle grid */
        border: 1px solid rgba(0,0,0,0.03); 
    }
    
    /* --- EXIT INDICATOR (FRAME LEVEL) --- */
    .frame-exit-indicator {
        position: absolute;
        right: -6px; /* Hang slightly off right edge */
        width: 60px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        z-index: 10;
        pointer-events: none;
    }
    
    .exit-label {
        font-size: 0.7rem;
        font-weight: 800;
        letter-spacing: 1px;
        color: rgba(255, 71, 87, 0.9);
        transform: rotate(90deg);
        transform-origin: center;
        opacity: 0.8;
    }
    
    .exit-arrow-icon {
        width: 0; 
        height: 0; 
        border-top: 6px solid transparent;
        border-bottom: 6px solid transparent;
        border-left: 10px solid #ff4757;
        filter: drop-shadow(0 0 4px rgba(255, 71, 87, 0.4));
        animation: lateral-pulse 1.5s infinite ease-in-out;
    }
    
    @keyframes lateral-pulse {
        0%, 100% { transform: translateX(0); opacity: 0.8; }
        50% { transform: translateX(4px); opacity: 1; }
    }
    
    .grid-cell.has-exit {
        border-right: none;
        box-shadow: inset -10px 0 20px -10px rgba(255, 71, 87, 0.1); /* Inner glow hint */
    }
    
    /* --- BLOCKS --- */
    .blocks-layer {
        position: absolute;
        inset: 0;
    }
    
    .block {
        position: absolute;
        padding: 4px; /* Clean gap */
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
        transform: scale(1.02);
    }
    
    /* Clean Block Look */
    .block-inner {
        width: 100%;
        height: 100%;
        border-radius: 8px;
        position: relative;
        overflow: hidden;
        
        background: var(--block-color);
        /* Soft shadow for depth, top bevel highlight */
        box-shadow: 
            inset 0 1px 0 rgba(255,255,255,0.4),
            0 2px 5px rgba(0,0,0,0.1);
    }
    
    /* Soft top highlight */
    .block-highlight {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 30%;
        background: linear-gradient(to bottom, rgba(255,255,255,0.2), transparent);
    }
    
    /* --- HERO BLOCK --- */
    /* Only Hero looks "Special" but cleaner now */
    .block.hero {
        padding: 3px; /* Slightly larger */
        z-index: 10;
    }
    
    .block.hero .block-inner {
        /* Vibrant Red Gradient */
        background: linear-gradient(135deg, #ff6b6b, #ee5253);
        box-shadow: 
            inset 0 1px 0 rgba(255,255,255,0.5),
            0 4px 10px rgba(238, 82, 83, 0.4);
    }
    
    /* Pulse effect for Hero */
    .block.hero .block-inner::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(45deg, transparent, rgba(255,255,255,0.2), transparent);
        background-size: 200% 200%;
        animation: shine 3s infinite;
    }
    
    @keyframes shine {
        0% { background-position: -150% -150%; }
        20% { background-position: 150% 150%; }
        100% { background-position: 150% 150%; }
    }
    
    /* Regular Blocks - Muted/Soft Colors overrides if color prop is too bright? */
    /* Assuming "var(--block-color)" comes from levels.ts which are pastel. 
       Should look good on #f5f6fa bg. */ 

</style>

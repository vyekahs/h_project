<script lang="ts">
	import type { Board, Cell } from '$lib/games/sudoku/logic';

	let { board, selectedCell, isGameOver, onselect } = $props<{ 
		board: Board, 
		selectedCell: Cell | null,
        isGameOver: boolean,
		onselect: (cell: Cell) => void 
	}>();

    // Optimize selection logic: Pre-calculate indices
    let sRow = $derived(selectedCell?.row ?? -1);
    let sCol = $derived(selectedCell?.col ?? -1);
    let sBoxR = $derived(selectedCell ? Math.floor(selectedCell.row/3) : -1);
    let sBoxC = $derived(selectedCell ? Math.floor(selectedCell.col/3) : -1);
    
    // Determine which number to highlight based on selection
    let highlightNum = $derived(selectedCell?.value ? selectedCell.value : null);

    function isRelated(cell: Cell) {
        if (!selectedCell) return false;
        return cell.row === sRow || 
               cell.col === sCol || 
               (Math.floor(cell.row/3) === sBoxR && 
                Math.floor(cell.col/3) === sBoxC);
    }

    function isSameValue(cell: Cell) {
        if (!selectedCell || selectedCell.value === null) return false;
        return cell.value === selectedCell.value;
    }
</script>

<div class="board">
	{#each board as row, r}
		<div class="row">
			{#each row as cell, c}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
				<div 
					class="cell"
					class:fixed={cell.isFixed}
					class:selected={selectedCell === cell}
                    class:related={!isGameOver && isRelated(cell)}
                    class:same-value={!isGameOver && isSameValue(cell)}
                    class:error={cell.isError}
                    class:border-right={c === 2 || c === 5}
                    class:border-bottom={r === 2 || r === 5}
					onclick={() => onselect(cell)}
				>
					{#if cell.value !== null}
						{cell.value}
					{:else if cell.notes.length > 0}
						<div class="notes-grid">
                            {#each [1,2,3,4,5,6,7,8,9] as n}
                                <span class="note-item" class:visible={cell.notes.includes(n)} class:highlight={highlightNum === n}>
                                    {n}
                                </span>
                            {/each}
                        </div>
					{/if}
				</div>
			{/each}
		</div>
	{/each}
</div>

<style>
	.board {
		display: flex;
		flex-direction: column;
		border: 2px solid #333;
        background: #fff;
        box-shadow: 0 4px 20px rgba(0,0,0,0.05);
        width: 100%;
        max-width: 500px;
        aspect-ratio: 1 / 1;
	}

	.row {
		display: flex;
        flex: 1; /* Fill height equally */
        width: 100%;
	}

	.cell {
        flex: 1; /* Fill width equally */
		border: 1px solid #e0e0e0;
		display: flex;
		align-items: center;
		justify-content: center;
        /* Dynamic font size based on container width */
        /* Fallback */
        font-size: clamp(1rem, 5vw, 1.6rem);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
		cursor: pointer;
		user-select: none;
        position: relative;
        color: #333;
        /* transition: background 0.1s; */
        transition: none; /* Instant response */
        touch-action: manipulation; /* Prevent mobile tap delay */
	}
    
    /* Responsive sizing tweak if needed */
    @media (max-width: 350px) {
        .cell {
            font-size: 0.9rem;
        }
        .note-item {
            font-size: 8px;
        }
    }

    .note-item.highlight { 
        color: #1a73e8 !important; /* Blue highlight */
        font-weight: bold !important;
    }
    
    /* User input - gray color */
    .cell:not(.fixed) {
        color: #666;
    }
    
    /* Fixed/system numbers - black, slightly bolder */
    .cell.fixed {
        font-weight: 600;
        color: #333;
        background: #fff;
    }
    
    .cell.selected {
        background: #e3f2fd !important;
        box-shadow: inset 0 0 0 2px #2196f3;
        border-color: #2196f3;
        z-index: 10;
    }
    
    .cell.related {
        background: #e8f4fd;
    }
    
    .cell.same-value {
        background: #bbdefb !important;
    }

    .cell.error {
        color: #d32f2f !important;
        background: #ffebee !important;
    }
    
    .cell.border-right {
        border-right: 2px solid #333;
    }
    
    .cell.border-bottom {
        border-bottom: 2px solid #333;
    }
    
    .notes-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        grid-template-rows: repeat(3, 1fr);
        width: 100%;
        height: 100%;
        padding: 1px;
    }
    
    .note-item {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.5em; /* relative to cell font size */
        line-height: 1;
        width: 100%;
        height: 100%;
        overflow: hidden;
        visibility: hidden;
        color: #666;
        font-weight: 500;
    }
    
    .note-item.visible {
        visibility: visible;
    }
</style>

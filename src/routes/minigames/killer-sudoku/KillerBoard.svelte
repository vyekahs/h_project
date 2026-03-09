<script lang="ts">
	import type { Board, Cell } from '$lib/games/sudoku/logic';
	import type { Cage } from '$lib/games/sudoku/killerLogic';

	let { board, selectedCell, isGameOver, cages, cageErrors, onselect } = $props<{
		board: Board,
		selectedCell: Cell | null,
        isGameOver: boolean,
		cages: Cage[],
		cageErrors: Set<string>,
		onselect: (cell: Cell) => void
	}>();

    const CAGE_COLORS = [
        '#fef3e2', '#e8f5e9', '#e3f2fd', '#fce4ec', '#f3e5f5',
        '#fff8e1', '#e0f2f1', '#fbe9e7', '#ede7f6', '#e8eaf6',
        '#f1f8e9', '#fff3e0',
    ];

    let cageMap = $derived.by(() => {
        const map = new Map<string, Cage>();
        for (const cage of cages) {
            for (const c of cage.cells) {
                map.set(`${c.row},${c.col}`, cage);
            }
        }
        return map;
    });

    let cageColorMap = $derived.by(() => {
        const colorMap = new Map<number, string>();
        const adjacency = new Map<number, Set<number>>();
        for (const cage of cages) adjacency.set(cage.id, new Set());
        for (const cage of cages) {
            for (const cell of cage.cells) {
                for (const [nr, nc] of [[cell.row-1,cell.col],[cell.row+1,cell.col],[cell.row,cell.col-1],[cell.row,cell.col+1]]) {
                    const neighborCage = cageMap.get(`${nr},${nc}`);
                    if (neighborCage && neighborCage.id !== cage.id) {
                        adjacency.get(cage.id)!.add(neighborCage.id);
                    }
                }
            }
        }
        for (const cage of cages) {
            const usedColors = new Set<string>();
            for (const nid of (adjacency.get(cage.id) || new Set())) {
                const c = colorMap.get(nid);
                if (c) usedColors.add(c);
            }
            colorMap.set(cage.id, CAGE_COLORS.find(color => !usedColors.has(color)) || CAGE_COLORS[0]);
        }
        return colorMap;
    });

    let cageSumCells = $derived.by(() => {
        const map = new Map<number, { row: number; col: number }>();
        for (const cage of cages) {
            let topLeft = cage.cells[0];
            for (const c of cage.cells) {
                if (c.row < topLeft.row || (c.row === topLeft.row && c.col < topLeft.col)) topLeft = c;
            }
            map.set(cage.id, topLeft);
        }
        return map;
    });

    let sRow = $derived(selectedCell?.row ?? -1);
    let sCol = $derived(selectedCell?.col ?? -1);
    let sBoxR = $derived(selectedCell ? Math.floor(selectedCell.row/3) : -1);
    let sBoxC = $derived(selectedCell ? Math.floor(selectedCell.col/3) : -1);
    let selectedCage = $derived(selectedCell ? cageMap.get(`${selectedCell.row},${selectedCell.col}`) : null);
    let highlightNum = $derived(selectedCell?.value ? selectedCell.value : null);

    // Pre-compute set of related cells: row + col only (no box)
    let relatedCells = $derived.by(() => {
        if (!selectedCell || isGameOver) return new Set<string>();
        const cells = new Set<string>();
        for (let i = 0; i < 9; i++) {
            cells.add(`${sRow},${i}`);
            cells.add(`${i},${sCol}`);
        }
        return cells;
    });

    function isSameValue(cell: Cell) {
        if (!selectedCell || selectedCell.value === null) return false;
        return cell.value === selectedCell.value;
    }

    function isSumCell(r: number, c: number): Cage | null {
        for (const [cageId, pos] of cageSumCells) {
            if (pos.row === r && pos.col === c) {
                return cages.find((cage: Cage) => cage.id === cageId) || null;
            }
        }
        return null;
    }

    function hasCageError(r: number, c: number): boolean {
        return cageErrors.has(`${r},${c}`);
    }

    function getCageColor(r: number, c: number): string {
        const cage = cageMap.get(`${r},${c}`);
        if (!cage) return '#fff';
        return cageColorMap.get(cage.id) || '#fff';
    }

    // Compute full inline style for a cell: grid borders + highlight region outline
    function getCellStyle(r: number, c: number): string {
        const isBoxRight = c === 2 || c === 5;
        const isBoxBottom = r === 2 || r === 5;
        const isBoxLeft = c === 3 || c === 6;
        const isBoxTop = r === 3 || r === 6;

        let bTop = r === 0 ? 'none' : isBoxTop ? '1px solid #999' : '1px solid #ddd';
        let bBottom = r === 8 ? 'none' : isBoxBottom ? '1px solid #999' : '1px solid #ddd';
        let bLeft = c === 0 ? 'none' : isBoxLeft ? '1px solid #999' : '1px solid #ddd';
        let bRight = c === 8 ? 'none' : isBoxRight ? '1px solid #999' : '1px solid #ddd';

        const key = `${r},${c}`;
        const inRegion = relatedCells.has(key);

        if (inRegion) {
            // If neighbor in that direction is NOT in the region, draw a highlight border
            if (!relatedCells.has(`${r-1},${c}`)) bTop = '1.5px solid #333';
            if (!relatedCells.has(`${r+1},${c}`)) bBottom = '1.5px solid #333';
            if (!relatedCells.has(`${r},${c-1}`)) bLeft = '1.5px solid #333';
            if (!relatedCells.has(`${r},${c+1}`)) bRight = '1.5px solid #333';
        }

        const cageColor = getCageColor(r, c);
        return `border-top:${bTop};border-bottom:${bBottom};border-left:${bLeft};border-right:${bRight};background:${cageColor}`;
    }
</script>

<div class="board">
	{#each board as row, r}
		<div class="row">
			{#each row as cell, c}
				{@const sumCage = isSumCell(r, c)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="cell"
                    class:error={cell.isError || hasCageError(r, c)}
					onclick={() => onselect(cell)}
					style={getCellStyle(r, c)}
				>
                    {#if sumCage}
                        <span class="cage-sum">{sumCage.sum}</span>
                    {/if}
					{#if cell.value !== null}
						<span class="cell-value" class:shift-value={!!sumCage}>{cell.value}</span>
					{:else if cell.notes.length > 0}
						<div class="notes-grid" class:has-sum={!!sumCage}>
                            {#each [1,2,3,4,5,6,7,8,9] as n}
                                <span class="note-item"
                                    class:visible={cell.notes.includes(n)}
                                    class:highlight={highlightNum === n}
                                >
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
		border: 1px solid var(--text-muted);
        background: var(--bg-primary);
        box-shadow: 0 4px 20px rgba(0,0,0,0.08);
        width: 100%;
        max-width: 500px;
        aspect-ratio: 1 / 1;
	}

	.row {
		display: flex;
        flex: 1;
        width: 100%;
	}

	.cell {
        flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
        font-size: clamp(1.05rem, 5vw, 1.7rem);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
		cursor: pointer;
		user-select: none;
        position: relative;
        color: var(--text-primary);
        font-weight: 500;
        transition: none;
        touch-action: manipulation;
	}

    @media (max-width: 350px) {
        .cell {
            font-size: 0.95rem;
        }
        .note-item {
            font-size: 6px !important;
        }
        .cage-sum {
            font-size: 7px !important;
        }
    }

    .note-item.highlight {
        color: var(--color-blue-bright) !important;
        font-weight: bold !important;
        font-size: 0.48em !important;
    }

    .cell-value {
        position: relative;
        z-index: 1;
    }

    .cell-value.shift-value {
        transform: translate(4%, 6%);
    }

    .cell.error {
        color: var(--color-red-dark) !important;
        background: #fee2e2 !important;
    }

    /* ── Cage sum label ── */
    .cage-sum {
        position: absolute;
        top: 0;
        left: 1px;
        font-size: clamp(0.5rem, 2vw, 0.65rem);
        font-weight: 700;
        color: var(--text-primary);
        line-height: 1;
        z-index: 3;
        pointer-events: none;
        text-shadow: 0 0 2px var(--bg-primary), 0 0 2px var(--bg-primary);
    }

    /* ── Notes grid ── */
    .notes-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        grid-template-rows: repeat(3, 1fr);
        width: 100%;
        height: 100%;
        padding: 1px;
    }

    .notes-grid.has-sum {
        padding: 30% 1px 1px 1px;
    }

    .note-item {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.38em;
        line-height: 1;
        width: 100%;
        height: 100%;
        overflow: hidden;
        visibility: hidden;
        color: var(--text-tertiary);
        font-weight: 500;
    }

    .note-item.visible {
        visibility: visible;
    }

</style>

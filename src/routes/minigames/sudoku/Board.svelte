<script lang="ts">
	import type { Board, Cell } from '$lib/games/sudoku/logic';
    import type { Cage } from '$lib/games/sudoku/killerLogic';

	let { board, cages = [], selectedCell, isGameOver, onselect } = $props<{ 
		board: Board, 
        cages?: Cage[],
		selectedCell: Cell | null,
        isGameOver: boolean,
		onselect: (cell: Cell) => void 
	}>();

    function getTopLeftCell(cells: { row: number; col: number }[]) {
        return cells.reduce((min, c) => (c.row < min.row || (c.row === min.row && c.col < min.col)) ? c : min, cells[0]);
    }

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

    // Killer Sudoku Helpers
    function getCageId(r: number, c: number): number | null {
        if (!cages.length) return null;
        for(let cage of cages) {
            if (cage.cells.some((cell: {row: number, col: number}) => cell.row === r && cell.col === c)) {
                return cage.id;
            }
        }
        return null;
    }

    // Cache cage map for performance
    let cageMap = $derived.by(() => {
        const map = new Map<string, number>();
        const sumMap = new Map<string, number>();
        if (!cages.length) return { map, sumMap };

        cages.forEach((cage: Cage) => {
            // Find top-left most cell for sum display
            let minR = 9, minC = 9;
            cage.cells.forEach((c: {row: number, col: number}) => {
                map.set(`${c.row},${c.col}`, cage.id);
                if (c.row < minR || (c.row === minR && c.col < minC)) {
                    minR = c.row;
                    minC = c.col;
                }
            });
            sumMap.set(`${minR},${minC}`, cage.sum);
        });
        return { map, sumMap };
    });

    // Generate SVG Lines for Cages
    // 0..9 coordinates system.
    // SVG Path Generation for Cages
    // Traces the perimeter of connected cells and applies an inset
    function getCagePath(cage: Cage): string {
        const cells = new Set(cage.cells.map(c => `${c.row},${c.col}`));
        const INSET = 0.08; // Inset amount

        // 1. Find all boundary edges
        // Edge format: "r,c,dir" where dir is 0:top, 1:right, 2:bottom, 3:left
        const edges = new Set<string>();
        cage.cells.forEach(c => {
            const { row: r, col: cl } = c;
            // Top
            if (!cells.has(`${r-1},${cl}`)) edges.add(`${r},${cl},0`);
            // Right
            if (!cells.has(`${r},${cl+1}`)) edges.add(`${r},${cl},1`);
            // Bottom
            if (!cells.has(`${r+1},${cl}`)) edges.add(`${r},${cl},2`);
            // Left
            if (!cells.has(`${r},${cl-1}`)) edges.add(`${r},${cl},3`);
        });

        if (edges.size === 0) return '';

        // 2. Trace the perimeter
        // Start from top-left-most cell's top edge
        let startCell = getTopLeftCell(cage.cells);
        let currR = startCell.row;
        let currC = startCell.col;
        let currDir = 0; // Start at top edge

        // Ensure we explicitly start at a boundary
        if (!edges.has(`${currR},${currC},${currDir}`)) {
            // Should theoretically not happen with sorting, but safety fallback
             if (edges.has(`${currR},${currC},3`)) currDir = 3;
        }

        const points: {x: number, y: number}[] = [];
        
        // Initial vertex for top edge is (c, r) -> (c+1, r)
        // We track the *starting* vertex of the current edge
        // Dir 0 (Top): (c, r) -> (c+1, r)
        // Dir 1 (Right): (c+1, r) -> (c+1, r+1)
        // Dir 2 (Bottom): (c+1, r+1) -> (c, r+1)
        // Dir 3 (Left): (c, r+1) -> (c, r)
        
        // We'll walk edges.
        const startKey = `${currR},${currC},${currDir}`;
        let activeKey = startKey;
        
        let loopCount = 0;
        do {
            // Determine vertex coordinates based on current cell and edge direction
            // But actually, we want to trace *corners*.
            // Let's refine: moving from edge to edge.
            
            // Logic: "Keep right hand on the wall" (interior is right)
            // Wait, standard algorithm: Move along edge. At vertex, check neighbors to find next edge.
            
            // Current Edge: cell (r,c), dir.
            // Vertices of this edge:
            // 0: (c, r) -> (c+1, r)
            // 1: (c+1, r) -> (c+1, r+1)
            // 2: (c+1, r+1) -> (c, r+1)
            // 3: (c, r+1) -> (c, r)
            
            // Add the *start* point of the current edge to our path
            // (We will adjust for inset later or on the fly)
            let px = currC;
            let py = currR;
            if (currDir === 1) { px += 1; }
            if (currDir === 2) { px += 1; py += 1; }
            if (currDir === 3) { py += 1; }
            
            // Apply Inset Logic immediately? 
            // Better to collect raw polygon points first, then inset.
            points.push({x: px, y: py});

            // Find next edge
            // We are at the *end* of the current edge.
            // End points:
            // 0 -> (c+1, r)
            // 1 -> (c+1, r+1)
            // 2 -> (c, r+1)
            // 3 -> (c, r)
            
            // Check potential next edges in order (Sharp Left, Straight, Sharp Right)
            // Actually, for "outline", we wrap around.
            
            // Let's calculate the "next cell" across the vertex
            // This is getting complex to implement practically in one go without a library.
            // SIMPLER METHOD: SVG 'inset' via stroke alignment? No.
            
            // Let's use the layout hardcoding since we know the grid.
            // Move to next edge:
            // Top (0) -> Check Right (1) of same cell?
            // If `(r, c+1)` is in cage, we might go `(r, c+1)` Top (0).
            // If `(r, c+1)` NOT in cage, we turn Right (1) on current cell.
            // Also check diagonal `(r-1, c+1)`?
            
            // Transition Logic:
            let nextR = currR;
            let nextC = currC;
            let nextDir = currDir;

            if (currDir === 0) { // Moving Right along Top
                 // Check if we can continue going Right (neighbor to the right has a top edge?)
                 if (cells.has(`${currR},${currC+1}`) && edges.has(`${currR},${currC+1},0`)) {
                     nextC++;
                 } else if (cells.has(`${currR},${currC+1}`)) {
                     // Neighbor exists but no top edge -> it shares our border? No, logic error.
                     // If neighbor exists, we are "inside".
                     // If we are on Top Edge of (r,c), and (r,c+1) is in cage.
                     // Then (r, c+1) must have a top edge?
                     // Unless (r-1, c+1) is also in cage? Then it's not a boundary.
                     
                     // Case 1: (r-1, c+1) is IN CAGE -> We turn LEFT (Up)
                     if (cells.has(`${currR-1},${currC+1}`)) {
                         nextR--;
                         nextC++;
                         nextDir = 3; // Left edge of the diagonal cell
                     } else {
                         // Case 2: (r-1, c+1) NOT in cage -> We continue Straight?
                         // Waitt, if (r, c+1) is in cage, and (r-1, c+1) is not... 
                         // Then (r, c+1) has a Top Edge.
                         nextC++; 
                         // nextDir = 0; (unchanged)
                     }
                 } else {
                     // Neighbor (r, c+1) is NOT in cage.
                     // We hit a wall. Turn RIGHT (Down).
                     nextDir = 1;
                 }
            } else if (currDir === 1) { // Moving Down along Right
                if (cells.has(`${currR+1},${currC}`) && edges.has(`${currR+1},${currC},1`)) {
                    nextR++;
                } else if (cells.has(`${currR+1},${currC}`)) {
                    if (cells.has(`${currR+1},${currC+1}`)) {
                        nextR++;
                        nextC++;
                        nextDir = 0; // Top edge of diagonal
                    } else {
                        nextR++;
                    }
                } else {
                    nextDir = 2; // Turn Right -> Bottom
                }
            } else if (currDir === 2) { // Moving Left along Bottom
                if (cells.has(`${currR},${currC-1}`) && edges.has(`${currR},${currC-1},2`)) {
                    nextC--;
                } else if (cells.has(`${currR},${currC-1}`)) {
                    if (cells.has(`${currR+1},${currC-1}`)) {
                        nextR++;
                        nextC--;
                        nextDir = 1; // Right edge of diagonal
                    } else {
                        nextC--;
                    }
                } else {
                    nextDir = 3; // Turn Right -> Left edge
                }
            } else if (currDir === 3) { // Moving Up along Left
                if (cells.has(`${currR-1},${currC}`) && edges.has(`${currR-1},${currC},3`)) {
                    nextR--;
                } else if (cells.has(`${currR-1},${currC}`)) {
                    if (cells.has(`${currR-1},${currC-1}`)) {
                        nextR--;
                        nextC--;
                        nextDir = 2; // Bottom edge of diagonal
                    } else {
                        nextR--;
                    }
                } else {
                    nextDir = 0; // Turn Right -> Top
                }
            }

            currR = nextR;
            currC = nextC;
            currDir = nextDir;
            
            activeKey = `${currR},${currC},${currDir}`;
            loopCount++;
        } while (activeKey !== startKey && loopCount < 100);

        // 2b. Simplify Polygon (Remove Collinear Vertices)
        // This prevents "double inset" on straight lines which creates a "dip"
        const uniquePoints = points.filter((curr, i) => {
             const prev = points[(i - 1 + points.length) % points.length];
             const next = points[(i + 1) % points.length];
             const dx1 = curr.x - prev.x;
             const dy1 = curr.y - prev.y;
             const dx2 = next.x - curr.x;
             const dy2 = next.y - curr.y;
             // Keep point only if direction changes (not collinear)
             return (dx1 * dy2 !== dy1 * dx2);
        });

        // 3. Process Points to Apply Inset
        // Since we have a polygon, we can just shrink it.
        // Simple logic for rectilinear polygon:
        // If convex corner (90 deg), move point inward (+dx, +dy).
        // If concave corner (270 deg), move point inward (which looks like filling the notch).
        
        // Helper: get vector of next segment.
        const insetPoints = uniquePoints.map((p, i) => {
            const points = uniquePoints; // Use simplified points for context
            const prev = points[(i - 1 + points.length) % points.length];
            const next = points[(i + 1) % points.length];
            
            // Vector prev -> p
            const v1x = Math.sign(p.x - prev.x);
            const v1y = Math.sign(p.y - prev.y);
            
            // Vector p -> next
            const v2x = Math.sign(next.x - p.x);
            const v2y = Math.sign(next.y - p.y);
            
            // Determine turn. Cross product? 
            // (v1x, v1y) rotated 90 deg clockwise is (-v1y, v1x).
            // Dot product with v2.
            // Or simple case analysis.
            
            // Inset shift vector
            let dx = 0, dy = 0;
            
            // Analyze the Corner
            // Should shift *away* from the edge normal.
            // Edge 1 normal (right hand rule): (-v1y, v1x)
            // Edge 2 normal: (-v2y, v2x)
            
            // We want to shift 'in' relative to the polygon.
            // Polygon interior is on the Right of the path traversal.
            // So shift by Normal * INSET.
            
            // Normal 1: (v1y, -v1x) -- wait, check coordinate system. SVG y is down.
            // Right of (1, 0) [Right] is (0, 1) [Down]. Normal is (0,1).
            // (v1y, -v1x) -> (0, -1). Wrong.
            // Let's simply hardcode based on standard "inner" box logic.
            
            // Incoming -> Outgoing
            // Right -> Down (Convex): Inset (-1, -1) * k ?
            // p is (x,y). We want (x-k, y+k).
            // v1=(1,0), v2=(0,1).
            
            const isConvex = (v1x * v2y - v1y * v2x) > 0; // Cross product z-component
            
            // Actually, just average the normals?
            // Let's use specific logic.
            
            let nx = 0, ny = 0;
            
            /* 
              Directions:
               Right (1,0)
               Down (0,1)
               Left (-1,0)
               Up (0,-1)
            */
            
            // Mappings for Inset Direction (Move Inside)
            // If going Right, Interior is Down. Shift Y += k.
            // If going Down, Interior is Left. Shift X -= k.
            // If going Left, Interior is Up. Shift Y -= k.
            // If going Up, Interior is Right. Shift X += k.
            
            // Corner is intersection of two shifted lines.
            // Line 1 shifted: P + N1*k
            // Line 2 shifted: P + N2*k
            // intersection is P + (N1+N2)*k ? Only for 90deg corners. Yes.
            
            const getNormal = (vx: number, vy: number) => {
                if (vx === 1) return {x: 0, y: 1};
                if (vx === -1) return {x: 0, y: -1};
                if (vy === 1) return {x: -1, y: 0};
                if (vy === -1) return {x: 1, y: 0};
                return {x:0, y:0};
            };
            
            const n1 = getNormal(v1x, v1y);
            const n2 = getNormal(v2x, v2y);
            
            // Convex vs Concave?
            // If Convex, we move In (sum of normals).
            // If Concave, we move In (sum of normals).
            // Example Concave: Right -> Up (Right-Hand Interior) ??
            // If we have "L" hole.
            // Path: Right, then Left? No.
            // Path: Down, then Right.
            // v1=(0,1) Down. Interior Left (x-1).
            // v2=(1,0) Right. Interior Down (y+1).
            // Result (x-1, y+1).
            // Original Corner: (1, 1).
            // Inset Corner: (0.9, 1.1).
            // Correct?
            // Wait, Down -> Right is a Left Turn (Concave in our CW winding? Wait).
            // Our iteration logic was "keep right hand on wall".
            // So Interior is on the Right.
            
            // Down (0,1) -> Right (1,0). Turn is Left (-90). Concave.
            // n1 = (-1, 0)
            // n2 = (0, 1)
            // Sum = (-1, 1).
            // Offset = P + (-k, k). Correct. This moves point into the "bulk" of the L.
             
            nx = n1.x + n2.x;
            ny = n1.y + n2.y;
            
            return {
                x: p.x + nx * INSET,
                y: p.y + ny * INSET
            };
        });

        return insetPoints.map((p, i) => (i === 0 ? 'M' : 'L') + `${p.x} ${p.y}`).join(' ') + ' Z';
    }

    // Helper to check if a specific border exists for a cell
    function hasBorder(r: number, c: number, side: 'top'|'bottom'|'left'|'right'): boolean {
        if (!cages.length) return false;
        const id = cageMap.map.get(`${r},${c}`);
        if (id === undefined) return false;

        let neighborId: number | undefined;
        if (side === 'top') neighborId = r > 0 ? cageMap.map.get(`${r-1},${c}`) : -1;
        else if (side === 'bottom') neighborId = r < 8 ? cageMap.map.get(`${r+1},${c}`) : -1;
        else if (side === 'left') neighborId = c > 0 ? cageMap.map.get(`${r},${c-1}`) : -1;
        else if (side === 'right') neighborId = c < 8 ? cageMap.map.get(`${r},${c+1}`) : -1;

        return id !== neighborId;
    }

</script>

<div class="board-container">
    <div class="board" class:killer-board={cages.length > 0}>
        {#each board as row, r}
            <div class="row">
                {#each row as cell, c}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div 
                        class="cell"
                        class:error={cell.isError}
                        class:border-right={c === 2 || c === 5}
                        class:border-bottom={r === 2 || r === 5}
                        onclick={() => onselect(cell)}
                    >
                        <!-- Background Layer (Handles Shape & Selection) -->
                        <div 
                            class="cell-bg"
                            class:fixed={cell.isFixed}
                            class:selected={selectedCell === cell}
                            class:related={!isGameOver && isRelated(cell)}
                            class:same-value={!isGameOver && isSameValue(cell)}
                            style:top={hasBorder(r,c,'top') ? '5%' : '0'}
                            style:bottom={hasBorder(r,c,'bottom') ? '5%' : '0'}
                            style:left={hasBorder(r,c,'left') ? '5%' : '0'}
                            style:right={hasBorder(r,c,'right') ? '5%' : '0'}
                        ></div>

                        <!-- Content Layer (Centered Numbers/Notes) -->
                        <div class="cell-content" class:fixed={cell.isFixed}>
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
                    </div>
                {/each}
            </div>
        {/each}
    </div>
    
    <!-- SVG Overlay -->
    {#if cages.length > 0}
        <svg class="cage-overlay" viewBox="0 0 9 9" preserveAspectRatio="none">
            {#each cages as cage}
                {@const pathData = getCagePath(cage)}
                {#if pathData}
                <!-- Find Top-Left Cell for Label -->
                {@const c0 = getTopLeftCell(cage.cells)}
                <!-- Raise sum label higher to cover line (y + 0.04) -->
                {@const pos = { x: c0.col + 0.05, y: c0.row + 0.04 }}
                
                {@const strLen = cage.sum.toString().length}
                {@const fontSize = 0.18}
                {@const rectWidth = strLen * 0.11 + 0.04} 
                {@const rectHeight = 0.2}
                
                <g>
                    <!-- Main Dotted Line -->
                    <path 
                        d={pathData} 
                        fill="none" 
                        stroke="var(--text-primary)" 
                        stroke-width="0.035" 
                        stroke-dasharray="0.05 0.05" 
                        stroke-linejoin="round"
                    />
                    <!-- Sum Label -->
                    <rect 
                        x={pos.x}
                        y={pos.y}
                        width={rectWidth}
                        height={rectHeight}
                        fill="var(--bg-primary)"
                        rx="0.03"
                    />
                    
                    <!-- Main Text -->
                    <text 
                        x={pos.x + rectWidth / 2} 
                        y={pos.y + rectHeight / 2} 
                        class="svg-cage-sum"
                        font-size={fontSize}
                        font-weight="bold"
                        fill="var(--text-primary)"
                        dominant-baseline="middle"
                        text-anchor="middle"
                    >
                        {cage.sum}
                    </text>
                </g>
                {/if}
            {/each}
        </svg>
    {/if}
</div>

<style>
    .board-container {
        position: relative;
        width: 100%;
        max-width: 500px;
        aspect-ratio: 1 / 1;
    }

	.board {
		display: flex;
		flex-direction: column;
		border: 2px solid var(--text-primary);
        background: var(--bg-primary);
        box-shadow: 0 4px 20px var(--overlay-light);
        width: 100%;
        height: 100%;
	}
    
    .cage-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 5;
    }

	.row {
		display: flex;
        flex: 1; /* Fill height equally */
        width: 100%;
	}

	.cell {
        flex: 1; /* Fill width equally */
		border: 1px solid var(--border-default);
        position: relative;
        /* No flex here, we use layers */
		cursor: pointer;
		user-select: none;
        touch-action: manipulation;
        box-sizing: border-box;
	}

    .cell-bg {
        position: absolute;
        border-radius: 4px; /* Slight rounding for inside shape */
        transition: none;
        /* Default transparent */
    }

    .cell-content {
        position: absolute;
        inset: 0;
        z-index: 2;
        display: flex;
        align-items: center;
        justify-content: center;
        
        /* Dynamic font size based on container width */
        font-size: clamp(1rem, 5vw, 1.6rem);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: var(--text-primary);
    }
    
    /* Responsive sizing tweak if needed */
    @media (max-width: 350px) {
        .cell-content {
            font-size: 0.9rem;
        }
        .note-item {
            font-size: 8px;
        }
    }

    /* Colors on BG */
    .cell-bg.selected {
        background: #bbdefb !important; 
    }
    
    .cell-bg.related {
        background: #e8f4fd;
    }
    
    .cell-bg.same-value {
        background: #90caf9 !important;
    }

    .cell.error .cell-bg {
        background: #ffebee !important;
    }

    /* 다크 테마: 위 파스텔 배경을 그대로 두면 어두운 판 위에 밝은 판이 떠서
       숫자(테마 텍스트색)가 묻힌다. 같은 색상 계열의 저채도 틴트로 대체 */
    :global([data-theme='dark']) .cell-bg.selected {
        background: color-mix(in srgb, var(--color-blue) 38%, transparent) !important;
    }

    :global([data-theme='dark']) .cell-bg.related {
        background: color-mix(in srgb, var(--color-blue) 14%, transparent);
    }

    :global([data-theme='dark']) .cell-bg.same-value {
        background: color-mix(in srgb, var(--color-blue) 26%, transparent) !important;
    }

    :global([data-theme='dark']) .cell.error .cell-bg {
        background: color-mix(in srgb, var(--color-red) 28%, transparent) !important;
    }
    
    /* Colors on Text */
    .note-item.highlight {
        color: var(--color-blue-bright) !important; /* Blue highlight */
        font-weight: bold !important;
        font-size: 0.45em !important;
    }
    
    /* User input - gray/blue color */
    .cell-content:not(.fixed) {
        color: var(--color-blue-bright);
        font-weight: 500;
    }
    
    /* Fixed/system numbers */
    .cell-content.fixed {
        font-weight: 600;
        color: var(--text-primary);
    }
    
    /* Error Text Color */
    .cell.error .cell-content {
        color: var(--color-red-dark) !important;
    }

    /* Standard Borders */
    .cell.border-right {
        border-right: 2px solid var(--text-primary);
    }
    
    .cell.border-bottom {
        border-bottom: 2px solid var(--text-primary);
    }

    /* Killer Sudoku Styles */
    .killer-board .cell {
        border: 1px solid var(--bg-elevated); /* Lighter inner borders for killer */
    }

    /* 3x3 Box Borders override for Killer */
    .killer-board .cell.border-right {
        border-right: 2px solid var(--text-primary);
    }
    .killer-board .cell.border-bottom {
        border-bottom: 2px solid var(--text-primary);
    }

    /* Fix outer board borders to be solid */
    .board {
        border: 2px solid var(--text-primary);
    }

    .svg-cage-sum {
        font-family: 'Roboto Mono', monospace;
        pointer-events: none;
        user-select: none;
        font-size: 0.18; /* Smaller, discreet */
    }
    
    .notes-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        grid-template-rows: repeat(3, 1fr);
        width: 100%;
        height: 100%;
        padding: 30% 10% 10% 10%; /* Top padding significantly larger to move notes down */
        box-sizing: border-box;
    }
    
    .note-item {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.35em; /* Smaller hints */
        line-height: 1;
        width: 100%;
        height: 100%;
        overflow: hidden;
        visibility: hidden;
        color: var(--text-secondary);
        font-weight: 500;
    }
    
    .note-item.visible {
        visibility: visible;
    }
</style>

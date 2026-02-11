/**
 * Unblock Me Level Generator v5 (Optimized)
 *
 * Algorithm:
 * 1. Random block placement with intentional blockers
 * 2. Forward BFS solver (fast) for SA fitness
 * 3. Simulated Annealing: mutate block configs to maximize difficulty
 * 4. Unsolver on best SA result to find hardest starting position
 *
 * Optimizations:
 * - Packed state encoding (single integer per block position)
 * - Minimal array allocation in hot paths
 * - 'H' excluded from CHARS to prevent hero collision
 *
 * Usage: node scripts/generateUnblockLevels.mjs
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const G = 6;

const DIFF_CONFIG = {
    easy:   { min: 1,  max: 4,   target: 100 },
    medium: { min: 5,  max: 8,   target: 100 },
    hard:   { min: 9,  max: 14,  target: 100 },
    expert: { min: 15, max: 25,  target: 100 },
    master: { min: 26, max: 999, target: 100 },
};

const CHARS = 'ABCDEFGIJKLMNOPQRSTUVWXYZ'; // 'H' excluded

// ============================================================
// Core - Packed State Representation
// ============================================================
// Each block: { x, y, len, h, hero }
// State key: pack all (x,y) into a single string using base-7 digits
// This is faster than string concatenation per block

function idx(x, y) { return y * G + x; }
function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

// Pack positions into a compact string key
function stateKey(blocks) {
    // Each block position is x*7+y (max 6*7+5=47, fits in one char offset)
    let k = '';
    for (let i = 0; i < blocks.length; i++) {
        k += String.fromCharCode(blocks[i].x * 7 + blocks[i].y + 33);
    }
    return k;
}

function buildOcc(blocks) {
    const occ = new Int8Array(36).fill(-1);
    for (let bi = 0; bi < blocks.length; bi++) {
        const b = blocks[bi];
        if (b.h) {
            for (let i = 0; i < b.len; i++) occ[idx(b.x + i, b.y)] = bi;
        } else {
            for (let i = 0; i < b.len; i++) occ[idx(b.x, b.y + i)] = bi;
        }
    }
    return occ;
}

// Clone blocks array (lightweight)
function cloneBlocks(blocks) {
    const r = new Array(blocks.length);
    for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        r[i] = { x: b.x, y: b.y, len: b.len, h: b.h, hero: b.hero };
    }
    return r;
}

// Clone and move one piece
function cloneAndMove(blocks, bi, nx, ny) {
    const r = new Array(blocks.length);
    for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (i === bi) {
            r[i] = { x: nx, y: ny, len: b.len, h: b.h, hero: b.hero };
        } else {
            r[i] = { x: b.x, y: b.y, len: b.len, h: b.h, hero: b.hero };
        }
    }
    return r;
}

function blocksToGrid(blocks) {
    const grid = new Array(36).fill('.');
    let ci = 0;
    for (const b of blocks) {
        const ch = b.hero ? 'H' : CHARS[ci++];
        if (b.h) {
            for (let i = 0; i < b.len; i++) grid[idx(b.x + i, b.y)] = ch;
        } else {
            for (let i = 0; i < b.len; i++) grid[idx(b.x, b.y + i)] = ch;
        }
    }
    return grid.join('');
}

// ============================================================
// Win State Check
// ============================================================

function isWinState(blocks) {
    for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (!b.hero) continue;
        if (!b.h) return false;
        // Check clear path to right edge
        // Quick check: build mini occupancy for hero row only
        const row = new Uint8Array(G);
        for (let j = 0; j < blocks.length; j++) {
            if (j === i) continue;
            const o = blocks[j];
            if (o.h) {
                if (o.y === b.y) {
                    for (let k = 0; k < o.len; k++) row[o.x + k] = 1;
                }
            } else {
                if (o.x >= 0 && o.x < G) {
                    for (let k = 0; k < o.len; k++) {
                        if (o.y + k === b.y) row[o.x] = 1;
                    }
                }
            }
        }
        for (let x = b.x + b.len; x < G; x++) {
            if (row[x]) return false;
        }
        return true;
    }
    return false;
}

// ============================================================
// Forward BFS Solver
// ============================================================

function solve(blocks) {
    let hi = -1;
    for (let i = 0; i < blocks.length; i++) {
        if (blocks[i].hero) { hi = i; break; }
    }
    if (hi < 0) return -1;

    const visited = new Set();
    visited.add(stateKey(blocks));

    let queue = [blocks];
    let depth = 0;

    while (queue.length > 0) {
        depth++;
        if (depth > 200) return -1;
        const next = [];

        for (let qi = 0; qi < queue.length; qi++) {
            const st = queue[qi];
            const occ = buildOcc(st);

            for (let bi = 0; bi < st.length; bi++) {
                const b = st[bi];
                if (b.h) {
                    // Left
                    for (let d = 1; b.x - d >= 0; d++) {
                        if (occ[idx(b.x - d, b.y)] >= 0) break;
                        const ns = cloneAndMove(st, bi, b.x - d, b.y);
                        const k = stateKey(ns);
                        if (!visited.has(k)) { visited.add(k); next.push(ns); }
                    }
                    // Right
                    for (let d = 1; ; d++) {
                        const ex = b.x + b.len - 1 + d;
                        if (b.hero && ex >= G) return depth;
                        if (ex >= G) break;
                        if (occ[idx(ex, b.y)] >= 0) break;
                        const ns = cloneAndMove(st, bi, b.x + d, b.y);
                        const k = stateKey(ns);
                        if (!visited.has(k)) { visited.add(k); next.push(ns); }
                    }
                } else {
                    // Up
                    for (let d = 1; b.y - d >= 0; d++) {
                        if (occ[idx(b.x, b.y - d)] >= 0) break;
                        const ns = cloneAndMove(st, bi, b.x, b.y - d);
                        const k = stateKey(ns);
                        if (!visited.has(k)) { visited.add(k); next.push(ns); }
                    }
                    // Down
                    for (let d = 1; b.y + b.len - 1 + d < G; d++) {
                        if (occ[idx(b.x, b.y + b.len - 1 + d)] >= 0) break;
                        const ns = cloneAndMove(st, bi, b.x, b.y + d);
                        const k = stateKey(ns);
                        if (!visited.has(k)) { visited.add(k); next.push(ns); }
                    }
                }
            }
        }
        queue = next;
    }
    return -1;
}

// ============================================================
// Unsolver
// ============================================================

function unsolve(blocks, maxStates = 500000) {
    const startKey = stateKey(blocks);
    const allStates = new Map([[startKey, blocks]]);

    // BFS to explore entire state space
    // Store adjacency as we go (forward edges)
    const adjForward = new Map(); // key -> [key]

    let frontier = [startKey];
    while (frontier.length > 0) {
        const nextFrontier = [];
        for (let fi = 0; fi < frontier.length; fi++) {
            const sk = frontier[fi];
            const st = allStates.get(sk);
            const occ = buildOcc(st);
            const neighbors = [];

            for (let bi = 0; bi < st.length; bi++) {
                const b = st[bi];
                if (b.h) {
                    for (let d = 1; b.x - d >= 0; d++) {
                        if (occ[idx(b.x - d, b.y)] >= 0) break;
                        const ns = cloneAndMove(st, bi, b.x - d, b.y);
                        const nk = stateKey(ns);
                        neighbors.push(nk);
                        if (!allStates.has(nk)) {
                            allStates.set(nk, ns);
                            nextFrontier.push(nk);
                        }
                    }
                    for (let d = 1; b.x + b.len - 1 + d < G; d++) {
                        if (occ[idx(b.x + b.len - 1 + d, b.y)] >= 0) break;
                        const ns = cloneAndMove(st, bi, b.x + d, b.y);
                        const nk = stateKey(ns);
                        neighbors.push(nk);
                        if (!allStates.has(nk)) {
                            allStates.set(nk, ns);
                            nextFrontier.push(nk);
                        }
                    }
                } else {
                    for (let d = 1; b.y - d >= 0; d++) {
                        if (occ[idx(b.x, b.y - d)] >= 0) break;
                        const ns = cloneAndMove(st, bi, b.x, b.y - d);
                        const nk = stateKey(ns);
                        neighbors.push(nk);
                        if (!allStates.has(nk)) {
                            allStates.set(nk, ns);
                            nextFrontier.push(nk);
                        }
                    }
                    for (let d = 1; b.y + b.len - 1 + d < G; d++) {
                        if (occ[idx(b.x, b.y + b.len - 1 + d)] >= 0) break;
                        const ns = cloneAndMove(st, bi, b.x, b.y + d);
                        const nk = stateKey(ns);
                        neighbors.push(nk);
                        if (!allStates.has(nk)) {
                            allStates.set(nk, ns);
                            nextFrontier.push(nk);
                        }
                    }
                }
            }
            adjForward.set(sk, neighbors);
        }
        frontier = nextFrontier;
        if (allStates.size > maxStates) break;
    }

    // Find win states
    const winKeys = [];
    for (const [k, st] of allStates) {
        if (isWinState(st)) winKeys.push(k);
    }
    if (winKeys.length === 0) return null;

    // Build reverse adjacency
    const revAdj = new Map();
    for (const [sk, neighbors] of adjForward) {
        for (const nk of neighbors) {
            if (!revAdj.has(nk)) revAdj.set(nk, []);
            revAdj.get(nk).push(sk);
        }
    }

    // BFS backward from win states
    const dist = new Map();
    frontier = [];
    for (const wk of winKeys) { dist.set(wk, 0); frontier.push(wk); }

    let maxDist = 0, maxKey = winKeys[0];

    while (frontier.length > 0) {
        const nextFrontier = [];
        for (let fi = 0; fi < frontier.length; fi++) {
            const sk = frontier[fi];
            const d = dist.get(sk);
            const rev = revAdj.get(sk);
            if (!rev) continue;
            for (let ri = 0; ri < rev.length; ri++) {
                const nk = rev[ri];
                if (!dist.has(nk)) {
                    const nd = d + 1;
                    dist.set(nk, nd);
                    nextFrontier.push(nk);
                    if (nd > maxDist) { maxDist = nd; maxKey = nk; }
                }
            }
        }
        frontier = nextFrontier;
    }

    if (maxDist === 0) return null;
    return { blocks: allStates.get(maxKey), moves: maxDist };
}

// ============================================================
// Placement
// ============================================================

function canPlace(grid, x, y, len, horiz) {
    if (horiz) {
        if (x + len > G) return false;
        for (let i = 0; i < len; i++) if (grid[idx(x + i, y)] !== '.') return false;
    } else {
        if (y + len > G) return false;
        for (let i = 0; i < len; i++) if (grid[idx(x, y + i)] !== '.') return false;
    }
    return true;
}

function placeOnGrid(grid, x, y, len, horiz) {
    if (horiz) for (let i = 0; i < len; i++) grid[idx(x + i, y)] = 'X';
    else for (let i = 0; i < len; i++) grid[idx(x, y + i)] = 'X';
}

function generateRandomBlocks(numBlocks) {
    const grid = new Array(36).fill('.');
    const heroRow = randInt(1, G - 2);
    const heroX = randInt(0, 2);
    placeOnGrid(grid, heroX, heroRow, 2, true);
    const blocks = [{ x: heroX, y: heroRow, len: 2, h: true, hero: true }];

    // Vertical blockers
    const cols = [];
    for (let c = heroX + 2; c < G; c++) cols.push(c);
    cols.sort(() => Math.random() - 0.5);
    let bp = 0;
    const maxB = Math.min(cols.length, randInt(2, 3));
    for (const col of cols) {
        if (bp >= maxB) break;
        const len = Math.random() < 0.5 ? 2 : 3;
        const ps = [];
        for (let y = Math.max(0, heroRow - len + 1); y <= Math.min(G - len, heroRow); y++) {
            if (canPlace(grid, col, y, len, false)) ps.push(y);
        }
        if (ps.length > 0) {
            const y = ps[Math.floor(Math.random() * ps.length)];
            placeOnGrid(grid, col, y, len, false);
            blocks.push({ x: col, y, len, h: false, hero: false });
            bp++;
        }
    }

    let fails = 0;
    while (blocks.length < numBlocks && fails < 500) {
        const len = Math.random() < 0.55 ? 2 : 3;
        const horiz = Math.random() < 0.5;
        const positions = [];
        if (horiz) {
            for (let y = 0; y < G; y++)
                for (let x = 0; x <= G - len; x++)
                    if (canPlace(grid, x, y, len, true)) positions.push((y << 4) | x);
        } else {
            for (let x = 0; x < G; x++)
                for (let y = 0; y <= G - len; y++)
                    if (canPlace(grid, x, y, len, false)) positions.push((y << 4) | x);
        }
        if (positions.length === 0) { fails++; continue; }
        const p = positions[Math.floor(Math.random() * positions.length)];
        const px = p & 0xf, py = p >> 4;
        placeOnGrid(grid, px, py, len, horiz);
        blocks.push({ x: px, y: py, len, h: horiz, hero: false });
        fails = 0;
    }
    return blocks;
}

// ============================================================
// SA Mutation
// ============================================================

function mutateBlocks(blocks) {
    const nb = cloneBlocks(blocks);
    const wi = [];
    for (let i = 0; i < nb.length; i++) if (!nb[i].hero) wi.push(i);
    if (wi.length === 0) return null;

    function makeGrid(skipIdx) {
        const g = new Array(36).fill('.');
        for (let i = 0; i < nb.length; i++) {
            if (i === skipIdx) continue;
            const b = nb[i];
            if (b.h) for (let j = 0; j < b.len; j++) g[idx(b.x + j, b.y)] = 'X';
            else for (let j = 0; j < b.len; j++) g[idx(b.x, b.y + j)] = 'X';
        }
        return g;
    }

    const a = Math.random();

    if (a < 0.4) {
        // Move a wall block
        const i = wi[Math.floor(Math.random() * wi.length)];
        const b = nb[i];
        const g = makeGrid(i);
        const ps = [];
        if (b.h) {
            for (let y = 0; y < G; y++)
                for (let x = 0; x <= G - b.len; x++)
                    if (canPlace(g, x, y, b.len, true)) ps.push((y << 4) | x);
        } else {
            for (let x = 0; x < G; x++)
                for (let y = 0; y <= G - b.len; y++)
                    if (canPlace(g, x, y, b.len, false)) ps.push((y << 4) | x);
        }
        if (ps.length === 0) return null;
        const p = ps[Math.floor(Math.random() * ps.length)];
        nb[i] = { x: p & 0xf, y: p >> 4, len: b.len, h: b.h, hero: false };

    } else if (a < 0.55 && wi.length > 2) {
        // Remove a wall
        nb.splice(wi[Math.floor(Math.random() * wi.length)], 1);

    } else if (a < 0.75) {
        // Add a block
        const g = makeGrid(-1);
        const len = Math.random() < 0.55 ? 2 : 3;
        const horiz = Math.random() < 0.5;
        const ps = [];
        if (horiz) {
            for (let y = 0; y < G; y++)
                for (let x = 0; x <= G - len; x++)
                    if (canPlace(g, x, y, len, true)) ps.push((y << 4) | x);
        } else {
            for (let x = 0; x < G; x++)
                for (let y = 0; y <= G - len; y++)
                    if (canPlace(g, x, y, len, false)) ps.push((y << 4) | x);
        }
        if (ps.length === 0) return null;
        const p = ps[Math.floor(Math.random() * ps.length)];
        nb.push({ x: p & 0xf, y: p >> 4, len, h: horiz, hero: false });

    } else if (a < 0.9) {
        // Change orientation
        const i = wi[Math.floor(Math.random() * wi.length)];
        const b = nb[i];
        const g = makeGrid(i);
        if (canPlace(g, b.x, b.y, b.len, !b.h)) {
            nb[i] = { x: b.x, y: b.y, len: b.len, h: !b.h, hero: false };
        } else return null;

    } else {
        // Change size
        const i = wi[Math.floor(Math.random() * wi.length)];
        const b = nb[i];
        const nl = b.len === 2 ? 3 : 2;
        const g = makeGrid(i);
        if (canPlace(g, b.x, b.y, nl, b.h)) {
            nb[i] = { x: b.x, y: b.y, len: nl, h: b.h, hero: false };
        } else return null;
    }

    // Overlap check
    const chk = new Uint8Array(36);
    for (const b of nb) {
        for (let j = 0; j < b.len; j++) {
            const ci = b.h ? idx(b.x + j, b.y) : idx(b.x, b.y + j);
            if (ci < 0 || ci >= 36 || chk[ci]) return null;
            chk[ci] = 1;
        }
    }
    return nb;
}

// ============================================================
// Generate + Optimize
// ============================================================

function generateAndOptimize(saIterations) {
    const numBlocks = randInt(9, 13);
    const blocks = generateRandomBlocks(numBlocks);

    const initMoves = solve(blocks);
    if (initMoves <= 0) return null;

    // SA using forward solver
    let currentBlocks = cloneBlocks(blocks);
    let currentMoves = initMoves;
    let bestBlocks = cloneBlocks(blocks);
    let bestMoves = initMoves;
    let temperature = 2.0;

    for (let i = 0; i < saIterations; i++) {
        temperature *= 0.97;
        const mutated = mutateBlocks(currentBlocks);
        if (!mutated) continue;

        const moves = solve(mutated);
        if (moves <= 0) continue;

        const delta = moves - currentMoves;
        if (delta > 0 || Math.random() < Math.exp(delta / Math.max(temperature, 0.05))) {
            currentBlocks = mutated;
            currentMoves = moves;
            if (currentMoves > bestMoves) {
                bestMoves = currentMoves;
                bestBlocks = cloneBlocks(currentBlocks);
            }
        }
    }

    // Unsolver on best config
    const result = unsolve(bestBlocks);
    if (result && result.moves > 0) {
        const hero = result.blocks.find(b => b.hero);
        if (!hero) return null;
        return { grid: blocksToGrid(result.blocks), moves: result.moves, row: hero.y };
    }

    // Fallback
    const hero = bestBlocks.find(b => b.hero);
    if (!hero) return null;
    return { grid: blocksToGrid(bestBlocks), moves: bestMoves, row: hero.y };
}

// ============================================================
// Main
// ============================================================

function generate() {
    const levels = { easy: [], medium: [], hard: [], expert: [], master: [] };
    const total = Object.values(DIFF_CONFIG).reduce((s, c) => s + c.target, 0);
    let gen = 0, att = 0;
    const MAX_ATT = 500000;
    const MAX_TIME = 20 * 60 * 1000;
    const startTime = Date.now();

    console.log(`\nUnblock Me Level Generator v5 (Optimized)`);
    console.log(`==========================================`);
    const targetStr = Object.entries(DIFF_CONFIG).map(([d, c]) => `${d}:${c.target}`).join(', ');
    console.log(`Target: ${targetStr} (${total} total)\n`);

    const needed = () => Object.entries(levels).filter(([d, l]) => l.length < DIFF_CONFIG[d].target).map(([d]) => d);

    while (needed().length > 0 && att < MAX_ATT && (Date.now() - startTime) < MAX_TIME) {
        att++;
        const still = needed();
        const target = still[Math.floor(Math.random() * still.length)];

        const saIter = target === 'easy' ? 10
            : target === 'medium' ? 30
            : target === 'hard' ? 60
            : target === 'expert' ? 120
            : 200;

        const result = generateAndOptimize(saIter);
        if (!result) continue;

        let diff = null;
        for (const [d, cfg] of Object.entries(DIFF_CONFIG)) {
            if (result.moves >= cfg.min && result.moves <= cfg.max) { diff = d; break; }
        }
        if (!diff || levels[diff].length >= DIFF_CONFIG[diff].target) continue;
        if (levels[diff].some(l => l.grid === result.grid)) continue;

        levels[diff].push(result);
        gen++;

        if (gen % 10 === 0 || gen === total) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const s = Object.entries(levels).map(([d, l]) => `${d}:${l.length}`).join(' | ');
            console.log(`[${gen}/${total}] ${s} (att: ${att}, ${elapsed}s)`);
        }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\nDone! Attempts: ${att}, Time: ${elapsed}s`);
    for (const [d, l] of Object.entries(levels)) {
        console.log(`  ${d}: ${l.length} levels`);
        if (l.length > 0) {
            const mv = l.map(x => x.moves);
            console.log(`    moves: ${Math.min(...mv)}-${Math.max(...mv)}`);
        }
    }

    return levels;
}

// ============================================================
// Output
// ============================================================

function writeOutput(levels) {
    const outPath = join(__dirname, '..', 'src', 'lib', 'games', 'unblock-me', 'levels.ts');

    let o = '';
    o += `// Auto-generated Unblock Me Level Library\n`;
    o += `// Generated at: ${new Date().toISOString()}\n`;
    o += `// DO NOT EDIT - regenerate with: node scripts/generateUnblockLevels.mjs\n\n`;

    o += `export type UnblockLevel = {\n    grid: string;\n    moves: number;\n    row: number;\n};\n\n`;

    o += `export interface Block {\n`;
    o += `    id: number;\n    type: 'hero' | 'wall';\n    orientation: 'horizontal' | 'vertical';\n`;
    o += `    x: number;\n    y: number;\n    length: number;\n    color: string;\n}\n\n`;

    o += `export const BLOCK_COLORS = [\n`;
    o += `    '#b3e5fc', '#c8e6c9', '#fff9c4', '#f8bbd0', '#d1c4e9',\n`;
    o += `    '#ffe0b2', '#b2dfdb', '#f0f4c3', '#ffccbc', '#c5cae9',\n`;
    o += `    '#dcedc8', '#ffecb3', '#e1bee7', '#b2ebf2', '#d7ccc8',\n`;
    o += `];\n\nexport const HERO_COLOR = '#ef9a9a';\n\n`;

    o += `export function parseLevel(level: UnblockLevel): Block[] {\n`;
    o += `    const grid: string[][] = [];\n`;
    o += `    for (let r = 0; r < 6; r++) grid.push(level.grid.slice(r * 6, (r + 1) * 6).split(''));\n`;
    o += `    const seen = new Set<string>();\n`;
    o += `    const blocks: Block[] = [];\n`;
    o += `    let ci = 0;\n`;
    o += `    for (let r = 0; r < 6; r++) {\n`;
    o += `        for (let c = 0; c < 6; c++) {\n`;
    o += `            const ch = grid[r][c];\n`;
    o += `            if (ch === '.' || seen.has(ch)) continue;\n`;
    o += `            seen.add(ch);\n`;
    o += `            const cells: {r:number;c:number}[] = [];\n`;
    o += `            for (let rr = 0; rr < 6; rr++) for (let cc = 0; cc < 6; cc++) if (grid[rr][cc] === ch) cells.push({r:rr,c:cc});\n`;
    o += `            const h = cells.length > 1 && cells[0].r === cells[1].r;\n`;
    o += `            blocks.push({\n`;
    o += `                id: blocks.length,\n`;
    o += `                type: ch === 'H' ? 'hero' : 'wall',\n`;
    o += `                orientation: h ? 'horizontal' : 'vertical',\n`;
    o += `                x: Math.min(...cells.map(c => c.c)),\n`;
    o += `                y: Math.min(...cells.map(c => c.r)),\n`;
    o += `                length: cells.length,\n`;
    o += `                color: ch === 'H' ? HERO_COLOR : BLOCK_COLORS[ci++ % BLOCK_COLORS.length],\n`;
    o += `            });\n`;
    o += `        }\n`;
    o += `    }\n`;
    o += `    return blocks;\n`;
    o += `}\n\n`;

    o += `export function getRandomLevel(difficulty: string): UnblockLevel {\n`;
    o += `    const pool = difficulty === 'easy' ? EASY_LEVELS\n`;
    o += `               : difficulty === 'medium' ? MEDIUM_LEVELS\n`;
    o += `               : difficulty === 'hard' ? HARD_LEVELS\n`;
    o += `               : difficulty === 'expert' ? EXPERT_LEVELS\n`;
    o += `               : MASTER_LEVELS;\n`;
    o += `    return pool[Math.floor(Math.random() * pool.length)];\n`;
    o += `}\n\n`;

    for (const [d, ls] of Object.entries(levels)) {
        o += `export const ${d.toUpperCase()}_LEVELS: UnblockLevel[] = [\n`;
        for (const l of ls) o += `    {grid:"${l.grid}",moves:${l.moves},row:${l.row}},\n`;
        o += `];\n\n`;
    }

    writeFileSync(outPath, o);
    console.log(`\nWritten: ${outPath} (${(o.length / 1024).toFixed(1)} KB)`);
}

const levels = generate();
writeOutput(levels);

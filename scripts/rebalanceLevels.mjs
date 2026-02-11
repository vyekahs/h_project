/**
 * Rebalance levels: reclassify existing 500 levels into new difficulty ranges,
 * then generate missing levels to fill each difficulty to 100.
 *
 * New ranges:
 *   easy: 5-11, medium: 12-19, hard: 20-28, expert: 29-37, master: 38+
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const G = 6;
const CHARS = 'ABCDEFGIJKLMNOPQRSTUVWXYZ';

const NEW_CONFIG = {
    easy:   { min: 5,  max: 11,  target: 100 },
    medium: { min: 12, max: 19,  target: 100 },
    hard:   { min: 20, max: 28,  target: 100 },
    expert: { min: 29, max: 37,  target: 100 },
    master: { min: 38, max: 999, target: 50 },
};

// ============================================================
// Read existing levels
// ============================================================
const levelsPath = join(__dirname, '..', 'src', 'lib', 'games', 'unblock-me', 'levels.ts');
const content = readFileSync(levelsPath, 'utf-8');

const allLevels = [];
const re = /\{grid:"([^"]+)",moves:(\d+),row:(\d+)\}/g;
let m;
while ((m = re.exec(content)) !== null) {
    allLevels.push({ grid: m[1], moves: parseInt(m[2]), row: parseInt(m[3]) });
}

console.log(`\nRebalance Levels`);
console.log(`================`);
console.log(`Loaded ${allLevels.length} existing levels\n`);

// Reclassify
const levels = { easy: [], medium: [], hard: [], expert: [], master: [] };
const usedGrids = new Set();

for (const l of allLevels) {
    for (const [d, cfg] of Object.entries(NEW_CONFIG)) {
        if (l.moves >= cfg.min && l.moves <= cfg.max && levels[d].length < cfg.target) {
            if (!usedGrids.has(l.grid)) {
                levels[d].push(l);
                usedGrids.add(l.grid);
                break;
            }
        }
    }
}

console.log('After reclassification:');
for (const [d, ls] of Object.entries(levels)) {
    const needs = NEW_CONFIG[d].target - ls.length;
    console.log(`  ${d}: ${ls.length}/100 (need ${needs > 0 ? needs : 0} more)`);
}

// ============================================================
// Generator code (same as main generator)
// ============================================================

function idx(x, y) { return y * G + x; }
function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

function stateKey(blocks) {
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

function cloneBlocks(blocks) {
    const r = new Array(blocks.length);
    for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        r[i] = { x: b.x, y: b.y, len: b.len, h: b.h, hero: b.hero };
    }
    return r;
}

function cloneAndMove(blocks, bi, nx, ny) {
    const r = new Array(blocks.length);
    for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (i === bi) r[i] = { x: nx, y: ny, len: b.len, h: b.h, hero: b.hero };
        else r[i] = { x: b.x, y: b.y, len: b.len, h: b.h, hero: b.hero };
    }
    return r;
}

function blocksToGrid(blocks) {
    const grid = new Array(36).fill('.');
    let ci = 0;
    for (const b of blocks) {
        const ch = b.hero ? 'H' : CHARS[ci++];
        if (b.h) for (let i = 0; i < b.len; i++) grid[idx(b.x + i, b.y)] = ch;
        else for (let i = 0; i < b.len; i++) grid[idx(b.x, b.y + i)] = ch;
    }
    return grid.join('');
}

function isWinState(blocks) {
    for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        if (!b.hero) continue;
        if (!b.h) return false;
        const row = new Uint8Array(G);
        for (let j = 0; j < blocks.length; j++) {
            if (j === i) continue;
            const o = blocks[j];
            if (o.h) { if (o.y === b.y) for (let k = 0; k < o.len; k++) row[o.x + k] = 1; }
            else { if (o.x >= 0 && o.x < G) for (let k = 0; k < o.len; k++) { if (o.y + k === b.y) row[o.x] = 1; } }
        }
        for (let x = b.x + b.len; x < G; x++) { if (row[x]) return false; }
        return true;
    }
    return false;
}

// h3T heuristic: count blocking pieces recursively
// 1 (hero must move) + direct blockers in hero's path + indirect blockers for each
function heuristic(blocks) {
    let hi = -1;
    for (let i = 0; i < blocks.length; i++) { if (blocks[i].hero) { hi = i; break; } }
    if (hi < 0) return 999;
    const hero = blocks[hi];
    const occ = buildOcc(blocks);

    // Find direct blockers in hero's row between hero end and right edge
    const directBlockers = new Set();
    for (let x = hero.x + hero.len; x < G; x++) {
        const bi = occ[idx(x, hero.y)];
        if (bi >= 0 && bi !== hi) directBlockers.add(bi);
    }
    if (directBlockers.size === 0) return 1; // just slide hero out

    let h = 1; // 1 for hero move
    const counted = new Set();
    counted.add(hi);

    for (const dbi of directBlockers) {
        if (counted.has(dbi)) continue;
        counted.add(dbi);
        h++; // direct blocker needs to move

        // Check if this blocker (vertical) can move out of the way
        // Look for indirect blockers preventing it from moving up or down
        const db = blocks[dbi];
        if (!db.h) {
            // Vertical blocker: check if blocked above and below
            let blockedUp = false, blockedDown = false;
            // Need to move so that hero.y is not in [db.y, db.y+db.len-1]
            // Check upward: can it move up enough?
            for (let y = db.y - 1; y >= 0; y--) {
                const obi = occ[idx(db.x, y)];
                if (obi >= 0 && !counted.has(obi)) {
                    counted.add(obi);
                    h++; // indirect blocker
                    blockedUp = true;
                    break;
                } else if (obi >= 0) {
                    blockedUp = true;
                    break;
                }
            }
            // Check downward
            for (let y = db.y + db.len; y < G; y++) {
                const obi = occ[idx(db.x, y)];
                if (obi >= 0 && !counted.has(obi)) {
                    counted.add(obi);
                    h++;
                    blockedDown = true;
                    break;
                } else if (obi >= 0) {
                    blockedDown = true;
                    break;
                }
            }
        }
    }
    return h;
}

// A* solver using h3T heuristic with MinHeap
function solve(blocks) {
    let hi = -1;
    for (let i = 0; i < blocks.length; i++) { if (blocks[i].hero) { hi = i; break; } }
    if (hi < 0) return -1;

    const startKey = stateKey(blocks);
    const gScore = new Map();
    gScore.set(startKey, 0);

    // Simple priority queue (binary heap)
    const heap = []; // [fScore, state, key]

    function heapPush(item) {
        heap.push(item);
        let i = heap.length - 1;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (heap[p][0] <= heap[i][0]) break;
            [heap[p], heap[i]] = [heap[i], heap[p]];
            i = p;
        }
    }

    function heapPop() {
        if (heap.length === 1) return heap.pop();
        const top = heap[0];
        heap[0] = heap.pop();
        let i = 0;
        const n = heap.length;
        while (true) {
            let min = i;
            const l = 2 * i + 1, r = 2 * i + 2;
            if (l < n && heap[l][0] < heap[min][0]) min = l;
            if (r < n && heap[r][0] < heap[min][0]) min = r;
            if (min === i) break;
            [heap[i], heap[min]] = [heap[min], heap[i]];
            i = min;
        }
        return top;
    }

    const h0 = heuristic(blocks);
    heapPush([h0, blocks, startKey]);

    let expanded = 0;
    const MAX_EXPAND = 500000;

    while (heap.length > 0 && expanded < MAX_EXPAND) {
        const [f, st, sk] = heapPop();
        const g = gScore.get(sk);
        if (g === undefined) continue;
        if (f > g + 200) continue; // safety bound

        expanded++;
        const occ = buildOcc(st);

        for (let bi = 0; bi < st.length; bi++) {
            const b = st[bi];
            const moves = [];
            if (b.h) {
                for (let d = 1; b.x - d >= 0; d++) {
                    if (occ[idx(b.x - d, b.y)] >= 0) break;
                    moves.push([b.x - d, b.y]);
                }
                for (let d = 1; ; d++) {
                    const ex = b.x + b.len - 1 + d;
                    if (b.hero && ex >= G) return g + 1; // WIN
                    if (ex >= G) break;
                    if (occ[idx(ex, b.y)] >= 0) break;
                    moves.push([b.x + d, b.y]);
                }
            } else {
                for (let d = 1; b.y - d >= 0; d++) {
                    if (occ[idx(b.x, b.y - d)] >= 0) break;
                    moves.push([b.x, b.y - d]);
                }
                for (let d = 1; b.y + b.len - 1 + d < G; d++) {
                    if (occ[idx(b.x, b.y + b.len - 1 + d)] >= 0) break;
                    moves.push([b.x, b.y + d]);
                }
            }
            for (const [nx, ny] of moves) {
                const ns = cloneAndMove(st, bi, nx, ny);
                const nk = stateKey(ns);
                const ng = g + 1;
                const prev = gScore.get(nk);
                if (prev !== undefined && prev <= ng) continue;
                gScore.set(nk, ng);
                const h = heuristic(ns);
                heapPush([ng + h, ns, nk]);
            }
        }
    }
    return -1;
}

function unsolve(blocks, maxStates = 500000) {
    const startKey = stateKey(blocks);
    const allStates = new Map([[startKey, blocks]]);
    const adjForward = new Map();
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
                        const ns = cloneAndMove(st, bi, b.x - d, b.y); const nk = stateKey(ns);
                        neighbors.push(nk);
                        if (!allStates.has(nk)) { allStates.set(nk, ns); nextFrontier.push(nk); }
                    }
                    for (let d = 1; b.x + b.len - 1 + d < G; d++) {
                        if (occ[idx(b.x + b.len - 1 + d, b.y)] >= 0) break;
                        const ns = cloneAndMove(st, bi, b.x + d, b.y); const nk = stateKey(ns);
                        neighbors.push(nk);
                        if (!allStates.has(nk)) { allStates.set(nk, ns); nextFrontier.push(nk); }
                    }
                } else {
                    for (let d = 1; b.y - d >= 0; d++) {
                        if (occ[idx(b.x, b.y - d)] >= 0) break;
                        const ns = cloneAndMove(st, bi, b.x, b.y - d); const nk = stateKey(ns);
                        neighbors.push(nk);
                        if (!allStates.has(nk)) { allStates.set(nk, ns); nextFrontier.push(nk); }
                    }
                    for (let d = 1; b.y + b.len - 1 + d < G; d++) {
                        if (occ[idx(b.x, b.y + b.len - 1 + d)] >= 0) break;
                        const ns = cloneAndMove(st, bi, b.x, b.y + d); const nk = stateKey(ns);
                        neighbors.push(nk);
                        if (!allStates.has(nk)) { allStates.set(nk, ns); nextFrontier.push(nk); }
                    }
                }
            }
            adjForward.set(sk, neighbors);
        }
        frontier = nextFrontier;
        if (allStates.size > maxStates) break;
    }
    const winKeys = [];
    for (const [k, st] of allStates) { if (isWinState(st)) winKeys.push(k); }
    if (winKeys.length === 0) return null;
    const revAdj = new Map();
    for (const [sk, neighbors] of adjForward) {
        for (const nk of neighbors) {
            if (!revAdj.has(nk)) revAdj.set(nk, []);
            revAdj.get(nk).push(sk);
        }
    }
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

function canPlace(grid, x, y, len, horiz) {
    if (horiz) { if (x + len > G) return false; for (let i = 0; i < len; i++) if (grid[idx(x + i, y)] !== '.') return false; }
    else { if (y + len > G) return false; for (let i = 0; i < len; i++) if (grid[idx(x, y + i)] !== '.') return false; }
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
        if (horiz) { for (let y = 0; y < G; y++) for (let x = 0; x <= G - len; x++) if (canPlace(grid, x, y, len, true)) positions.push((y << 4) | x); }
        else { for (let x = 0; x < G; x++) for (let y = 0; y <= G - len; y++) if (canPlace(grid, x, y, len, false)) positions.push((y << 4) | x); }
        if (positions.length === 0) { fails++; continue; }
        const p = positions[Math.floor(Math.random() * positions.length)];
        placeOnGrid(grid, p & 0xf, p >> 4, len, horiz);
        blocks.push({ x: p & 0xf, y: p >> 4, len, h: horiz, hero: false });
        fails = 0;
    }
    return blocks;
}

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
        const i = wi[Math.floor(Math.random() * wi.length)]; const b = nb[i]; const g = makeGrid(i); const ps = [];
        if (b.h) { for (let y = 0; y < G; y++) for (let x = 0; x <= G - b.len; x++) if (canPlace(g, x, y, b.len, true)) ps.push((y << 4) | x); }
        else { for (let x = 0; x < G; x++) for (let y = 0; y <= G - b.len; y++) if (canPlace(g, x, y, b.len, false)) ps.push((y << 4) | x); }
        if (ps.length === 0) return null;
        const p = ps[Math.floor(Math.random() * ps.length)];
        nb[i] = { x: p & 0xf, y: p >> 4, len: b.len, h: b.h, hero: false };
    } else if (a < 0.55 && wi.length > 2) {
        nb.splice(wi[Math.floor(Math.random() * wi.length)], 1);
    } else if (a < 0.75) {
        const g = makeGrid(-1); const len = Math.random() < 0.55 ? 2 : 3; const horiz = Math.random() < 0.5; const ps = [];
        if (horiz) { for (let y = 0; y < G; y++) for (let x = 0; x <= G - len; x++) if (canPlace(g, x, y, len, true)) ps.push((y << 4) | x); }
        else { for (let x = 0; x < G; x++) for (let y = 0; y <= G - len; y++) if (canPlace(g, x, y, len, false)) ps.push((y << 4) | x); }
        if (ps.length === 0) return null;
        const p = ps[Math.floor(Math.random() * ps.length)];
        nb.push({ x: p & 0xf, y: p >> 4, len, h: horiz, hero: false });
    } else if (a < 0.9) {
        const i = wi[Math.floor(Math.random() * wi.length)]; const b = nb[i]; const g = makeGrid(i);
        if (canPlace(g, b.x, b.y, b.len, !b.h)) nb[i] = { x: b.x, y: b.y, len: b.len, h: !b.h, hero: false };
        else return null;
    } else {
        const i = wi[Math.floor(Math.random() * wi.length)]; const b = nb[i]; const nl = b.len === 2 ? 3 : 2; const g = makeGrid(i);
        if (canPlace(g, b.x, b.y, nl, b.h)) nb[i] = { x: b.x, y: b.y, len: nl, h: b.h, hero: false };
        else return null;
    }
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

function generateAndOptimize(targetDiff) {
    const blockRange = targetDiff === 'easy' ? [6, 9]
        : targetDiff === 'medium' ? [8, 11]
        : targetDiff === 'hard' ? [10, 13]
        : targetDiff === 'expert' ? [11, 14]
        : [12, 14];
    const numBlocks = randInt(blockRange[0], blockRange[1]);
    const blocks = generateRandomBlocks(numBlocks);
    const initMoves = solve(blocks);
    if (initMoves <= 0) return null;

    const saIter = targetDiff === 'easy' ? 30
        : targetDiff === 'medium' ? 80
        : targetDiff === 'hard' ? 200
        : targetDiff === 'expert' ? 500
        : 800;

    let currentBlocks = cloneBlocks(blocks);
    let currentMoves = initMoves;
    let bestBlocks = cloneBlocks(blocks);
    let bestMoves = initMoves;
    let temperature = 2.0;
    for (let i = 0; i < saIter; i++) {
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

    const result = unsolve(bestBlocks);
    if (result && result.moves > 0) {
        const hero = result.blocks.find(b => b.hero);
        if (!hero) return null;
        return { grid: blocksToGrid(result.blocks), moves: result.moves, row: hero.y };
    }
    const hero = bestBlocks.find(b => b.hero);
    if (!hero) return null;
    return { grid: blocksToGrid(bestBlocks), moves: bestMoves, row: hero.y };
}

// ============================================================
// Generate missing levels
// ============================================================

const needed = {};
let totalNeeded = 0;
for (const [d, ls] of Object.entries(levels)) {
    needed[d] = NEW_CONFIG[d].target - ls.length;
    if (needed[d] > 0) totalNeeded += needed[d];
}

console.log(`\nNeed to generate ${totalNeeded} more levels\n`);

const MAX_TIME = 30 * 60 * 1000;
const startTime = Date.now();
let gen = 0, att = 0;

const stillNeeded = () => Object.entries(needed).filter(([d, n]) => n > 0).map(([d]) => d);

while (stillNeeded().length > 0 && (Date.now() - startTime) < MAX_TIME) {
    att++;
    const targets = stillNeeded();
    const target = targets[Math.floor(Math.random() * targets.length)];

    const result = generateAndOptimize(target);
    if (!result) continue;

    // Check if it fits any needed difficulty
    let placed = false;
    for (const [d, cfg] of Object.entries(NEW_CONFIG)) {
        if (needed[d] <= 0) continue;
        if (result.moves >= cfg.min && result.moves <= cfg.max && !usedGrids.has(result.grid)) {
            levels[d].push(result);
            usedGrids.add(result.grid);
            needed[d]--;
            gen++;
            placed = true;

            if (gen % 5 === 0) {
                const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                const s = Object.entries(levels).map(([d, l]) => `${d}:${l.length}`).join(' | ');
                console.log(`[+${gen}] ${s} (att: ${att}, ${elapsed}s)`);
            }
            break;
        }
    }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\nDone! Generated ${gen} new levels in ${elapsed}s (${att} attempts)`);

// ============================================================
// Write output
// ============================================================

console.log('\nFinal counts:');
for (const [d, ls] of Object.entries(levels)) {
    const mv = ls.map(x => x.moves).sort((a, b) => a - b);
    console.log(`  ${d}: ${ls.length} levels  range=${mv[0]}-${mv[mv.length - 1]}  avg=${(mv.reduce((a, b) => a + b, 0) / mv.length).toFixed(1)}`);
}

// Write the full levels.ts file
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

writeFileSync(levelsPath, o);
console.log(`\nWritten: ${levelsPath} (${(o.length / 1024).toFixed(1)} KB)`);

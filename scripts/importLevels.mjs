/**
 * Import levels from Rust generator JSON into levels.ts
 *
 * Usage: node scripts/importLevels.mjs <json-file> [--replace]
 *   --replace: Replace all levels (default: append/merge)
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const jsonFile = args.find(a => !a.startsWith('--'));
const replaceMode = args.includes('--replace');

if (!jsonFile) {
    console.error('Usage: node scripts/importLevels.mjs <json-file> [--replace]');
    process.exit(1);
}

const CONFIG = {
    easy:   { min: 5,  max: 11 },
    medium: { min: 12, max: 19 },
    hard:   { min: 20, max: 28 },
    expert: { min: 29, max: 37 },
    master: { min: 38, max: 999 },
};

// Read existing levels
const levelsPath = join(__dirname, '..', 'src', 'lib', 'games', 'unblock-me', 'levels.ts');
const content = readFileSync(levelsPath, 'utf-8');

const existing = { easy: [], medium: [], hard: [], expert: [], master: [] };
const usedGrids = new Set();

if (!replaceMode) {
    const re = /\{grid:"([^"]+)",moves:(\d+),row:(\d+)\}/g;
    let m;
    while ((m = re.exec(content)) !== null) {
        const level = { grid: m[1], moves: parseInt(m[2]), row: parseInt(m[3]) };
        usedGrids.add(level.grid);
        for (const [d, cfg] of Object.entries(CONFIG)) {
            if (level.moves >= cfg.min && level.moves <= cfg.max) {
                existing[d].push(level);
                break;
            }
        }
    }
    console.log('Existing levels:');
    for (const [d, ls] of Object.entries(existing)) {
        console.log(`  ${d}: ${ls.length}`);
    }
}

// Read new levels from JSON
const newLevels = JSON.parse(readFileSync(jsonFile, 'utf-8'));
console.log(`\nNew levels from ${jsonFile}: ${newLevels.length}`);

// Merge
let added = 0;
for (const level of newLevels) {
    if (usedGrids.has(level.grid)) continue;
    for (const [d, cfg] of Object.entries(CONFIG)) {
        if (level.moves >= cfg.min && level.moves <= cfg.max) {
            existing[d].push(level);
            usedGrids.add(level.grid);
            added++;
            break;
        }
    }
}
console.log(`Added ${added} new levels (${newLevels.length - added} duplicates skipped)`);

// Write output
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

for (const [d, ls] of Object.entries(existing)) {
    o += `export const ${d.toUpperCase()}_LEVELS: UnblockLevel[] = [\n`;
    for (const l of ls) o += `    {grid:"${l.grid}",moves:${l.moves},row:${l.row}},\n`;
    o += `];\n\n`;
}

writeFileSync(levelsPath, o);
const totalLevels = Object.values(existing).reduce((sum, ls) => sum + ls.length, 0);
console.log(`\nFinal counts:`);
for (const [d, ls] of Object.entries(existing)) {
    const mv = ls.map(x => x.moves).sort((a, b) => a - b);
    console.log(`  ${d}: ${ls.length} levels  range=${mv[0]}-${mv[mv.length - 1]}`);
}
console.log(`\nTotal: ${totalLevels} levels`);
console.log(`Written: ${levelsPath} (${(o.length / 1024).toFixed(1)} KB)`);

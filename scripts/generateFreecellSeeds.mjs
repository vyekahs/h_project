/**
 * Freecell Seed Classifier (Classic)
 *
 * Analyzes freecell deals in classic (alternating color) mode.
 * Classifies by difficulty based on solver move count.
 *
 * Output: seeds.ts with 5 difficulty tiers.
 *
 * Usage: node scripts/generateFreecellSeeds.mjs [startSeed] [endSeed]
 * Default: 1 to 15000
 */

// ─── Card Types & Helpers ───

const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const SUIT_INDEX = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };
const SUIT_COLOR = { spades: 'black', hearts: 'red', diamonds: 'red', clubs: 'black' };

function createDeck() {
	const deck = [];
	for (const suit of SUITS) {
		for (let v = 1; v <= 13; v++) {
			deck.push({
				id: SUIT_INDEX[suit] * 13 + (v - 1),
				suit,
				value: v
			});
		}
	}
	return deck;
}

function msRandom(seed) {
	seed = (seed * 214013 + 2531011) & 0x7fffffff;
	const value = (seed >> 16) & 0x7fff;
	return { value, nextSeed: seed };
}

function dealCards(seed) {
	const deck = createDeck();
	let currentSeed = seed;
	for (let i = deck.length - 1; i > 0; i--) {
		const result = msRandom(currentSeed);
		currentSeed = result.nextSeed;
		const j = result.value % (i + 1);
		[deck[i], deck[j]] = [deck[j], deck[i]];
	}
	const tableau = Array.from({ length: 8 }, () => []);
	for (let i = 0; i < deck.length; i++) {
		tableau[i % 8].push(deck[i]);
	}
	return {
		tableau,
		freeCells: [null, null, null, null],
		foundations: [[], [], [], []]
	};
}

// ─── Solver Helpers ───

function isOppositeColor(a, b) {
	return SUIT_COLOR[a.suit] !== SUIT_COLOR[b.suit];
}

function canMoveToFoundation(card, foundations) {
	const fIdx = SUIT_INDEX[card.suit];
	const pile = foundations[fIdx];
	if (pile.length === 0) return card.value === 1 ? fIdx : null;
	return pile[pile.length - 1].suit === card.suit && card.value === pile[pile.length - 1].value + 1
		? fIdx
		: null;
}

function canMoveToTableau(card, column) {
	if (column.length === 0) return true;
	const top = column[column.length - 1];
	return isOppositeColor(card, top) && card.value === top.value - 1;
}

function hashState(state) {
	const fc = state.freeCells
		.map((c) => (c ? c.id : -1))
		.sort((a, b) => a - b)
		.join(',');
	const fn = state.foundations.map((f) => f.length).join(',');
	const tb = state.tableau.map((col) => col.map((c) => c.id).join('.')).join('|');
	return `${fc};${fn};${tb}`;
}

function cloneState(state) {
	return {
		tableau: state.tableau.map((col) => [...col]),
		freeCells: [...state.freeCells],
		foundations: state.foundations.map((f) => [...f])
	};
}

function getMaxMovableCards(state, excludeCol) {
	const emptyFC = state.freeCells.filter((c) => c === null).length;
	let emptyCols = 0;
	for (let i = 0; i < 8; i++) {
		if (i !== excludeCol && state.tableau[i].length === 0) emptyCols++;
	}
	return (1 + emptyFC) * Math.pow(2, emptyCols);
}

// ─── Greedy DFS Solver ───

function isSafeForFoundation(card, foundations) {
	if (canMoveToFoundation(card, foundations) === null) return false;
	if (card.value <= 2) return true;
	const neededValue = card.value - 1;
	for (let i = 0; i < 4; i++) {
		const suit = SUITS[i];
		const isOppositeSuit =
			(SUIT_COLOR[card.suit] === 'black' && SUIT_COLOR[suit] === 'red') ||
			(SUIT_COLOR[card.suit] === 'red' && SUIT_COLOR[suit] === 'black');
		if (isOppositeSuit) {
			const topVal = foundations[i].length > 0 ? foundations[i][foundations[i].length - 1].value : 0;
			if (topVal < neededValue) return false;
		}
	}
	return true;
}

function autoMoveToFoundations(state) {
	let moves = 0;
	let changed = true;
	while (changed) {
		changed = false;
		for (let i = 0; i < 4; i++) {
			const card = state.freeCells[i];
			if (!card) continue;
			if (isSafeForFoundation(card, state.foundations)) {
				const fIdx = canMoveToFoundation(card, state.foundations);
				state.foundations[fIdx].push(card);
				state.freeCells[i] = null;
				moves++;
				changed = true;
			}
		}
		for (let col = 0; col < 8; col++) {
			const column = state.tableau[col];
			if (column.length === 0) continue;
			const card = column[column.length - 1];
			if (isSafeForFoundation(card, state.foundations)) {
				const fIdx = canMoveToFoundation(card, state.foundations);
				state.foundations[fIdx].push(card);
				column.pop();
				moves++;
				changed = true;
			}
		}
	}
	return moves;
}

function solve(seed, maxNodes = 300000) {
	const initial = dealCards(seed);
	autoMoveToFoundations(initial);

	const onFoundation = initial.foundations.reduce((s, f) => s + f.length, 0);
	if (onFoundation === 52) return 0;

	const visited = new Set();
	visited.add(hashState(initial));

	const queue = [{ state: initial, moves: 0 }];
	let explored = 0;

	while (queue.length > 0 && explored < maxNodes) {
		let bestIdx = 0;
		let bestScore = -1;
		for (let i = Math.max(0, queue.length - 500); i < queue.length; i++) {
			const s = queue[i].state;
			const score =
				s.foundations.reduce((sum, f) => sum + f.length, 0) * 1000 - queue[i].moves;
			if (score > bestScore) {
				bestScore = score;
				bestIdx = i;
			}
		}

		const { state, moves } = queue[bestIdx];
		queue[bestIdx] = queue[queue.length - 1];
		queue.pop();
		explored++;

		const nextMoves = [];

		// Tableau → Tableau
		for (let fromCol = 0; fromCol < 8; fromCol++) {
			const column = state.tableau[fromCol];
			if (column.length === 0) continue;

			let seqLen = 1;
			for (let i = column.length - 1; i > 0; i--) {
				if (isOppositeColor(column[i], column[i - 1]) && column[i].value === column[i - 1].value - 1) {
					seqLen++;
				} else break;
			}

			for (let toCol = 0; toCol < 8; toCol++) {
				if (toCol === fromCol) continue;
				const dest = state.tableau[toCol];

				for (let count = 1; count <= seqLen; count++) {
					const cardIdx = column.length - count;
					const card = column[cardIdx];

					if (dest.length === 0) {
						if (count === column.length) continue;
						const max = getMaxMovableCards(state, toCol);
						if (count > max) continue;
						nextMoves.push({ fromType: 'tab', fromIdx: fromCol, toType: 'tab', toIdx: toCol, count });
						break;
					} else {
						if (!canMoveToTableau(card, dest)) continue;
						const max = getMaxMovableCards(state);
						if (count > max) continue;
						nextMoves.push({ fromType: 'tab', fromIdx: fromCol, toType: 'tab', toIdx: toCol, count });
						break;
					}
				}
			}
		}

		// Tableau → FreeCell
		const emptyFC = state.freeCells.indexOf(null);
		if (emptyFC >= 0) {
			for (let col = 0; col < 8; col++) {
				if (state.tableau[col].length === 0) continue;
				nextMoves.push({ fromType: 'tab', fromIdx: col, toType: 'fc', toIdx: emptyFC, count: 1 });
			}
		}

		// FreeCell → Tableau
		for (let i = 0; i < 4; i++) {
			const card = state.freeCells[i];
			if (!card) continue;
			let movedToEmpty = false;
			for (let col = 0; col < 8; col++) {
				if (state.tableau[col].length === 0) {
					if (!movedToEmpty) {
						nextMoves.push({ fromType: 'fc', fromIdx: i, toType: 'tab', toIdx: col, count: 1 });
						movedToEmpty = true;
					}
				} else if (canMoveToTableau(card, state.tableau[col])) {
					nextMoves.push({ fromType: 'fc', fromIdx: i, toType: 'tab', toIdx: col, count: 1 });
				}
			}
		}

		for (const mv of nextMoves) {
			const newState = cloneState(state);

			let cards;
			if (mv.fromType === 'tab') {
				const col = newState.tableau[mv.fromIdx];
				cards = col.splice(col.length - mv.count, mv.count);
			} else {
				cards = [newState.freeCells[mv.fromIdx]];
				newState.freeCells[mv.fromIdx] = null;
			}

			if (mv.toType === 'tab') {
				newState.tableau[mv.toIdx].push(...cards);
			} else if (mv.toType === 'fc') {
				newState.freeCells[mv.toIdx] = cards[0];
			}

			const autoMvs = autoMoveToFoundations(newState);
			const totalMoves = moves + 1 + autoMvs;

			const totalOnFoundation = newState.foundations.reduce((s, f) => s + f.length, 0);
			if (totalOnFoundation === 52) return totalMoves;

			const hash = hashState(newState);
			if (visited.has(hash)) continue;
			visited.add(hash);

			queue.push({ state: newState, moves: totalMoves });
		}

		if (queue.length > 80000) {
			queue.sort(
				(a, b) =>
					b.state.foundations.reduce((s, f) => s + f.length, 0) -
					a.state.foundations.reduce((s, f) => s + f.length, 0)
			);
			queue.length = 40000;
		}
	}

	return -1;
}

// ─── Main ───

const startSeed = parseInt(process.argv[2]) || 1;
const endSeed = parseInt(process.argv[3]) || 15000;
const total = endSeed - startSeed + 1;

console.log(`Analyzing seeds ${startSeed} to ${endSeed} in classic mode...`);

const results = [];
let solvable = 0, unsolvable = 0;

for (let seed = startSeed; seed <= endSeed; seed++) {
	const moves = solve(seed, 200000);
	if (moves >= 0) {
		results.push({ seed, moves });
		solvable++;
	} else {
		unsolvable++;
	}

	if (seed % 100 === 0) {
		console.log(
			`  Progress: ${seed - startSeed + 1}/${total} | solvable: ${solvable}/${solvable + unsolvable}`
		);
	}
}

console.log(`\nClassic: ${solvable} solvable, ${unsolvable} unsolvable`);

// Sort by move count
results.sort((a, b) => a.moves - b.moves);

// 5 tiers
const perTier = Math.floor(results.length / 5);
const tiers = {
	easy: results.slice(0, perTier).map((r) => r.seed),
	medium: results.slice(perTier, perTier * 2).map((r) => r.seed),
	hard: results.slice(perTier * 2, perTier * 3).map((r) => r.seed),
	expert: results.slice(perTier * 3, perTier * 4).map((r) => r.seed),
	master: results.slice(perTier * 4).map((r) => r.seed)
};

// Print stats
for (const [tier, seeds] of Object.entries(tiers)) {
	const tierResults = results.filter((r) => seeds.includes(r.seed));
	if (tierResults.length === 0) continue;
	const minMoves = Math.min(...tierResults.map((r) => r.moves));
	const maxMoves = Math.max(...tierResults.map((r) => r.moves));
	const avgMoves = Math.round(tierResults.reduce((s, r) => s + r.moves, 0) / tierResults.length);
	console.log(`  ${tier}: ${seeds.length} seeds, moves ${minMoves}-${maxMoves} (avg: ${avgMoves})`);
}

// Output as TypeScript
const output = `// Auto-generated by scripts/generateFreecellSeeds.mjs
// ${solvable} solvable seeds (classic mode)

export const SEEDS: Record<string, number[]> = {
	easy: [${tiers.easy.join(', ')}],
	medium: [${tiers.medium.join(', ')}],
	hard: [${tiers.hard.join(', ')}],
	expert: [${tiers.expert.join(', ')}],
	master: [${tiers.master.join(', ')}]
};
`;

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = join(__dirname, '..', 'src', 'lib', 'games', 'freecell', 'seeds.ts');
writeFileSync(outputPath, output);
console.log(`\nSeeds written to ${outputPath}`);

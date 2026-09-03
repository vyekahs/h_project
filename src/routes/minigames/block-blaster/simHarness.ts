/**
 * 블럭블라스터 플러스 — 측정용 시뮬레이션 하네스.
 *
 * 실제 게임 로직(gameLogic.svelte.ts)을 그대로 구동하고, 사람이 하던 판단만
 * 휴리스틱 AI가 대신한다. 밸런스를 코드 읽기가 아니라 실측으로 확인하기 위한 도구.
 *
 * 대기 시간 제거: 배너/게임오버 전환이 setTimeout으로 걸려 있어 전역 setTimeout을
 * 0으로 클램프한다(티츄 하네스와 동일 기법). 게임 로직 자체는 건드리지 않는다.
 */
import { createBlockBlasterGame } from './gameLogic.svelte';
import { GRID_SIZE, type BoardGrid, type BlockShape, type CellColor } from '$lib/games/block-blaster/types';
import { canPlaceBlock, placeBlock, findCompletedLines } from '$lib/games/block-blaster/gameLogic';
import { isPassive } from '$lib/games/block-blaster/abilities';

export type Game = ReturnType<typeof createBlockBlasterGame>;

/** 전역 setTimeout 지연을 0으로 클램프. 반환 함수로 원복. */
export function clampTimers(): () => void {
	const real = globalThis.setTimeout;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(globalThis as any).setTimeout = (fn: (...a: unknown[]) => void, _ms?: number, ...args: unknown[]) =>
		real(fn, 0, ...args);
	return () => { (globalThis as { setTimeout: typeof real }).setTimeout = real; };
}

// ===== 배치 평가 휴리스틱 =====

function countEmpty(g: BoardGrid): number {
	let n = 0;
	for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) if (g[r][c] === 0) n++;
	return n;
}

/**
 * 열린 공간의 응집도 — 빈 셀의 상하좌우 빈 이웃 수 합.
 * 높을수록 큰 블록이 들어갈 여지가 남아 있다는 뜻(구멍이 잘게 쪼개지지 않음).
 */
function openness(g: BoardGrid): number {
	let s = 0;
	for (let r = 0; r < GRID_SIZE; r++) {
		for (let c = 0; c < GRID_SIZE; c++) {
			if (g[r][c] !== 0) continue;
			if (r > 0 && g[r - 1][c] === 0) s++;
			if (r < GRID_SIZE - 1 && g[r + 1][c] === 0) s++;
			if (c > 0 && g[r][c - 1] === 0) s++;
			if (c < GRID_SIZE - 1 && g[r][c + 1] === 0) s++;
		}
	}
	return s;
}

/** 위험이 점거한 셀 좌표 집합 (미해결 + 활성 위험만) */
function dangerCellSet(game: Game): Set<string> {
	const out = new Set<string>();
	const ds = game.currentDangerStage;
	if (!ds) return out;
	for (const d of ds.dangers) {
		if (d.resolved) continue;
		if (d.delayTurns > 0) continue;
		for (const [r, c] of d.cells) out.add(`${r},${c}`);
	}
	return out;
}

/** 위험이 걸린 줄/열 — 그 줄을 지우면 위험 해결에 기여 */
function dangerLines(game: Game): { rows: Set<number>; cols: Set<number> } {
	const rows = new Set<number>();
	const cols = new Set<number>();
	const ds = game.currentDangerStage;
	if (!ds) return { rows, cols };
	for (const d of ds.dangers) {
		if (d.resolved || d.delayTurns > 0) continue;
		if (d.type === 'doom-row') rows.add(d.cells[0][0]);
		else if (d.type === 'doom-col') cols.add(d.cells[0][1]);
	}
	return { rows, cols };
}

interface Move { blockIndex: number; row: number; col: number; score: number }

/**
 * 최선의 배치를 고른다.
 * 우선순위: 위험 줄 제거 > 일반 줄 제거 > 열린 공간 유지 > 위험 셀 회피.
 */
export function chooseMove(game: Game): Move | null {
	const grid = game.grid as BoardGrid;
	const blocks = game.currentBlocks;
	const dCells = dangerCellSet(game);
	const { rows: dRows, cols: dCols } = dangerLines(game);
	const urgent = !!game.currentDangerStage;

	let best: Move | null = null;

	for (let bi = 0; bi < blocks.length; bi++) {
		const block = blocks[bi];
		if (!block) continue;
		if (game.isSlotLocked(bi)) continue;

		for (let r = 0; r < GRID_SIZE; r++) {
			for (let c = 0; c < GRID_SIZE; c++) {
				if (!canPlaceBlock(grid, block as BlockShape, r, c)) continue;

				const after = placeBlock(grid, block as BlockShape, r, c);
				const { rows, cols } = findCompletedLines(after);
				const clearedLines = rows.length + cols.length;

				// 줄 제거 후 보드 상태
				const cleared: BoardGrid = after.map(row => [...row]) as BoardGrid;
				for (const rr of rows) for (let cc = 0; cc < GRID_SIZE; cc++) cleared[rr][cc] = 0;
				for (const cc of cols) for (let rr = 0; rr < GRID_SIZE; rr++) cleared[rr][cc] = 0;

				let s = 0;
				// 줄 제거는 항상 최우선
				s += clearedLines * 1000;
				// 위험이 걸린 줄/열을 제거하면 위험 해결 → 스테이지 진행
				const dangerRowsCleared = rows.filter(rr => dRows.has(rr)).length;
				const dangerColsCleared = cols.filter(cc => dCols.has(cc)).length;
				s += (dangerRowsCleared + dangerColsCleared) * 3000;
				// reinforced/spreading 등 위험 셀을 덮는 배치는 불가하므로,
				// 위험 줄 위에 블록을 채워 완성에 가까워지는 것을 소폭 보상
				let onDangerLine = 0;
				for (const [dr, dc] of (block as BlockShape).cells) {
					if (dRows.has(r + dr)) onDangerLine++;
					if (dCols.has(c + dc)) onDangerLine++;
				}
				// doom 줄/열은 **전체가 비어야** 해결된다(isDangerResolved). 즉 그 줄을 꽉 채워
				// 라인 완성으로 지우는 것이 유일한 자력 해결 수단이므로, 빈 칸을 메우는
				// 진행도를 강하게 보상한다. 카운트가 임박할수록 가중치를 올린다.
				for (const dr2 of dRows) {
					let beforeEmpty = 0, afterEmpty = 0;
					for (let cc = 0; cc < GRID_SIZE; cc++) {
						if (grid[dr2][cc] === 0) beforeEmpty++;
						if (after[dr2][cc] === 0) afterEmpty++;
					}
					s += (beforeEmpty - afterEmpty) * 300;
				}
				for (const dc2 of dCols) {
					let beforeEmpty = 0, afterEmpty = 0;
					for (let rr = 0; rr < GRID_SIZE; rr++) {
						if (grid[rr][dc2] === 0) beforeEmpty++;
						if (after[rr][dc2] === 0) afterEmpty++;
					}
					s += (beforeEmpty - afterEmpty) * 300;
				}
				s += onDangerLine * (urgent ? 40 : 5);
				// 열린 공간 유지
				s += openness(cleared) * 2;
				s += countEmpty(cleared) * 3;
				// 위험 셀 근처는 나중에 지우기 어려우므로 소폭 회피
				for (const [dr, dc] of (block as BlockShape).cells) {
					if (dCells.has(`${r + dr},${c + dc}`)) s -= 50;
				}

				if (!best || s > best.score) best = { blockIndex: bi, row: r, col: c, score: s };
			}
		}
	}
	return best;
}

/** 능력을 쓸 만한 상황인지 판단하고 사용. 사용했으면 true. */
function tryUseAbility(game: Game, stuck: boolean): boolean {
	const inv = game.inventory;
	const usable: number[] = [];
	for (let i = 0; i < inv.length; i++) {
		const o = inv[i];
		if (isPassive(o.ability)) continue;
		if (o.cooldownRemaining > 0) continue;
		usable.push(i);
	}
	if (usable.length === 0) return false;

	const ds = game.currentDangerStage;
	const { rows: dRows, cols: dCols } = dangerLines(game);
	const grid = game.grid as BoardGrid;

	// 막혔거나, 위험 카운트가 임박했을 때만 사용 (평시 낭비 방지)
	const imminent = !!ds && ds.dangers.some(
		d => !d.resolved && d.delayTurns === 0 && d.countdown <= 2 &&
			(d.type === 'doom-row' || d.type === 'doom-col')
	);
	if (!stuck && !imminent) return false;

	const dCells = dangerCellSet(game);

	// JAM(고장) 대응 — 트레이의 불량 블록은 보드 능력으로는 손댈 수 없고
	// swap-block / rotate-block 같은 조작 계열만 해소할 수 있다.
	const jamIdx = game.currentBlocks.findIndex((b, i) => !!b?.jamId && !game.isSlotLocked(i));
	if (jamIdx >= 0) {
		for (const si of usable) {
			const id = inv[si].ability.id;
			if (id !== 'swap-block' && id !== 'rotate-block') continue;
			const cdBefore = inv[si].cooldownRemaining;
			game.useAbility(si);
			if (game.pendingAbilitySlot !== si && inv[si].cooldownRemaining === cdBefore) continue;
			game.applyAbilityToTarget({ kind: 'block', index: jamIdx });
			return true;
		}
	}

	// 위험 줄을 직접 지울 수 있는 능력 우선
	for (const si of usable) {
		const id = inv[si].ability.id;
		// doom이 아니어도 위험 셀이 몰린 줄/열이 있으면 그쪽을 정리
		if ((id === 'clear-row' || id === 'clear-col') && dRows.size === 0 && dCols.size === 0 && dCells.size > 0) {
			let bestIdx = 0, bestN = -1;
			for (let i = 0; i < GRID_SIZE; i++) {
				let n = 0;
				for (let j = 0; j < GRID_SIZE; j++) {
					if (dCells.has(id === 'clear-row' ? `${i},${j}` : `${j},${i}`)) n++;
				}
				if (n > bestN) { bestN = n; bestIdx = i; }
			}
			if (bestN > 0) {
				game.useAbility(si);
				game.applyAbilityToTarget(id === 'clear-row'
					? { kind: 'cell', row: bestIdx, col: 0 }
					: { kind: 'cell', row: 0, col: bestIdx });
				return true;
			}
		}
		if (id === 'clear-row' && dRows.size > 0) {
			game.useAbility(si);
			game.applyAbilityToTarget({ kind: 'cell', row: [...dRows][0], col: 0 });
			return true;
		}
		if (id === 'clear-col' && dCols.size > 0) {
			game.useAbility(si);
			game.applyAbilityToTarget({ kind: 'cell', row: 0, col: [...dCols][0] });
			return true;
		}
	}

	// 그 외: 가장 꽉 찬 영역을 정리하는 쪽으로
	for (const si of usable) {
		const ab = inv[si].ability;
		const cdBefore = inv[si].cooldownRemaining;
		game.useAbility(si);
		// useAbility에는 모바일 더블탭 방지용 "동일 슬롯 250ms 내 중복 호출 무시" 가드가
		// 있다. 시뮬레이션은 그보다 훨씬 빠르게 반복 호출하므로 무시당한 채 true를
		// 반환하면 같은 슬롯을 영원히 재시도하는 무한 루프가 된다(실측 stall 6.7%).
		// 실제로 소비됐는지(쿨다운 증가 또는 타겟 대기 진입) 확인하고, 아니면 건너뛴다.
		const consumed = game.pendingAbilitySlot === si || inv[si].cooldownRemaining !== cdBefore;
		if (!consumed) continue;
		if (ab.targetType === 'row') {
			let bestR = 0, bestN = -1;
			for (let r = 0; r < GRID_SIZE; r++) {
				let n = 0;
				for (let c = 0; c < GRID_SIZE; c++) if (grid[r][c] !== 0) n++;
				if (n > bestN) { bestN = n; bestR = r; }
			}
			game.applyAbilityToTarget({ kind: 'cell', row: bestR, col: 0 });
		} else if (ab.targetType === 'col') {
			let bestC = 0, bestN = -1;
			for (let c = 0; c < GRID_SIZE; c++) {
				let n = 0;
				for (let r = 0; r < GRID_SIZE; r++) if (grid[r][c] !== 0) n++;
				if (n > bestN) { bestN = n; bestC = c; }
			}
			game.applyAbilityToTarget({ kind: 'cell', row: 0, col: bestC });
		} else if (ab.targetType === 'cell') {
			// 폭탄류는 위험 셀을 최대한 덮는 중심을 고른다. 위험이 없으면 가장 꽉 찬 곳.
			// (이 분기가 없으면 폭탄이 위험 해결에 전혀 기여하지 못해, clear-row/col만
			//  위험 대응 수단인 것처럼 측정되어 능력 격차가 과장된다.)
			const dc0 = dangerCellSet(game);
			let bestR = 1, bestC = 1, bestScore = -1;
			for (let r = 1; r < GRID_SIZE - 1; r++) {
				for (let c = 1; c < GRID_SIZE - 1; c++) {
					let filled = 0, dangerHit = 0;
					for (let dr = -1; dr <= 1; dr++) {
						for (let dc2 = -1; dc2 <= 1; dc2++) {
							const rr = r + dr, cc = c + dc2;
							if (grid[rr][cc] !== 0) filled++;
							if (dc0.has(`${rr},${cc}`)) dangerHit++;
						}
					}
					const sc = dangerHit * 100 + filled;
					if (sc > bestScore) { bestScore = sc; bestR = r; bestC = c; }
				}
			}
			game.applyAbilityToTarget({ kind: 'cell', row: bestR, col: bestC });
		} else if (ab.targetType === 'block') {
			const idx = game.currentBlocks.findIndex((b, i) => b !== null && !game.isSlotLocked(i));
			if (idx >= 0) game.applyAbilityToTarget({ kind: 'block', index: idx });
			else game.cancelPendingAbility();
		}
		// instant 계열은 useAbility에서 바로 pending 모달이 열리거나 즉시 발동됨
		return true;
	}
	return false;
}

export type DraftPolicy = 'clear-first' | 'random' | 'no-clear';

/** 열려 있는 모달을 자동으로 닫는다. 처리했으면 true. */
function resolveModals(game: Game, draftPolicy: DraftPolicy): boolean {
	if (game.pendingDangerIntro) { game.dismissDangerIntro(); return true; }
	if (game.alertMessage) { game.alertMessage = null; return true; }
	if (game.confirmMessage) { game.handleConfirm(true); return true; }

	if (game.pendingDraftOptions) {
		const opts = game.pendingDraftOptions;
		if (opts.length === 0) return true;
		// clear-first: 위기 탈출 능력 우선 / random: 편향 없는 무작위(능력 가치 측정용)
		const rank = (id: string) =>
			id === 'clear-row' || id === 'clear-col' ? 0 :
			id === 'bomb-3x3' || id === 'clear-color' ? 1 :
			id === 'revive' ? 2 : 3;
		// 리롤 — 정책이 원하는 카드가 후보에 없으면 한 번 다시 뽑는다(사람도 그렇게 쓴다).
		const isClearCard = (id: string) => id === 'clear-row' || id === 'clear-col';
		if (game.rerollsRemaining > 0) {
			const wantReroll =
				(draftPolicy === 'clear-first' && !opts.some(o => isClearCard(o.id))) ||
				(draftPolicy === 'no-clear' && opts.every(o => isClearCard(o.id)));
			if (wantReroll) {
				game.rerollDraft();
				return true;
			}
		}

		// no-clear: clear-row/col을 절대 뽑지 않는다 — "정답 카드 없이도 이길 수 있는가"를
		// 직접 재기 위한 정책(기획 리뷰에서 제안된 지표). 후보가 전부 clear면 어쩔 수 없이 뽑음.
		let pool = opts;
		if (draftPolicy === 'no-clear') {
			const filtered = opts.filter(o => o.id !== 'clear-row' && o.id !== 'clear-col');
			if (filtered.length > 0) pool = filtered;
		}
		const pick = draftPolicy === 'clear-first'
			? [...pool].sort((a, b) => rank(a.id) - rank(b.id))[0]
			: pool[Math.floor(Math.random() * pool.length)];
		game.pickAbility(pick);
		return true;
	}
	if (game.pendingDiscardForAbility) { game.discardSlotForAbility(game.inventory.length - 1); return true; }
	if (game.pendingTransform) { game.pickTransform(game.pendingTransform.options[0]); return true; }
	if (game.pendingSwap) { game.pickSwap(game.pendingSwap.options[0]); return true; }
	if (game.pendingDraw) {
		const n = game.pendingDraw.cellCount;
		const cells: [number, number][] = n >= 3 ? [[0, 0], [0, 1], [0, 2]] : n === 2 ? [[0, 0], [0, 1]] : [[0, 0]];
		game.confirmDrawnBlock(cells, 1 as CellColor);
		return true;
	}
	if (game.pendingColorChoose) {
		const colors = new Set<CellColor>();
		for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
			const v = game.grid[r][c];
			if (v !== 0) colors.add(v as CellColor);
		}
		const lv = game.pendingColorChoose.level;
		game.confirmClearColor([...colors].slice(0, lv));
		return true;
	}

	// 능력 대기 상태 해제 — 반드시 위의 모든 pending 모달 처리 뒤에 와야 한다.
	// useAbility가 타겟 대기(pendingAbilitySlot) 상태로 진입했는데 유효한 타겟을
	// 못 주면 그대로 갇힌다. 이 상태에서는 placeBlockAt이 블록 배치가 아니라
	// 능력 타겟 적용으로 라우팅되므로, AI는 배치했다고 믿지만 보드는 그대로여서
	// 진행이 멈춘다(실측 stall 6.7%, 전부 rotate-block 보유 판).
	if (game.pendingAbilitySlot !== null) {
		game.cancelPendingAbility();
		return true;
	}
	return false;
}

export interface RunResult {
	score: number;
	stagesCleared: number;
	cleared: boolean;
	turns: number;
	gameOverReason: string | null;
	abilitiesTaken: { id: string; level: number }[];
	/** 스테이지별로 몇 턴 만에 도달했는지 (index = stagesCleared 값) */
	stageTurn: number[];
	stalled: boolean;
	/** 종료 시점에 활성 상태(미해결)였던 위험 종류 */
	dangersAtDeath: string[];
	/** 게임 전체에서 등장한 위험 종류별 횟수 */
	dangersSeen: Record<string, number>;
	/** 등장한 위험 중 **플레이어가 실제로 해결한** 횟수 */
	dangersResolved: Record<string, number>;
	/** 등장한 위험 중 카운트 만료로 끝난 횟수 (크레딧 없음 = 실패) */
	dangersExpired: Record<string, number>;
	/**
	 * 매 턴 "놓을 수 있는 자리 수"의 중앙값 / 보드 점유율 최댓값.
	 * AI 실력과 무관한 순수 상태 지표라 난이도 프록시로 가장 신뢰할 만하다
	 * (클리어율은 AI 실력에 크게 의존한다).
	 */
	medianLegalMoves: number;
	maxOccupancy: number;
}

/**
 * 한 판을 끝까지 시뮬레이션.
 *
 * 반드시 async — 게임의 상태 전환(isAnimating 해제, 클리어 배너, 드래프트 오픈,
 * 게임오버 확정)이 전부 setTimeout으로 걸려 있어서, 동기 루프로 돌리면 콜백이
 * 영원히 실행되지 않고 isAnimating이 켜진 채 모든 입력이 막힌다.
 * 매 반복마다 이벤트 루프에 양보해 타이머를 흘려보낸다.
 */
export interface RunOptions {
	mode?: 'classic' | 'special';
	draftPolicy?: DraftPolicy;
	maxTurns?: number;
}

export async function runGame(opts: RunOptions = {}): Promise<RunResult> {
	const mode = opts.mode ?? 'special';
	const draftPolicy = opts.draftPolicy ?? 'clear-first';
	const maxTurns = opts.maxTurns ?? 3000;
	// 배치 없이 흘러간 반복 횟수 상한(모달 처리·애니메이션 대기·능력 사용 포함).
	// 시작 드래프트 도입 이후 평균 게임 길이가 60→97턴으로 늘면서 500으로는
	// 드물게(약 1/7) 정상 게임을 stall로 오판했다.
	const IDLE_LIMIT = 3000;
	const game = createBlockBlasterGame();
	game.startGame(mode);
	game.stopTimer(); // 타이머 불필요

	let turns = 0;
	let idle = 0;
	const stageTurn: number[] = [];
	let lastStages = 0;
	const legalMoveCounts: number[] = [];
	let maxOccupancy = 0;
	const dangersSeen: Record<string, number> = {};
	const dangersResolved: Record<string, number> = {};
	const dangersExpired: Record<string, number> = {};
	const trackedDangerIds = new Set<string>();
	const endedDangerIds = new Set<string>();

	const trackDangers = () => {
		const cur = game.currentDangerStage;
		if (!cur) return;
		for (const d of cur.dangers) {
			if (d.delayTurns > 0) continue;
			if (!trackedDangerIds.has(d.id)) {
				trackedDangerIds.add(d.id);
				dangersSeen[d.type] = (dangersSeen[d.type] ?? 0) + 1;
			}
			if (d.resolved && !endedDangerIds.has(d.id)) {
				endedDangerIds.add(d.id);
				// 만료(실패)와 해결을 반드시 구분해야 한다 — 예전에는 둘 다 resolved라
				// 해결률이 87~97%로 보였지만 실제로는 실패 경로가 없었을 뿐이다.
				if (d.expired) dangersExpired[d.type] = (dangersExpired[d.type] ?? 0) + 1;
				else dangersResolved[d.type] = (dangersResolved[d.type] ?? 0) + 1;
			}
		}
	};

	while (game.gameState === 'playing' && turns < maxTurns) {
		await new Promise(r => setTimeout(r, 0));
		if (game.isAnimating) { idle++; if (idle > IDLE_LIMIT) break; continue; }
		if (resolveModals(game, draftPolicy)) { idle++; if (idle > IDLE_LIMIT) break; continue; }

		trackDangers();

		if (game.stagesCleared > lastStages) {
			for (let s = lastStages; s < game.stagesCleared; s++) stageTurn.push(turns);
			lastStages = game.stagesCleared;
		}

		const mv = chooseMove(game);
		if (!mv) {
			// 놓을 곳이 없음 — 능력으로 탈출 시도
			if (tryUseAbility(game, true)) { idle++; if (idle > IDLE_LIMIT) break; continue; }
			// 능력도 없으면 afterPlace가 setTimeout으로 게임오버를 예약해둔 상태다.
			// 타이머가 실제로 발동해 gameState가 'finished'가 될 때까지 기다린다.
			// (30에서 끊었더니 사망이 gameOverReason 없는 'unknown'으로 집계돼
			//  종료 사유 분포가 최대 18%까지 왜곡됐다.)
			idle++;
			if (idle > 200) break;
			continue;
		}

		// 위험이 임박하면 능력을 먼저 쓸지 판단
		if (tryUseAbility(game, false)) { idle++; if (idle > IDLE_LIMIT) break; continue; }

		// 상태 지표 수집 — 이 턴에 놓을 수 있었던 자리 수와 보드 점유율
		{
			let legal = 0;
			const g = game.grid as BoardGrid;
			for (let bi = 0; bi < game.currentBlocks.length; bi++) {
				const b = game.currentBlocks[bi];
				if (!b || game.isSlotLocked(bi)) continue;
				for (let r = 0; r < GRID_SIZE; r++)
					for (let c = 0; c < GRID_SIZE; c++)
						if (canPlaceBlock(g, b as BlockShape, r, c)) legal++;
			}
			legalMoveCounts.push(legal);
			const occ = (GRID_SIZE * GRID_SIZE - countEmpty(g)) / (GRID_SIZE * GRID_SIZE);
			if (occ > maxOccupancy) maxOccupancy = occ;
		}

		game.selectBlock(mv.blockIndex);
		const before = game.score;
		game.placeBlockAt(mv.row, mv.col);
		void before;
		idle = 0;
		turns++;
	}

	// 종료 시점 활성 위험
	const dangersAtDeath: string[] = [];
	const ds = game.currentDangerStage;
	if (ds) {
		for (const d of ds.dangers) {
			if (d.resolved || d.delayTurns > 0) continue;
			dangersAtDeath.push(d.type);
		}
	}

	// 예약된 게임오버 처리 대기 (clampTimers 하에서는 즉시)
	const inv = game.inventory.map(o => ({ id: o.ability.id, level: o.level }));
	const res: RunResult = {
		score: game.score,
		stagesCleared: game.stagesCleared,
		cleared: game.isCleared,
		turns,
		gameOverReason: game.gameOverReason,
		abilitiesTaken: inv,
		stageTurn,
		stalled: turns >= maxTurns || idle > IDLE_LIMIT,
		dangersAtDeath,
		dangersSeen,
		dangersResolved,
		dangersExpired,
		medianLegalMoves: legalMoveCounts.length
			? [...legalMoveCounts].sort((a, b) => a - b)[Math.floor(legalMoveCounts.length / 2)]
			: 0,
		maxOccupancy
	};
	game.stopTimer();
	return res;
}

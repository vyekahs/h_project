import { GAME_CONFIG } from '$lib/config';
import {
	createEmptyGrid,
	cloneGrid,
	canPlaceBlock,
	placeBlock,
	findCompletedLines,
	calculateScore,
	canPlaceAnyBlock
} from '$lib/games/block-blaster/gameLogic';
import { generateBlockSet } from '$lib/games/block-blaster/blocks';
import {
	generateDangerStage,
	isDangerResolved,
	isDoomTriggered
} from '$lib/games/block-blaster/danger';
import {
	ABILITY_POOL,
	drawAbilities,
	computeCooldown,
	findOwned,
	getLevelOf,
	hasOwned,
	isPassive,
	INVENTORY_SLOTS,
	MAX_LEVEL,
	MAX_STAGE,
	reviveCooldown,
	type Ability,
	type OwnedAbility
} from '$lib/games/block-blaster/abilities';
import {
	GRID_SIZE,
	cellKey,
	type BoardGrid,
	type BlockShape,
	type CellColor,
	type CellMetaMap,
	type Danger,
	type DangerStage
} from '$lib/games/block-blaster/types';
import { formatTime, trackGameStart } from '$lib/games/utils';
import { rankUpStore } from '$lib/stores/rankUpStore.svelte';

export type GameState = 'start' | 'playing' | 'paused' | 'finished';
export type GameMode = 'classic' | 'special';
export type AbilityFxKind = 'bomb' | 'beam-row' | 'beam-col' | 'color' | 'nuke';
export interface AbilityFx {
	kind: AbilityFxKind;
	cells: [number, number][];
	epicenter?: [number, number];
}

/**
 * rotate-block용 — 레벨에 따라 가능한 모든 변형 후보를 반환.
 * Lv1: 원본 + 90도, Lv2: + 180도, 270도, Lv3: + 좌우 반전, 상하 반전.
 * 중복 모양은 자동 제거.
 */
export function getBlockTransforms(block: BlockShape, level: number): BlockShape[] {
	const normalize = (cells: [number, number][]): [number, number][] => {
		let minR = Infinity, minC = Infinity;
		for (const [r, c] of cells) {
			if (r < minR) minR = r;
			if (c < minC) minC = c;
		}
		return cells.map(([r, c]) => [r - minR, c - minC] as [number, number]);
	};
	const key = (cells: [number, number][]) =>
		normalize(cells).map(([r, c]) => `${r},${c}`).sort().join('|');
	const rotate90 = (cells: [number, number][]): [number, number][] => {
		let maxR = 0;
		for (const [r] of cells) if (r > maxR) maxR = r;
		return cells.map(([r, c]) => [c, maxR - r] as [number, number]);
	};
	const flipH = (cells: [number, number][]): [number, number][] => {
		let maxC = 0;
		for (const [, c] of cells) if (c > maxC) maxC = c;
		return cells.map(([r, c]) => [r, maxC - c] as [number, number]);
	};
	const flipV = (cells: [number, number][]): [number, number][] => {
		let maxR = 0;
		for (const [r] of cells) if (r > maxR) maxR = r;
		return cells.map(([r, c]) => [maxR - r, c] as [number, number]);
	};

	const candidates: [number, number][][] = [];
	candidates.push(block.cells);
	if (level >= 1) candidates.push(rotate90(block.cells));
	if (level >= 2) {
		candidates.push(rotate90(rotate90(block.cells)));
		candidates.push(rotate90(rotate90(rotate90(block.cells))));
	}
	if (level >= 3) {
		candidates.push(flipH(block.cells));
		candidates.push(flipV(block.cells));
	}

	// 중복 제거 — 정사각형이나 대칭 모양은 회전해도 같음
	const seen = new Set<string>();
	const out: BlockShape[] = [];
	for (const cells of candidates) {
		const k = key(cells);
		if (seen.has(k)) continue;
		seen.add(k);
		out.push({ cells: normalize(cells), color: block.color });
	}
	return out;
}

/**
 * 능력 발동 시 영향 받을 셀 좌표 — 드래그 미리보기용.
 * 빈 셀도 포함(범위 자체를 보여주기 위함). clear-color는 같은 색만.
 */
export function computeAbilityPreview(
	grid: BoardGrid,
	ability: Ability,
	level: number,
	row: number,
	col: number
): [number, number][] {
	const cells: [number, number][] = [];
	switch (ability.id) {
		case 'clear-row': {
			// 선택한 줄 + 아래쪽으로 (level - 1)줄 추가
			for (let i = 0; i < level; i++) {
				const r = row + i;
				if (r < 0 || r >= GRID_SIZE) continue;
				for (let c = 0; c < GRID_SIZE; c++) cells.push([r, c]);
			}
			break;
		}
		case 'clear-col': {
			// 선택한 열 + 오른쪽으로 (level - 1)열 추가
			for (let i = 0; i < level; i++) {
				const c = col + i;
				if (c < 0 || c >= GRID_SIZE) continue;
				for (let r = 0; r < GRID_SIZE; r++) cells.push([r, c]);
			}
			break;
		}
		case 'bomb-3x3': {
			const size = 2 + level;
			const half = Math.floor((size - 1) / 2);
			for (let dr = -half; dr < size - half; dr++) {
				for (let dc = -half; dc < size - half; dc++) {
					const r = row + dr;
					const c = col + dc;
					if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) cells.push([r, c]);
				}
			}
			break;
		}
		case 'clear-color': {
			const targetColor = grid[row]?.[col];
			if (!targetColor) return [];
			const colors: number[] = [targetColor];
			if (level >= 2 && targetColor > 1) colors.push(targetColor - 1);
			if (level >= 3 && targetColor < 5) colors.push(targetColor + 1);
			for (let r = 0; r < GRID_SIZE; r++) {
				for (let c = 0; c < GRID_SIZE; c++) {
					if (colors.includes(grid[r][c])) cells.push([r, c]);
				}
			}
			break;
		}
	}
	return cells;
}

export { formatTime };

interface GridSnapshot {
	grid: BoardGrid;
	currentBlocks: (BlockShape | null)[];
}

export function createBlockBlasterGame() {
	// Game state
	let gameState: GameState = $state('start');
	let gameMode: GameMode = $state('classic');
	let grid: BoardGrid = $state(createEmptyGrid());
	let score = $state(0);
	let currentBlocks: (BlockShape | null)[] = $state([]);
	let selectedBlockIndex: number | null = $state(null);
	let linesCleared = $state(0);
	let combo = $state(0);
	let maxCombo = $state(0);

	// Special mode
	let inventory: OwnedAbility[] = $state([]);
	let linesClearedSinceLastDraft = $state(0); // 평시에서 다음 위험 스테이지까지 누적 라인 수
	let draftCount = $state(0);
	/** 위험 스테이지 진행 카운터 — 0 시작, 클리어할 때마다 +1, MAX_STAGE 도달 시 게임 클리어 */
	let stagesCleared = $state(0);
	/** 다음 위험 스테이지 번호 (1~10). 평시일 때 = 다음에 진입할 번호, 위험 중일 때 = 진행 중 번호 */
	let stage = $state(1);
	/** 평시 ↔ 위험 사이클 — null이면 평시, 객체이면 위험 스테이지 진행 중 */
	let currentDangerStage: DangerStage | null = $state(null);
	/** 막 인트로 표시용 — 'act-1' ... 'act-4' 또는 null. 표시 후 자동 클리어 */
	let pendingActIntro: number | null = $state(null);
	/** 위험 스테이지 인트로 표시용 — 표시 직후 자동 클리어 */
	let pendingDangerIntro = $state(false);
	let pendingDraftOptions: Ability[] | null = $state(null);
	let pendingAbilitySlot: number | null = $state(null); // 타겟 대기 중인 액티브 슬롯
	let pendingDiscardForAbility: Ability | null = $state(null); // 슬롯 풀일 때 새 능력 등록 대기
	let lastSnapshots: GridSnapshot[] = $state([]); // undo 스택, 최대 3
	let nextBlocksQueue: BlockShape[][] = $state([]); // peek-next용 큐
	/** 위험 클리어 시 보너스 드래프트 횟수 (9~10 스테이지 추가 보너스용) */
	let bonusDraftsRemaining = $state(0);
	/** 셀별 메타데이터 — 위험 셀(petrified), 강화 블록(hp) */
	let cellMeta: CellMetaMap = $state({});

	// rotate-block 변형 선택 모달 상태
	let pendingTransform: {
		slotIndex: number;
		blockIndex: number;
		options: BlockShape[];
	} | null = $state(null);

	// swap-block 교체 모달 상태 — Lv2/Lv3는 후보 중에서 선택
	let pendingSwap: {
		slotIndex: number;
		blockIndex: number;
		options: BlockShape[];
		maxPick: number; // 한 번에 선택 가능한 최대 개수 (= level)
	} | null = $state(null);

	// single-cell 그리기 모달 상태 (Lv2/Lv3)
	let pendingDraw: {
		slotIndex: number;
		cellCount: number;
	} | null = $state(null);

	// clear-color 색 선택 모달 상태
	let pendingColorChoose: {
		slotIndex: number;
		level: number;
		availableColors: CellColor[];
	} | null = $state(null);

	// 능력으로 제거되는 셀 이펙트 마커 — Board가 읽어서 애니메이션 적용
	let abilityFx: AbilityFx | null = $state(null);

	function triggerAbilityFx(kind: AbilityFxKind, cells: [number, number][], epicenter?: [number, number]) {
		// 같은 프레임에 새 이펙트가 들어오면 즉시 교체되도록 null로 초기화 후 다음 틱에 설정
		abilityFx = null;
		setTimeout(() => {
			abilityFx = { kind, cells, epicenter };
		}, 0);
		setTimeout(() => {
			abilityFx = null;
		}, 700);
	}

	function collectFilledCells(
		predicate: (r: number, c: number) => boolean
	): [number, number][] {
		const out: [number, number][] = [];
		for (let r = 0; r < GRID_SIZE; r++) {
			for (let c = 0; c < GRID_SIZE; c++) {
				if (grid[r][c] !== 0 && predicate(r, c)) out.push([r, c]);
			}
		}
		return out;
	}

	function previewAbilityCells(
		ability: Ability,
		level: number,
		row: number,
		col: number
	): [number, number][] {
		return computeAbilityPreview(grid, ability, level, row, col);
	}

	// Timer
	let timerValue = 0;
	let displayTimer = $state(0);
	let timerInterval: any;

	// UI state
	let hasRestarted = $state(false);

	// Modals
	let alertMessage: string | null = $state(null);
	let confirmMessage: string | null = $state(null);
	let confirmCallback: (() => void) | null = null;

	// Score submission
	let calculatedScore = $state(0);
	let newTitleName = $state<string | null>(null);
	let showVisitPrompt = $state(false);

	// Animation state
	let lastPlacedCells: [number, number][] = $state([]);
	let clearingRows: number[] = $state([]);
	let clearingCols: number[] = $state([]);
	let isAnimating = $state(false);

	// =========================================================================
	// Helpers
	// =========================================================================

	function showAlert(msg: string) {
		alertMessage = msg;
	}

	function showConfirm(msg: string, cb: () => void) {
		confirmMessage = msg;
		confirmCallback = cb;
	}

	function handleConfirm(yes: boolean) {
		if (yes && confirmCallback) confirmCallback();
		confirmMessage = null;
		confirmCallback = null;
	}

	function isSpecialMode(): boolean {
		return gameMode === 'special';
	}

	function getExtraSlotLevel(): number {
		return getLevelOf(inventory, 'extra-slot');
	}

	function getTraySize(): number {
		return 3 + getExtraSlotLevel();
	}

	function generateTraySet(): BlockShape[] {
		// generateBlockSet은 항상 3개 반환 → 트레이 크기에 맞춰 보충
		const target = getTraySize();
		const out = generateBlockSet();
		while (out.length < target) {
			out.push(...generateBlockSet());
		}
		return out.slice(0, target);
	}

	function refillNextBlocksQueue() {
		if (!isSpecialMode()) return;
		const lvl = getLevelOf(inventory, 'peek-next');
		// Lv1: 1세트, Lv2: 2세트, Lv3: 3세트를 미리 생성
		while (nextBlocksQueue.length < lvl) {
			nextBlocksQueue.push(generateTraySet());
		}
	}

	/**
	 * peek-next 패시브가 보여주는 다음 블록들 (평탄화)
	 * Lv1: 다음 1세트 전체
	 * Lv2: 다음 2세트
	 * Lv3: 다음 3세트
	 */
	function getPeekBlocks(): BlockShape[] {
		const lvl = getLevelOf(inventory, 'peek-next');
		if (lvl === 0 || nextBlocksQueue.length === 0) return [];
		const out: BlockShape[] = [];
		for (let i = 0; i < lvl && i < nextBlocksQueue.length; i++) {
			out.push(...nextBlocksQueue[i]);
		}
		return out;
	}

	function popOrGenerateNextSet(): BlockShape[] {
		if (nextBlocksQueue.length > 0) {
			const next = nextBlocksQueue.shift()!;
			refillNextBlocksQueue();
			return next;
		}
		return generateTraySet();
	}

	/** 트레이에 블록 추가 — 빈 슬롯이 있으면 거기에, 없으면 끝에 push (트레이 확장) */
	function addBlockToTray(block: BlockShape) {
		const next = [...currentBlocks];
		const emptyIdx = next.findIndex(b => b === null);
		if (emptyIdx !== -1) {
			next[emptyIdx] = block;
		} else {
			next.push(block);
		}
		currentBlocks = next;
	}

	function snapshotState() {
		lastSnapshots.push({
			grid: cloneGrid(grid),
			currentBlocks: currentBlocks.map(b => (b ? { ...b, cells: b.cells.map(c => [...c] as [number, number]) } : null))
		});
		if (lastSnapshots.length > 3) lastSnapshots.shift();
	}

	function tickCooldowns() {
		for (const o of inventory) {
			if (o.cooldownRemaining > 0) o.cooldownRemaining--;
		}
	}

	// =========================================================================
	// Timer
	// =========================================================================

	function startTimer() {
		clearInterval(timerInterval);
		timerInterval = setInterval(() => {
			if (
				gameState === 'playing' &&
				!alertMessage &&
				!confirmMessage &&
				!pendingDraftOptions &&
				!pendingDiscardForAbility
			) {
				timerValue++;
				displayTimer = timerValue;
				if (timerValue % 5 === 0) {
					saveGame();
				}
			}
		}, 1000);
	}

	function stopTimer() {
		clearInterval(timerInterval);
	}

	// =========================================================================
	// Save / Load
	// =========================================================================

	function saveGame() {
		if (gameState !== 'playing') return;
		try {
			const data = {
				gameMode,
				grid,
				score,
				currentBlocks,
				selectedBlockIndex,
				linesCleared,
				combo,
				maxCombo,
				timer: timerValue,
				hasRestarted,
				// special mode fields
				inventory,
				linesClearedSinceLastDraft,
				draftCount,
				stage,
				stagesCleared,
				currentDangerStage,
				bonusDraftsRemaining,
				cellMeta,
				lastSnapshots,
				nextBlocksQueue,
				// pending modal/action states — 새로고침 후에도 진행 가능하도록
				pendingDraftOptions,
				pendingDiscardForAbility,
				pendingTransform,
				pendingSwap,
				pendingDraw,
				pendingColorChoose
			};
			localStorage.setItem('block_blaster_save', JSON.stringify(data));
		} catch {}
	}

	function loadGame() {
		try {
			const raw = localStorage.getItem('block_blaster_save');
			if (!raw) {
				showAlert('저장된 게임이 없습니다.');
				return;
			}

			const data = JSON.parse(raw);
			if (!data.grid || !Array.isArray(data.grid)) {
				showAlert('저장 데이터가 손상되었습니다.');
				localStorage.removeItem('block_blaster_save');
				return;
			}

			gameMode = data.gameMode || 'classic';
			grid = data.grid;
			score = data.score || 0;
			currentBlocks = data.currentBlocks || [];
			selectedBlockIndex = data.selectedBlockIndex ?? null;
			linesCleared = data.linesCleared || 0;
			combo = data.combo || 0;
			maxCombo = data.maxCombo || 0;
			timerValue = data.timer || 0;
			displayTimer = timerValue;
			hasRestarted = data.hasRestarted || false;

			inventory = data.inventory || [];
			linesClearedSinceLastDraft = data.linesClearedSinceLastDraft || 0;
			draftCount = data.draftCount || 0;
			stage = data.stage || 1;
			stagesCleared = data.stagesCleared || 0;
			currentDangerStage = data.currentDangerStage || null;
			bonusDraftsRemaining = data.bonusDraftsRemaining || 0;
			cellMeta = data.cellMeta || {};
			lastSnapshots = data.lastSnapshots || [];
			nextBlocksQueue = data.nextBlocksQueue || [];

			// pending modal 상태 복원
			pendingDraftOptions = data.pendingDraftOptions || null;
			pendingDiscardForAbility = data.pendingDiscardForAbility || null;
			pendingTransform = data.pendingTransform || null;
			pendingSwap = data.pendingSwap || null;
			pendingDraw = data.pendingDraw || null;
			pendingColorChoose = data.pendingColorChoose || null;

			// 일시적인 애니메이션/타겟팅 상태는 리셋
			lastPlacedCells = [];
			clearingRows = [];
			clearingCols = [];
			isAnimating = false;
			pendingAbilitySlot = null;
			pendingActIntro = null;
			pendingDangerIntro = false;

			// 진행 중이던 능력 모달이 있으면 paused가 아닌 playing으로 복귀 (모달 우선 표시)
			const hasPendingAction = pendingDraftOptions !== null
				|| pendingDiscardForAbility !== null
				|| pendingTransform !== null
				|| pendingSwap !== null
				|| pendingDraw !== null
				|| pendingColorChoose !== null;
			gameState = hasPendingAction ? 'playing' : 'paused';
			startTimer();
		} catch {
			showAlert('저장 데이터를 불러올 수 없습니다.');
			localStorage.removeItem('block_blaster_save');
		}
	}

	// =========================================================================
	// Game flow
	// =========================================================================

	function startGame(mode: GameMode = 'classic') {
		gameMode = mode;
		trackGameStart('block-blaster', mode);
		localStorage.removeItem('block_blaster_save');
		grid = createEmptyGrid();
		score = 0;
		selectedBlockIndex = null;
		linesCleared = 0;
		combo = 0;
		maxCombo = 0;
		timerValue = 0;
		displayTimer = 0;
		calculatedScore = 0;
		showVisitPrompt = false;
		hasRestarted = false;
		newTitleName = null;
		lastPlacedCells = [];
		clearingRows = [];
		clearingCols = [];
		isAnimating = false;

		// Reset special-mode state (must come before generating tray so getTraySize works)
		inventory = [];
		linesClearedSinceLastDraft = 0;
		draftCount = 0;
		stage = 1;
		stagesCleared = 0;
		currentDangerStage = null;
		bonusDraftsRemaining = 0;
		cellMeta = {};
		pendingActIntro = null;
		pendingDangerIntro = false;
		lastSnapshots = [];
		nextBlocksQueue = [];
		pendingDraftOptions = null;
		pendingAbilitySlot = null;
		pendingDiscardForAbility = null;
		pendingTransform = null;
		pendingSwap = null;
		pendingDraw = null;
		pendingColorChoose = null;

		currentBlocks = generateTraySet();
		gameState = 'playing';
		startTimer();
		saveGame();
	}

	/**
	 * 트레이 슬롯이 잠겼는지 (위험 스테이지에서 가장 우측부터 N개 잠김).
	 * 다른 모달이나 능력 발동에는 영향 없음 — 일반 블록 선택만 차단.
	 */
	function isSlotLocked(index: number): boolean {
		if (!currentDangerStage) return false;
		const lockCount = currentDangerStage.lockedTraySlots;
		if (lockCount <= 0) return false;
		const traySize = currentBlocks.length;
		return index >= traySize - lockCount;
	}

	function selectBlock(index: number) {
		if (gameState !== 'playing' || isAnimating) return;
		if (pendingAbilitySlot !== null || pendingDraftOptions || pendingDiscardForAbility) return;
		if (isSlotLocked(index)) return;
		if (index < 0 || !currentBlocks[index]) {
			selectedBlockIndex = null;
			return;
		}
		selectedBlockIndex = selectedBlockIndex === index ? null : index;
	}

	function placeBlockAt(row: number, col: number) {
		if (gameState !== 'playing' || isAnimating) return;
		if (pendingAbilitySlot !== null) {
			// 타겟형 능력 발동 모드 — 일반 블록 배치 차단, 셀 타겟 처리
			applyAbilityToTarget({ kind: 'cell', row, col });
			return;
		}
		if (pendingDraftOptions || pendingDiscardForAbility) return;
		if (selectedBlockIndex === null) return;

		const block = currentBlocks[selectedBlockIndex];
		if (!block) return;

		if (!canPlaceBlock(grid, block, row, col)) return;

		// special 모드: 능력 사용을 위한 스냅샷 저장
		if (isSpecialMode()) snapshotState();

		// Place the block
		const newGrid = placeBlock(grid, block, row, col);
		const placedCells: [number, number][] = block.cells.map(([dr, dc]) => [row + dr, col + dc]);
		lastPlacedCells = placedCells;
		grid = newGrid;

		setTimeout(() => { lastPlacedCells = []; }, 200);

		// Remove from tray
		const newBlocks = [...currentBlocks];
		newBlocks[selectedBlockIndex] = null;
		currentBlocks = newBlocks;
		selectedBlockIndex = null;

		// special 모드: 블록 배치 성공 시 쿨다운 진행
		if (isSpecialMode()) tickCooldowns();

		// Check for completed lines
		const { rows, cols } = findCompletedLines(grid);
		const totalLines = rows.length + cols.length;

		if (totalLines > 0) {
			clearingRows = rows;
			clearingCols = cols;
			isAnimating = true;

			combo++;
			if (combo > maxCombo) maxCombo = combo;

			const points = calculateScore(block.cells.length, totalLines, combo);
			score += points;
			linesCleared += totalLines;

			if (isSpecialMode()) {
				linesClearedSinceLastDraft += totalLines;
			}

			setTimeout(() => {
				clearLinesWithMeta(rows, cols);
				clearingRows = [];
				clearingCols = [];
				isAnimating = false;

				if (isSpecialMode()) {
					handleSpecialTurnEnd();
				}
				saveGame();
				afterPlace();
			}, 300);
		} else {
			score += block.cells.length;
			combo = 0;
			if (isSpecialMode()) {
				handleSpecialTurnEnd();
			}
			saveGame();
			afterPlace();
		}
	}

	/**
	 * 라인 클리어 + cellMeta 후처리.
	 * - 강화 블록(hp): 영향 받으면 hp -1. hp가 남아있으면 같은 색으로 grid에 다시 채움.
	 * - petrified 셀: 라인 클리어로 자연 사라짐 (meta 제거)
	 * - 일반 셀: meta 제거(있다면)
	 */
	function clearLinesWithMeta(rows: number[], cols: number[]) {
		const affected = new Set<string>();
		for (const r of rows) {
			for (let c = 0; c < GRID_SIZE; c++) affected.add(cellKey(r, c));
		}
		for (const c of cols) {
			for (let r = 0; r < GRID_SIZE; r++) affected.add(cellKey(r, c));
		}

		const newGrid = cloneGrid(grid);
		const newMeta = { ...cellMeta };

		for (const key of affected) {
			const [r, c] = key.split(',').map(Number);
			const meta = newMeta[key];
			const color = newGrid[r][c];

			if (meta?.hp && meta.hp > 1 && color !== 0) {
				// 강화 블록 — HP 차감하고 다시 채움
				newMeta[key] = { ...meta, hp: meta.hp - 1 };
				// grid는 그대로 유지 (라인 클리어 X 효과)
				continue;
			}

			// 일반 셀 또는 강화 HP 0 도달 → 비움
			newGrid[r][c] = 0;
			delete newMeta[key];
		}

		grid = newGrid;
		cellMeta = newMeta;
	}

	/**
	 * 특수능력 모드 — 매 턴 종료 시 호출.
	 * 1) 위험 진행 중이면: 카운트다운 -1, 해결 판정, 게임오버 트리거 체크, 모두 해결되면 보상
	 * 2) 평시이면: 다음 위험 스테이지 진입 조건 체크
	 */
	function handleSpecialTurnEnd() {
		if (currentDangerStage) {
			tickAndResolveDangers();
		} else {
			tryEnterNextDangerStage();
		}
	}

	function afterPlace() {
		// Refill tray if all blocks are used
		const remaining = currentBlocks.filter(b => b !== null);
		if (remaining.length === 0) {
			currentBlocks = popOrGenerateNextSet();
		}

		// Check game over — special 모드에서는 사용 가능한 액티브 스킬이 있으면 보류
		if (!canPlaceAnyBlock(grid, currentBlocks)) {
			if (hasUsableActiveAbility()) {
				// 능력으로 탈출 가능 — 게임오버 보류 (안내 모달 없음)
				return;
			}
			isAnimating = true;
			setTimeout(() => {
				handleGameOver();
			}, 800);
		}
	}

	function hasUsableActiveAbility(): boolean {
		if (!isSpecialMode()) return false;
		// 쿨다운 0인 액티브 스킬이 1개라도 있으면 위기 탈출 가능
		return inventory.some(
			o => !isPassive(o.ability) && o.cooldownRemaining === 0
		);
	}

	function handleGameOver() {
		// special 모드 — revive 자동 발동 (쿨다운 0일 때만)
		if (isSpecialMode()) {
			const revive = findOwned(inventory, 'revive');
			if (revive && revive.cooldownRemaining === 0) {
				const reviveLevel = revive.level;
				// 보드 정리: Lv1 50%, Lv2 70%, Lv3 100%
				const ratio = reviveLevel === 3 ? 1 : reviveLevel === 2 ? 0.7 : 0.5;
				clearRandomCells(ratio);
				// 트레이도 새로 채워줌
				currentBlocks = popOrGenerateNextSet();
				// 쿨다운 설정 — 레벨에 따라 단축 (Lv1: 30턴, Lv2: 25턴, Lv3: 20턴)
				revive.cooldownRemaining = reviveCooldown(reviveLevel);
				isAnimating = false;
				saveGame();
				return;
			}
		}

		localStorage.removeItem('block_blaster_save');
		gameState = 'finished';
		stopTimer();
		if (!hasRestarted) {
			submitScore();
		}
	}

	function clearRandomCells(ratio: number) {
		const filled: [number, number][] = [];
		for (let r = 0; r < GRID_SIZE; r++) {
			for (let c = 0; c < GRID_SIZE; c++) {
				if (grid[r][c] !== 0) filled.push([r, c]);
			}
		}
		const removeCount = Math.floor(filled.length * ratio);
		// shuffle filled
		for (let i = filled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[filled[i], filled[j]] = [filled[j], filled[i]];
		}
		const next = cloneGrid(grid);
		for (let i = 0; i < removeCount; i++) {
			const [r, c] = filled[i];
			next[r][c] = 0;
		}
		grid = next;
	}

	async function submitScore() {
		try {
			const res = await fetch('/api/game/record', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					gameId: 'block-blaster',
					difficulty: gameMode,
					clearTime: timerValue,
					score,
					mistakes: 0,
					skipReward: !GAME_CONFIG.ENABLE_REWARDS
				})
			});
			const data = await res.json();
			if (res.ok) {
				calculatedScore = data.score;

				if (data.currentRank && (!data.previousRank || data.currentRank < data.previousRank)) {
					rankUpStore.show(data.previousRank, data.currentRank, 'block-blaster', data.score);
				}

				if (data.newTitles && data.newTitles.length > 0) {
					newTitleName = data.newTitles[0];
				}
			} else if (res.status === 401 || res.status === 403) {
				showVisitPrompt = true;
			}
		} catch (e) {
			console.error('Failed to submit score', e);
		}
	}

	function pauseGame() {
		gameState = 'paused';
	}

	function resumeGame() {
		gameState = 'playing';
	}

	function restartGame() {
		showConfirm('처음부터 다시 시작하시겠습니까?', () => {
			stopTimer();
			const mode = gameMode;
			startGame(mode);
		});
	}

	// =========================================================================
	// Special Mode — Draft / Abilities
	// =========================================================================

	// =========================================================================
	// Special Mode — 위험 사이클 시스템 (1단계: doom-row/doom-col)
	// =========================================================================

	/** 평시에서 다음 위험 스테이지 진입을 위해 필요한 라인 클리어 수 */
	const LINES_TO_NEXT_DANGER = 5;

	/** 큰 막(act) 결정 — stage 기반 */
	function getActForStage(s: number): number {
		if (s <= 2) return 1; // 기
		if (s <= 5) return 2; // 승
		if (s <= 8) return 3; // 전
		return 4; // 결
	}

	/**
	 * 평시에서 라인 누적이 임계값에 도달하면 다음 위험 스테이지로 진입 시도.
	 */
	function tryEnterNextDangerStage() {
		if (linesClearedSinceLastDraft < LINES_TO_NEXT_DANGER) return;
		linesClearedSinceLastDraft = 0;
		enterDangerStage();
	}

	/**
	 * 위험 스테이지 진입 — 보드에 위험 등장, 트레이 잠금, 인트로 표시.
	 */
	function enterDangerStage() {
		const stageNumber = stagesCleared + 1;
		// 막 인트로는 새 막이 시작되는 첫 위험 스테이지(1, 3, 6, 9)에서만
		const newAct = getActForStage(stageNumber);
		const prevAct = stageNumber === 1 ? 0 : getActForStage(stageNumber - 1);
		if (newAct !== prevAct) {
			pendingActIntro = newAct;
			setTimeout(() => { pendingActIntro = null; }, 800);
		}

		stage = stageNumber;
		currentDangerStage = generateDangerStage(stageNumber, grid);

		// 위험 진입 시 보드에 즉시 배치되는 위험 처리
		// - reinforced: 강화 블록 (회색 + HP)
		// - spreading: 근원 셀 (보라/특수 색 + spreadOrigin 마커)
		const next = cloneGrid(grid);
		const nextMeta = { ...cellMeta };
		for (const d of currentDangerStage.dangers) {
			if (d.type === 'reinforced') {
				const [r, c] = d.cells[0];
				if (next[r][c] === 0) {
					next[r][c] = 5 as CellColor;
					nextMeta[cellKey(r, c)] = { hp: stageNumber <= 5 ? 2 : 3 };
				}
			} else if (d.type === 'spreading') {
				const [r, c] = d.cells[0];
				if (next[r][c] === 0) {
					next[r][c] = 5 as CellColor;
					nextMeta[cellKey(r, c)] = { spreadOrigin: true };
				}
			}
		}
		grid = next;
		cellMeta = nextMeta;

		pendingDangerIntro = true;
		setTimeout(() => { pendingDangerIntro = false; }, 600);
		saveGame();
	}

	/**
	 * 위험 진행 중 매 턴 — 카운트다운 -1 + 해결 판정 + 게임오버 트리거 체크 + 모두 해결 시 보상.
	 */
	function tickAndResolveDangers() {
		if (!currentDangerStage) return;
		const ds = currentDangerStage;

		// 1) 해결 판정 (블록 배치/라인 클리어로 자연 해결됐는지)
		for (const d of ds.dangers) {
			if (!d.resolved && isDangerResolved(d, grid)) {
				d.resolved = true;
				score += 200; // 위험 1개 해결 보너스
				// 카운트가 1 이상 남았는데 해결 = 긴박 보너스 (reinforced는 카운트 의미 없음)
				if (d.type !== 'reinforced' && d.type !== 'spreading' && d.countdown > 1) score += 100;
				// 트레이 잠금 1개 해제 (가장 우측부터)
				if (ds.lockedTraySlots > 0) ds.lockedTraySlots--;

				// spreading 해결 시 — 자식 셀들도 모두 함께 사라짐
				if (d.type === 'spreading') {
					const origin = d.cells[0];
					const next = cloneGrid(grid);
					const nextMeta = { ...cellMeta };
					for (const [k, m] of Object.entries(nextMeta)) {
						if (m.spreadParent && m.spreadParent[0] === origin[0] && m.spreadParent[1] === origin[1]) {
							const [r, c] = k.split(',').map(Number);
							next[r][c] = 0;
							delete nextMeta[k];
						}
					}
					grid = next;
					cellMeta = nextMeta;
				}
			}
		}

		// 2) 모두 해결됐으면 보상 (드래프트 + 평시 복귀)
		if (ds.dangers.every(d => d.resolved)) {
			finishDangerStage();
			return;
		}

		// 3) 카운트다운 -1 (해결 안 된 위험만)
		for (const d of ds.dangers) {
			if (d.resolved) continue;
			if (d.type === 'reinforced') continue; // reinforced는 HP로 해결
			d.countdown = Math.max(0, d.countdown - 1);
		}

		// 4) 카운트 0 도달 처리
		for (const d of ds.dangers) {
			if (d.resolved) continue;
			if (isDoomTriggered(d, grid)) {
				// 게임오버 줄 — 즉시 게임오버
				setTimeout(() => handleGameOver(), 400);
				return;
			}
			if (d.type === 'hazard-zone' && d.countdown === 0) {
				// 위험 구역 카운트 0 — 영역의 채워진 셀들을 petrified로 변환
				const nextMeta = { ...cellMeta };
				for (const [r, c] of d.cells) {
					if (grid[r][c] !== 0) {
						nextMeta[cellKey(r, c)] = { ...nextMeta[cellKey(r, c)], petrified: true };
					}
				}
				cellMeta = nextMeta;
				d.resolved = true; // 만료 처리(보너스 없음)
			}
			if (d.type === 'spreading' && d.countdown === 0) {
				// 증식 활성화 — 인접 빈 셀 1곳으로 증식 후 카운트 리셋
				spreadOnce(d);
				d.countdown = d.initialCountdown;
			}
		}
	}

	/**
	 * 증식 블록 — 모든 spreading 자식 셀을 포함해 인접 빈 셀 1곳으로 증식.
	 * 더 이상 증식 가능한 자리가 없으면 아무 작업 안 함.
	 */
	function spreadOnce(d: Danger) {
		const origin: [number, number] = d.cells[0];
		// 자식 셀 좌표 모음 (cellMeta에서 이 origin을 부모로 가진 셀들)
		const family: [number, number][] = [origin];
		for (const [k, m] of Object.entries(cellMeta)) {
			if (m.spreadParent && m.spreadParent[0] === origin[0] && m.spreadParent[1] === origin[1]) {
				const [r, c] = k.split(',').map(Number);
				family.push([r, c]);
			}
		}

		// 가족 셀들의 인접 빈 셀 후보 수집
		const candidates: [number, number][] = [];
		const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
		for (const [r, c] of family) {
			for (const [dr, dc] of dirs) {
				const nr = r + dr;
				const nc = c + dc;
				if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
				if (grid[nr][nc] !== 0) continue;
				candidates.push([nr, nc]);
			}
		}
		if (candidates.length === 0) return;

		const [nr, nc] = candidates[Math.floor(Math.random() * candidates.length)];
		const next = cloneGrid(grid);
		next[nr][nc] = 5 as CellColor;
		grid = next;
		cellMeta = {
			...cellMeta,
			[cellKey(nr, nc)]: { spreadParent: origin }
		};
	}

	/**
	 * 위험 스테이지 종료 — 클리어 보상 + 다음 평시로 복귀.
	 */
	function finishDangerStage() {
		if (!currentDangerStage) return;
		const stageNumber = currentDangerStage.stageNumber;
		stagesCleared = stageNumber;

		// 9~10 스테이지 보너스 드래프트
		if (stageNumber >= 9) {
			bonusDraftsRemaining += 1;
		}

		// 위험 종료 — 트레이 잠금 해제, currentDangerStage null
		currentDangerStage = null;

		// 게임 클리어 체크
		if (stagesCleared >= MAX_STAGE) {
			handleGameClear();
			return;
		}

		// 스킬 드래프트 모달 자동 표시
		openAbilityDraft();
	}

	function openAbilityDraft() {
		const options = drawAbilities(ABILITY_POOL, inventory, 3, stage);
		if (options.length === 0) {
			// 후보 없음 — 보너스 카운터 소진하고 그냥 평시 복귀
			if (bonusDraftsRemaining > 0) bonusDraftsRemaining--;
			saveGame();
			return;
		}
		pendingDraftOptions = options;
		saveGame();
	}

	function pickAbility(ability: Ability) {
		// Lv3 만렙 가드
		const existing = findOwned(inventory, ability.id);
		if (existing) {
			if (existing.level < MAX_LEVEL) {
				existing.level = (existing.level + 1) as 1 | 2 | 3;
				// 액티브 레벨업 시 쿨다운은 즉시 단축되도록 남은 쿨다운도 -1
				if (!isPassive(ability) && existing.cooldownRemaining > 0) {
					existing.cooldownRemaining = Math.max(0, existing.cooldownRemaining - 1);
				}
			}
			afterDraftPick();
			return;
		}

		// 신규 — 슬롯 빈자리 있으면 즉시 추가
		if (inventory.length < INVENTORY_SLOTS) {
			inventory.push({
				ability,
				level: 1,
				cooldownRemaining: 0
			});
			afterDraftPick();
			return;
		}

		// 슬롯 풀 — discard 모달
		pendingDraftOptions = null;
		pendingDiscardForAbility = ability;
		saveGame();
	}

	function discardSlotForAbility(slotIndex: number) {
		if (!pendingDiscardForAbility) return;
		if (slotIndex < 0 || slotIndex >= inventory.length) return;
		const ability = pendingDiscardForAbility;
		const next = [...inventory];
		next.splice(slotIndex, 1);
		next.push({ ability, level: 1, cooldownRemaining: 0 });
		inventory = next;
		pendingDiscardForAbility = null;
		afterDraftPick();
	}

	function cancelDiscard() {
		// 사용자가 디스카드를 취소하면 새 능력 자체를 포기
		pendingDiscardForAbility = null;
		afterDraftPick();
	}

	/** 드래프트 선택 후 처리 — 보너스 드래프트 남았으면 다시 모달, 아니면 평시 복귀 */
	function afterDraftPick() {
		draftCount++;
		pendingDraftOptions = null;
		refillNextBlocksQueue();

		if (bonusDraftsRemaining > 0) {
			bonusDraftsRemaining--;
			openAbilityDraft();
			return;
		}

		saveGame();
	}

	function handleGameClear() {
		localStorage.removeItem('block_blaster_save');
		gameState = 'finished';
		stopTimer();
		isAnimating = false;
		if (!hasRestarted) {
			submitScore();
		}
	}

	// ----- Active ability use -----

	let lastUseAbilityAt = 0;
	let lastUseAbilitySlot = -1;

	function useAbility(slotIndex: number) {
		// 동일 슬롯 250ms 내 중복 호출 무시 — 모바일 더블탭/이벤트 중복 방지
		const now = Date.now();
		if (slotIndex === lastUseAbilitySlot && now - lastUseAbilityAt < 250) return;
		lastUseAbilityAt = now;
		lastUseAbilitySlot = slotIndex;

		if (gameState !== 'playing' || isAnimating) return;
		if (pendingDraftOptions || pendingDiscardForAbility) return;
		const slot = inventory[slotIndex];
		if (!slot) return;
		if (isPassive(slot.ability)) return;
		if (slot.cooldownRemaining > 0) {
			showAlert(`쿨다운 ${slot.cooldownRemaining}턴 남음`);
			return;
		}

		// 이미 같은 슬롯이 pending이면 무시
		if (pendingAbilitySlot === slotIndex) return;

		// single-cell Lv2/Lv3 — 그리기 모달 표시
		if (slot.ability.id === 'single-cell' && slot.level >= 2) {
			pendingDraw = { slotIndex, cellCount: slot.level }; // Lv2=2셀, Lv3=3셀
			saveGame();
			return;
		}

		// clear-color — 보드에 있는 색 중에서 선택
		if (slot.ability.id === 'clear-color') {
			const present = new Set<CellColor>();
			for (let r = 0; r < GRID_SIZE; r++) {
				for (let c = 0; c < GRID_SIZE; c++) {
					if (grid[r][c] !== 0) present.add(grid[r][c]);
				}
			}
			if (present.size === 0) {
				showAlert('보드에 제거할 색이 없습니다.');
				return;
			}
			const availableColors = Array.from(present).sort((a, b) => a - b);
			pendingColorChoose = { slotIndex, level: slot.level, availableColors };
			saveGame();
			return;
		}

		// instant — 즉시 발동
		if (slot.ability.targetType === 'instant') {
			const ok = executeAbility(slot.ability, slot.level, null);
			if (!ok) return; // 발동 실패 시 쿨다운도 적용 X
			slot.cooldownRemaining = computeCooldown(slot.ability, slot.level);
			saveGame();
			// 능력 사용 후 게임오버 가능성 체크
			if (!canPlaceAnyBlock(grid, currentBlocks)) {
				afterPlace();
			}
			return;
		}

		// targeted — pending 모드 진입
		pendingAbilitySlot = slotIndex;
		selectedBlockIndex = null;
	}

	function cancelPendingAbility() {
		pendingAbilitySlot = null;
	}

	function pickTransform(option: BlockShape) {
		if (!pendingTransform) return;
		const { slotIndex, blockIndex } = pendingTransform;
		const slot = inventory[slotIndex];
		if (!slot) {
			pendingTransform = null;
			return;
		}
		const next = [...currentBlocks];
		next[blockIndex] = option;
		currentBlocks = next;
		selectedBlockIndex = null;

		inventory[slotIndex].cooldownRemaining = computeCooldown(slot.ability, slot.level);
		pendingTransform = null;
		saveGame();

		if (!canPlaceAnyBlock(grid, currentBlocks)) {
			afterPlace();
		}
	}

	function cancelTransform() {
		pendingTransform = null;
	}

	function pickSwap(option: BlockShape) {
		if (!pendingSwap) return;
		const { slotIndex, blockIndex } = pendingSwap;
		const slot = inventory[slotIndex];
		if (!slot) {
			pendingSwap = null;
			return;
		}
		const next = [...currentBlocks];
		next[blockIndex] = option;
		currentBlocks = next;
		selectedBlockIndex = null;

		inventory[slotIndex].cooldownRemaining = computeCooldown(slot.ability, slot.level);
		pendingSwap = null;
		saveGame();
		if (!canPlaceAnyBlock(grid, currentBlocks)) {
			afterPlace();
		}
	}

	function cancelSwap() {
		pendingSwap = null;
	}

	function confirmDrawnBlock(cells: [number, number][], color: CellColor) {
		if (!pendingDraw) return;
		const { slotIndex } = pendingDraw;
		const slot = inventory[slotIndex];
		if (!slot) {
			pendingDraw = null;
			return;
		}
		addBlockToTray({ cells, color });
		inventory[slotIndex].cooldownRemaining = computeCooldown(slot.ability, slot.level);
		pendingDraw = null;
		selectedBlockIndex = null;
		saveGame();
		if (!canPlaceAnyBlock(grid, currentBlocks)) {
			afterPlace();
		}
	}

	function cancelDrawnBlock() {
		pendingDraw = null;
	}

	function confirmClearColor(chosenColors: CellColor[]) {
		if (!pendingColorChoose) return;
		const { slotIndex, level } = pendingColorChoose;
		const slot = inventory[slotIndex];
		if (!slot) {
			pendingColorChoose = null;
			return;
		}
		if (chosenColors.length === 0) return;

		// 레벨 한도 내로 제한 (Lv1=1, Lv2=2, Lv3=3)
		const colorsToClear = chosenColors.slice(0, level);

		const fxCells = collectFilledCells((r, c) => colorsToClear.includes(grid[r][c]));
		if (fxCells.length > 0) triggerAbilityFx('color', fxCells);
		const next = cloneGrid(grid);
		for (let r = 0; r < GRID_SIZE; r++) {
			for (let c = 0; c < GRID_SIZE; c++) {
				if (colorsToClear.includes(next[r][c])) next[r][c] = 0;
			}
		}
		grid = next;

		inventory[slotIndex].cooldownRemaining = computeCooldown(slot.ability, slot.level);
		pendingColorChoose = null;
		selectedBlockIndex = null;
		saveGame();
		if (!canPlaceAnyBlock(grid, currentBlocks)) {
			afterPlace();
		}
	}

	function cancelClearColor() {
		pendingColorChoose = null;
	}

	function applyAbilityToTarget(
		target:
			| { kind: 'cell'; row: number; col: number }
			| { kind: 'block'; index: number }
			| null
	) {
		if (pendingAbilitySlot === null) return;
		const slot = inventory[pendingAbilitySlot];
		if (!slot) {
			pendingAbilitySlot = null;
			return;
		}
		const ability = slot.ability;
		const level = slot.level;
		const slotIndex = pendingAbilitySlot;

		if (!target) {
			pendingAbilitySlot = null;
			return;
		}

		// swap-block Lv2/Lv3 특수 처리 — 블록 클릭 시 후보 N개 중 선택 모달
		if (ability.id === 'swap-block' && level >= 2 && target.kind === 'block') {
			const block = currentBlocks[target.index];
			if (!block) return;
			// 후보 N개 생성 — 매번 새로 generateBlockSet으로 다양한 모양 보장
			const options: BlockShape[] = [];
			for (let i = 0; i < level; i++) {
				const fresh = generateBlockSet();
				options.push(fresh[i % fresh.length]);
			}
			pendingSwap = {
				slotIndex,
				blockIndex: target.index,
				options,
				maxPick: level
			};
			pendingAbilitySlot = null;
			saveGame();
			return;
		}

		// rotate-block 특수 처리 — 블록 클릭 시 변형 후보 모달 표시
		if (ability.id === 'rotate-block' && target.kind === 'block') {
			const block = currentBlocks[target.index];
			if (!block) return;
			const options = getBlockTransforms(block, level);
			if (options.length <= 1) {
				// 변형 가능한 형태가 원본뿐 (대칭 블록 등) — 의미 없음
				showAlert('이 블록은 변형해도 같은 모양입니다.');
				return;
			}
			pendingTransform = {
				slotIndex,
				blockIndex: target.index,
				options
			};
			pendingAbilitySlot = null; // 모달이 뜨면 pending 슬롯은 해제
			saveGame();
			return;
		}

		// 타겟 타입별 발동 — 실패(빈 셀 등) 시 false 반환
		let success = false;
		if (ability.targetType === 'cell' && target.kind === 'cell') {
			success = executeAbility(ability, level, target);
		} else if (ability.targetType === 'row' && target.kind === 'cell') {
			success = executeAbility(ability, level, target);
		} else if (ability.targetType === 'col' && target.kind === 'cell') {
			success = executeAbility(ability, level, target);
		} else if (ability.targetType === 'block' && target.kind === 'block') {
			success = executeAbility(ability, level, target);
		} else {
			return; // 타입 불일치 — 무시
		}

		if (!success) {
			// 발동 실패(빈 셀 등) — pending 유지하여 사용자가 다시 시도 가능
			return;
		}

		inventory[slotIndex].cooldownRemaining = computeCooldown(ability, level);
		pendingAbilitySlot = null;
		selectedBlockIndex = null;
		saveGame();

		// 능력 사용 후 게임오버 가능성 체크
		if (!canPlaceAnyBlock(grid, currentBlocks)) {
			afterPlace();
		}
	}

	function executeAbility(
		ability: Ability,
		level: number,
		target:
			| { kind: 'cell'; row: number; col: number }
			| { kind: 'block'; index: number }
			| null
	): boolean {
		switch (ability.id) {
			case 'clear-row': {
				if (!target || target.kind !== 'cell') return false;
				// 선택한 줄 + 아래쪽으로 (level - 1)줄 추가
				const rows: number[] = [];
				for (let i = 0; i < level; i++) {
					const r = target.row + i;
					if (r >= 0 && r < GRID_SIZE) rows.push(r);
				}
				const fxCells = collectFilledCells((r) => rows.includes(r));
				if (fxCells.length > 0) triggerAbilityFx('beam-row', fxCells, [target.row, target.col]);
				clearLinesWithMeta(rows, []);
				return true;
			}
			case 'clear-col': {
				if (!target || target.kind !== 'cell') return false;
				// 선택한 열 + 오른쪽으로 (level - 1)열 추가
				const cols: number[] = [];
				for (let i = 0; i < level; i++) {
					const c = target.col + i;
					if (c >= 0 && c < GRID_SIZE) cols.push(c);
				}
				const fxCells = collectFilledCells((_, c) => cols.includes(c));
				if (fxCells.length > 0) triggerAbilityFx('beam-col', fxCells, [target.row, target.col]);
				clearLinesWithMeta([], cols);
				return true;
			}
			case 'bomb-3x3': {
				if (!target || target.kind !== 'cell') return false;
				const size = 2 + level; // Lv1=3, Lv2=4, Lv3=5
				const half = Math.floor((size - 1) / 2);
				const fxCells = collectFilledCells((r, c) => {
					return (
						r >= target.row - half &&
						r < target.row + size - half &&
						c >= target.col - half &&
						c < target.col + size - half
					);
				});
				if (fxCells.length > 0) triggerAbilityFx('bomb', fxCells, [target.row, target.col]);
				const next = cloneGrid(grid);
				for (let dr = -half; dr < size - half; dr++) {
					for (let dc = -half; dc < size - half; dc++) {
						const r = target.row + dr;
						const c = target.col + dc;
						if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE) {
							next[r][c] = 0;
						}
					}
				}
				grid = next;
				return true;
			}
			case 'clear-color': {
				// useAbility에서 모달로 가로채므로 여기 도달 X
				return false;
			}
			case 'nuke': {
				const fxCells = collectFilledCells(() => true);
				if (fxCells.length > 0) triggerAbilityFx('nuke', fxCells);
				grid = createEmptyGrid();
				// Lv2: 트레이도 새로 생성, Lv3: 진행 중 위험 모두 카운트다운 +1
				if (level >= 2) {
					currentBlocks = generateTraySet();
					selectedBlockIndex = null;
				}
				if (level >= 3 && currentDangerStage) {
					for (const d of currentDangerStage.dangers) {
						if (!d.resolved) d.countdown += 1;
					}
				}
				return true;
			}
			case 'reroll-blocks': {
				// Lv1: 트레이 새로고침
				// Lv2: 트레이 새로고침 + 작은 블록(셀 ≤2) 우선 추가 1개 보장
				// Lv3: 트레이 새로고침 + 모든 블록을 더 작은 후보로 (셀 ≤3)
				let next = generateTraySet();
				if (level >= 2) {
					// 첫 슬롯에 1×1 또는 1×2 같은 작은 블록 보장
					const smallShapes: [number, number][][] = [[[0, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0]]];
					next[0] = {
						cells: smallShapes[Math.floor(Math.random() * smallShapes.length)].map(c => [...c] as [number, number]),
						color: ((Math.floor(Math.random() * 5) + 1) as CellColor)
					};
				}
				if (level >= 3) {
					// 트레이 전체를 작은 블록(셀 수 ≤ 3)으로 재생성
					next = next.map(b => {
						if (!b || b.cells.length <= 3) return b;
						const smallShapes: [number, number][][] = [
							[[0, 0]],
							[[0, 0], [0, 1]],
							[[0, 0], [1, 0]],
							[[0, 0], [0, 1], [1, 0]],
							[[0, 0], [0, 1], [0, 2]],
							[[0, 0], [1, 0], [2, 0]]
						];
						return {
							cells: smallShapes[Math.floor(Math.random() * smallShapes.length)].map(c => [...c] as [number, number]),
							color: b.color
						};
					});
				}
				currentBlocks = next;
				selectedBlockIndex = null;
				return true;
			}
			case 'single-cell': {
				// Lv1: 1×1 블록 즉시 추가 (빈 슬롯 없으면 트레이 확장)
				// Lv2/Lv3: 모달에서 사용자가 모양 그리기 — useAbility에서 처리하므로 여기 도달 X
				if (level === 1) {
					addBlockToTray({
						cells: [[0, 0]],
						color: ((Math.floor(Math.random() * 5) + 1) as CellColor)
					});
					return true;
				}
				return false; // Lv2/Lv3는 useAbility에서 모달 처리
			}
			case 'swap-block': {
				if (!target || target.kind !== 'block') return false;
				// Lv1: 즉시 새 블록으로 교체 (모달 없음)
				// Lv2/Lv3: applyAbilityToTarget에서 모달로 가로채므로 여기 도달 X
				if (level === 1) {
					const next = [...currentBlocks];
					const newSet = generateTraySet();
					next[target.index] = newSet[0];
					currentBlocks = next;
					selectedBlockIndex = null;
					return true;
				}
				return false;
			}
			case 'rotate-block': {
				// rotate-block은 executeAbility에서 직접 처리하지 않고
				// applyAbilityToTarget에서 모달을 띄움. 여기 도달하면 안 됨.
				return false;
			}
			case 'undo': {
				const popCount = Math.min(level, lastSnapshots.length);
				if (popCount === 0) {
					showAlert('되돌릴 수 있는 배치가 없습니다.');
					return false;
				}
				let snap: GridSnapshot | undefined;
				for (let i = 0; i < popCount; i++) {
					snap = lastSnapshots.pop();
				}
				if (snap) {
					grid = snap.grid;
					currentBlocks = snap.currentBlocks;
					selectedBlockIndex = null;
				}
				return true;
			}
			default:
				console.warn('Unknown ability', ability.id);
				return false;
		}
	}

	// =========================================================================
	// Return interface
	// =========================================================================

	return {
		// State getters/setters
		get gameState() { return gameState; },
		set gameState(v: GameState) { gameState = v; },
		get gameMode() { return gameMode; },
		get grid() { return grid; },
		get score() { return score; },
		get currentBlocks() { return currentBlocks; },
		get selectedBlockIndex() { return selectedBlockIndex; },
		get linesCleared() { return linesCleared; },
		get combo() { return combo; },
		get maxCombo() { return maxCombo; },
		get timerValue() { return timerValue; },
		get displayTimer() { return displayTimer; },
		get hasRestarted() { return hasRestarted; },
		get alertMessage() { return alertMessage; },
		set alertMessage(v: string | null) { alertMessage = v; },
		get confirmMessage() { return confirmMessage; },
		get calculatedScore() { return calculatedScore; },
		get newTitleName() { return newTitleName; },
		get showVisitPrompt() { return showVisitPrompt; },
		get lastPlacedCells() { return lastPlacedCells; },
		get clearingRows() { return clearingRows; },
		get clearingCols() { return clearingCols; },
		get isAnimating() { return isAnimating; },

		// Special-mode getters
		get inventory() { return inventory; },
		get stage() { return stage; },
		get linesClearedSinceLastDraft() { return linesClearedSinceLastDraft; },
		get draftCount() { return draftCount; },
		get pendingDraftOptions() { return pendingDraftOptions; },
		get pendingAbilitySlot() { return pendingAbilitySlot; },
		get pendingDiscardForAbility() { return pendingDiscardForAbility; },
		get pendingTransform() { return pendingTransform; },
		get pendingSwap() { return pendingSwap; },
		get pendingDraw() { return pendingDraw; },
		get pendingColorChoose() { return pendingColorChoose; },
		get nextBlocksQueue() { return nextBlocksQueue; },
		get peekBlocks() { return getPeekBlocks(); },
		get isCleared() { return stagesCleared >= MAX_STAGE; },
		get maxStage() { return MAX_STAGE; },
		get stagesCleared() { return stagesCleared; },
		get currentDangerStage() { return currentDangerStage; },
		get cellMeta() { return cellMeta; },
		get pendingActIntro() { return pendingActIntro; },
		get pendingDangerIntro() { return pendingDangerIntro; },
		get bonusDraftsRemaining() { return bonusDraftsRemaining; },
		get linesUntilNextDanger() {
			return Math.max(0, LINES_TO_NEXT_DANGER - linesClearedSinceLastDraft);
		},
		get abilityFx() { return abilityFx; },
		get isSpecialMode() { return isSpecialMode(); },
		hasAbility: (id: string) => hasOwned(inventory, id),
		getAbilityLevel: (id: string) => getLevelOf(inventory, id),
		isSlotLocked: (index: number) => isSlotLocked(index),

		// Functions
		showAlert,
		showConfirm,
		handleConfirm,
		startTimer,
		stopTimer,
		saveGame,
		loadGame,
		startGame,
		selectBlock,
		placeBlockAt,
		pauseGame,
		resumeGame,
		restartGame,

		// Special-mode functions
		pickAbility,
		discardSlotForAbility,
		cancelDiscard,
		useAbility,
		cancelPendingAbility,
		applyAbilityToTarget,
		pickTransform,
		cancelTransform,
		pickSwap,
		cancelSwap,
		confirmDrawnBlock,
		cancelDrawnBlock,
		confirmClearColor,
		cancelClearColor
	};
}

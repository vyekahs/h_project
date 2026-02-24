<script lang="ts">
	import type { Tube } from '$lib/games/water-sort/types';
	import { TUBE_CAPACITY, COLORS } from '$lib/games/water-sort/types';

	let {
		tubes,
		selectedTubeId = null,
		isGameOver = false,
		showWinAnimation = false,
		pouringAnimation = null,
		returningTubeId = null,
		justCompletedIds = [],
		onselect
	} = $props<{
		tubes: Tube[];
		selectedTubeId: number | null;
		isGameOver: boolean;
		showWinAnimation: boolean;
		pouringAnimation: { srcId: number; tgtId: number; color: number; count: number } | null;
		returningTubeId: number | null;
		justCompletedIds: number[];
		onselect: (id: number) => void;
	}>();

	let lastColors = $state<Record<string, number>>({});

	$effect(() => {
		tubes.forEach((tube: Tube) => {
			tube.layers.forEach((color: number, layerIdx: number) => {
				lastColors[`${tube.id}-${layerIdx}`] = color;
			});
		});
	});

	// Layout calculations
	const tubeWidth = 40;
	const tubeHeight = 120;
	const layerHeight = tubeHeight / TUBE_CAPACITY;
	const tubeGap = 12;
	const tubeRadius = 8;
	const wallThickness = 3;
	const selectedLift = 12;
	const padding = 16;

	let tubeCount = $derived(tubes.length);
	let rows = $derived(tubeCount <= 7 ? 1 : 2);
	let cols = $derived(Math.ceil(tubeCount / rows));

	let totalWidth = $derived(cols * tubeWidth + (cols - 1) * tubeGap + padding * 2);
	let totalHeight = $derived(rows * (tubeHeight + selectedLift + 20) + padding * 2);

	function getTubePosition(index: number): { x: number; y: number } {
		const row = Math.floor(index / cols);
		const tubesInRow = row < rows - 1 ? cols : tubeCount - row * cols;
		const col = index % cols;

		const rowWidth = tubesInRow * tubeWidth + (tubesInRow - 1) * tubeGap;
		const offsetX = (totalWidth - rowWidth) / 2;

		return {
			x: offsetX + col * (tubeWidth + tubeGap),
			y: padding + row * (tubeHeight + selectedLift + 20) + selectedLift
		};
	}

	let renderTubes = $derived(tubes.map((tube: Tube, i: number) => ({
		tube,
		pos: getTubePosition(i)
	})));

	function getPourTransform(tubeId: number, pos: { x: number; y: number }): string {
		const origin = `${pos.x + tubeWidth / 2}px ${pos.y + 20}px`;
		const resetStyle = `transform: translate(0px, 0px) rotate(0deg); transform-origin: ${origin};`;

		// Active Pour Animation overrides anything else
		if (pouringAnimation?.srcId === tubeId) {
			const tgtIdx = tubes.findIndex((t: Tube) => t.id === pouringAnimation.tgtId);
			if (tgtIdx !== -1) {
				const tgtPos = getTubePosition(tgtIdx);

				const dx = tgtPos.x - pos.x;
				const dy = tgtPos.y - pos.y;

				const dir = dx > 0 ? 1 : (dx < 0 ? -1 : 1);
				const tiltAngle = dir * 90;

				const offsetX = dx - dir * 20;
				const offsetY = dy - 30;

				return `
					transform: translate(${offsetX}px, ${offsetY}px) rotate(${tiltAngle}deg);
					transform-origin: ${origin};
				`;
			}
		}

		// Returning tube (separate from active pour, animates back to origin)
		if (returningTubeId === tubeId) {
			return resetStyle;
		}

		return resetStyle;
	}

	function handleTap(e: PointerEvent, id: number) {
		e.preventDefault();
		if (isGameOver) return;
		onselect(id);
	}

	// Check if a tube is complete (4 same-color layers)
	function isTubeComplete(tube: Tube): boolean {
		if (tube.layers.length !== TUBE_CAPACITY) return false;
		return tube.layers.every(l => l === tube.layers[0]);
	}
</script>

<div class="board-wrapper">
	<svg
		class="board-svg"
		viewBox="0 0 {totalWidth} {totalHeight}"
		xmlns="http://www.w3.org/2000/svg"
	>
		<defs>
			<!-- Water surface shimmer gradient -->
			<linearGradient id="waterShine" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0%" stop-color="rgba(255,255,255,0.4)" />
				<stop offset="100%" stop-color="rgba(255,255,255,0)" />
			</linearGradient>
		</defs>

		{#each renderTubes as { tube, pos } (tube.id)}
			{@const isSelected = selectedTubeId === tube.id}
			{@const complete = isTubeComplete(tube)}
			{@const isPourSrc = pouringAnimation?.srcId === tube.id || returningTubeId === tube.id}
			{@const isPourTgt = pouringAnimation?.tgtId === tube.id}
			{@const justCompleted = justCompletedIds.includes(tube.id)}
			{@const pourTransform = getPourTransform(tube.id, pos)}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<g
				class="tube-group"
				class:selected={isSelected}
				class:pour-tgt={isPourTgt}
				class:complete={complete && showWinAnimation}
				class:just-completed={justCompleted}
				onpointerdown={(e) => handleTap(e, tube.id)}
				style="cursor: pointer; {pourTransform}"
			>
				<!-- Invisible hit area -->
				<rect
					x={pos.x - 6}
					y={pos.y - selectedLift - 6}
					width={tubeWidth + 12}
					height={tubeHeight + selectedLift + 12}
					fill="transparent"
				/>

				<!-- Tube container group with selection transform -->
				<g
					class="tube-transform"
					style="transform: translateY({(isSelected && !isPourSrc) ? -selectedLift : 0}px);"
				>
					<!-- Tube shadow -->
					<ellipse
						cx={pos.x + tubeWidth / 2}
						cy={pos.y + tubeHeight + 4}
						rx={tubeWidth / 2 - 4}
						ry={3}
						fill="rgba(0,0,0,0.06)"
						class="tube-shadow"
						style="opacity: {isSelected ? 0.12 : 0.06};"
					/>

					<!-- Tube glass background -->
					<rect
						x={pos.x}
						y={pos.y}
						width={tubeWidth}
						height={tubeHeight}
						rx={tubeRadius}
						ry={tubeRadius}
						fill="rgba(255,255,255,0.6)"
						stroke={isSelected ? '#6366f1' : justCompleted ? '#22c55e' : complete ? '#22c55e' : '#cbd5e1'}
						stroke-width={isSelected ? 2.5 : justCompleted ? 2 : 1.5}
						class="tube-glass"
					/>

					<!-- Water layers (bottom to top, fixed slots for animation) -->
					{#each Array(TUBE_CAPACITY).fill(0) as _, layerIdx}
						{@const colorIdx = tube.layers[layerIdx]}
						{@const isActive = colorIdx !== undefined}
						{@const displayColor = isActive ? colorIdx : (lastColors[`${tube.id}-${layerIdx}`] ?? 0)}
						{@const layerY = pos.y + tubeHeight - (layerIdx + 1) * layerHeight}
						{@const isBottom = layerIdx === 0}
						{@const isTop = isActive && (layerIdx === tube.layers.length - 1)}
						{@const baseHeight = layerHeight - (isTop ? 1 : 0) + (isBottom ? 0 : 0.5)}

						<rect
							x={pos.x + wallThickness}
							y={isActive ? layerY + (isTop ? 1 : 0) : layerY + layerHeight}
							width={tubeWidth - wallThickness * 2}
							height={isActive ? baseHeight : 0}
							rx={isBottom ? tubeRadius - wallThickness : 0}
							ry={isBottom ? tubeRadius - wallThickness : 0}
							fill={COLORS[displayColor]}
							class="water-layer"
							class:water-win={complete && showWinAnimation}
							style="opacity: {isActive || (lastColors[`${tube.id}-${layerIdx}`] !== undefined) ? 1 : 0};"
						/>
						<!-- Water surface highlight for top layer -->
						{#if isTop}
							<rect
								x={pos.x + wallThickness + 2}
								y={layerY + 2}
								width={tubeWidth - wallThickness * 2 - 4}
								height={3}
								rx={1.5}
								fill="rgba(255,255,255,0.35)"
								class="water-surface"
							/>
						{/if}
					{/each}

					<!-- Bubble particles when pouring into this tube -->
					{#if isPourTgt}
						{@const bubbleColor = COLORS[pouringAnimation?.color ?? 0]}
						<circle cx={pos.x + 10} cy={pos.y + 40} r="2" fill={bubbleColor} opacity="0.6" class="bubble b1" />
						<circle cx={pos.x + 25} cy={pos.y + 55} r="1.5" fill={bubbleColor} opacity="0.5" class="bubble b2" />
						<circle cx={pos.x + 30} cy={pos.y + 35} r="2.5" fill={bubbleColor} opacity="0.4" class="bubble b3" />
						<circle cx={pos.x + 15} cy={pos.y + 50} r="1.8" fill={bubbleColor} opacity="0.5" class="bubble b4" />
					{/if}

					<!-- Glass shine overlay -->
					<rect
						x={pos.x + 3}
						y={pos.y + 4}
						width={6}
						height={tubeHeight - 12}
						rx={3}
						fill="rgba(255,255,255,0.2)"
					/>

					<!-- Completion checkmark -->
					{#if justCompleted}
						<g class="check-mark" style="transform-origin: {pos.x + tubeWidth / 2}px {pos.y - 4}px;">
							<circle
								cx={pos.x + tubeWidth / 2}
								cy={pos.y - 4}
								r="7"
								fill="#22c55e"
							/>
							<path
								d="M{pos.x + tubeWidth / 2 - 3.5},{pos.y - 4} l2.5,2.5 l4,-4.5"
								fill="none"
								stroke="white"
								stroke-width="1.8"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</g>
					{/if}
				</g>
			</g>
		{/each}

		<!-- Water Pouring Stream Effect -->
		{#if pouringAnimation}
			{@const srcIdx = tubes.findIndex((t: Tube) => t.id === pouringAnimation.srcId)}
			{@const tgtIdx = tubes.findIndex((t: Tube) => t.id === pouringAnimation.tgtId)}
			{#if srcIdx !== -1 && tgtIdx !== -1}
				{@const srcPos = getTubePosition(srcIdx)}
				{@const tgtPos = getTubePosition(tgtIdx)}
				{@const streamColor = COLORS[pouringAnimation.color]}

				{@const dx = tgtPos.x - srcPos.x}
				{@const dir = dx > 0 ? 1 : (dx < 0 ? -1 : 1)}
				{@const streamStartX = tgtPos.x + tubeWidth / 2 - dir * 5}
				{@const streamStartY = tgtPos.y - 10}
				{@const streamPath = `M ${streamStartX} ${streamStartY} L ${streamStartX} ${tgtPos.y + tubeHeight - 20}`}

				<!-- Water stream animation -->
				{#key pouringAnimation}
					<path
						d={streamPath}
						stroke={streamColor}
						stroke-width="6"
						fill="none"
						stroke-linecap="round"
						class="water-stream"
						style="opacity: 0; animation: streamFlow 0.25s linear forwards; animation-delay: 0.15s;"
					/>
				{/key}
			{/if}
		{/if}
	</svg>
</div>

<style>
	.tube-group {
		transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
		will-change: transform;
	}

	.tube-transform {
		transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
		will-change: transform;
	}

	.tube-shadow {
		transition: opacity 0.25s ease;
	}

	.water-layer {
		transition: y 0.25s ease, height 0.25s ease, opacity 0.2s ease;
		will-change: y, height, opacity;
	}

	.board-wrapper {
		width: 100%;
		max-width: 500px;
		margin: 0 auto;
		touch-action: manipulation;
		-webkit-tap-highlight-color: transparent;
		-webkit-touch-callout: none;
		user-select: none;
	}

	.board-svg {
		width: 100%;
		height: auto;
		display: block;
		overflow: visible;
	}

	.tube-group {
		touch-action: manipulation;
	}

	/* Selected tube glow */
	.tube-group.selected {
		filter: drop-shadow(0 4px 8px rgba(99, 102, 241, 0.3));
		animation: selectBounce 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes selectBounce {
		0% { transform: scale(1); }
		40% { transform: scale(1.04); }
		100% { transform: scale(1); }
	}

	/* Pour source - tilt animation removed, handled via inline style transforms */

	/* Pour target - receive bounce */
	.tube-group.pour-tgt {
		animation: receiveBounce 0.3s ease-out;
	}

	@keyframes receiveBounce {
		0% { transform: translateY(0); }
		40% { transform: translateY(3px); }
		70% { transform: translateY(-1px); }
		100% { transform: translateY(0); }
	}

	/* Water layers */
	.water-layer {
		transition: all 0.25s ease;
	}

	/* Win shimmer */
	.water-win {
		animation: waterShimmer 0.8s ease-out;
	}

	@keyframes waterShimmer {
		0% { filter: brightness(1); }
		30% { filter: brightness(1.4); }
		60% { filter: brightness(1.1); }
		100% { filter: brightness(1.05); }
	}

	/* Just completed tube celebration */
	.tube-group.just-completed {
		animation: completeCelebrate 0.6s ease-out;
	}

	@keyframes completeCelebrate {
		0% { filter: drop-shadow(0 0 0 transparent); transform: scale(1); }
		30% { filter: drop-shadow(0 0 10px rgba(34, 197, 94, 0.7)); transform: scale(1.06); }
		60% { filter: drop-shadow(0 0 6px rgba(34, 197, 94, 0.4)); transform: scale(0.98); }
		100% { filter: drop-shadow(0 0 3px rgba(34, 197, 94, 0.2)); transform: scale(1); }
	}

	/* Win state - sequential glow */
	.tube-group.complete {
		animation: tubeWinGlow 1.2s ease-out infinite alternate;
	}

	@keyframes tubeWinGlow {
		0% { filter: drop-shadow(0 0 2px rgba(34, 197, 94, 0.2)); }
		100% { filter: drop-shadow(0 0 8px rgba(34, 197, 94, 0.6)); }
	}

	/* Bubble animations */
	.bubble {
		animation-duration: 0.4s;
		animation-fill-mode: forwards;
		animation-timing-function: ease-out;
	}
	.bubble.b1 {
		animation-name: bubbleRise1;
	}
	.bubble.b2 {
		animation-name: bubbleRise2;
		animation-delay: 0.05s;
	}
	.bubble.b3 {
		animation-name: bubbleRise3;
		animation-delay: 0.1s;
	}
	.bubble.b4 {
		animation-name: bubbleRise4;
		animation-delay: 0.08s;
	}

	@keyframes bubbleRise1 {
		0% { opacity: 0.6; transform: translateY(0) scale(1); }
		100% { opacity: 0; transform: translateY(-20px) scale(0.3); }
	}
	@keyframes bubbleRise2 {
		0% { opacity: 0.5; transform: translateY(0) scale(1); }
		100% { opacity: 0; transform: translateY(-25px) scale(0.2); }
	}
	@keyframes bubbleRise3 {
		0% { opacity: 0.4; transform: translateY(0) scale(1); }
		100% { opacity: 0; transform: translateY(-18px) scale(0.4); }
	}
	@keyframes bubbleRise4 {
		0% { opacity: 0.5; transform: translateY(0) scale(1); }
		100% { opacity: 0; transform: translateY(-22px) scale(0.3); }
	}

	/* Checkmark appear */
	.check-mark {
		animation: checkPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	@keyframes checkPop {
		0% { opacity: 0; transform: scale(0); }
		60% { opacity: 1; transform: scale(1.2); }
		100% { opacity: 1; transform: scale(1); }
	}

	.water-surface {
		transition: y 0.25s ease;
	}

	@keyframes streamFlow {
		0% { opacity: 0; stroke-dasharray: 0, 500; }
		20% { opacity: 0.8; stroke-dasharray: 60, 500; }
		80% { opacity: 0.8; stroke-dasharray: 500, 500; }
		100% { opacity: 0; stroke-dasharray: 500, 500; }
	}
</style>

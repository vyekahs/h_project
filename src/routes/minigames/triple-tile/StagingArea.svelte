<script lang="ts">
	import type { Tile } from '$lib/games/triple-tile/types';
	import { TILE_TYPES } from '$lib/games/triple-tile/types';

	let {
		staging,
		capacity = 7,
		matchingSlots = [],
		isFull = false,
		containerRef = $bindable<HTMLElement | undefined>(undefined),
	}: {
		staging: (Tile | null)[];
		capacity?: number;
		matchingSlots?: { index: number; typeId: number }[];
		isFull?: boolean;
		containerRef?: HTMLElement;
	} = $props();

	function getMatchOverlay(index: number): { typeId: number } | null {
		const match = matchingSlots.find((m) => m.index === index);
		return match ?? null;
	}
</script>

<div class="staging-area" class:shake={isFull} bind:this={containerRef}>
	{#each { length: capacity } as _, i}
		{@const tile = staging[i]}
		{@const overlay = getMatchOverlay(i)}
		<div class="slot" class:occupied={tile !== null || overlay !== null} class:matching={overlay !== null}>
			{#if overlay}
				<span class="slot-emoji">{TILE_TYPES[overlay.typeId] ?? '❓'}</span>
			{:else if tile}
				<span class="slot-emoji">{TILE_TYPES[tile.typeId] ?? '❓'}</span>
			{/if}
		</div>
	{/each}
</div>

<style>
	.staging-area {
		display: flex;
		gap: 4px;
		justify-content: center;
		padding: 10px 12px;
		background: rgba(0, 0, 0, 0.04);
		border-radius: 16px;
		border: 2px solid rgba(0, 0, 0, 0.06);
		width: fit-content;
		margin: 0 auto;
	}

	.staging-area.shake {
		animation: shakeX 0.5s ease;
	}

	.slot {
		width: 42px;
		height: 42px;
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.6);
		border: 1.5px dashed var(--shadow-md);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
	}

	.slot.occupied {
		background: var(--bg-primary);
		border: 1.5px solid rgba(0, 0, 0, 0.08);
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
		animation: slideIn 0.2s ease;
	}

	.slot.matching {
		animation: matchPop 0.4s ease forwards;
	}

	.slot-emoji {
		font-size: 1.3rem;
		line-height: 1;
		pointer-events: none;
	}

	@keyframes slideIn {
		from {
			transform: translateY(-8px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	@keyframes matchPop {
		0% {
			transform: scale(1);
			opacity: 1;
		}
		40% {
			transform: scale(1.15);
			opacity: 1;
			background: var(--color-success-bg);
		}
		100% {
			transform: scale(0);
			opacity: 0;
		}
	}

	@keyframes shakeX {
		0%,
		100% {
			transform: translateX(0);
		}
		20% {
			transform: translateX(-6px);
		}
		40% {
			transform: translateX(6px);
		}
		60% {
			transform: translateX(-4px);
		}
		80% {
			transform: translateX(4px);
		}
	}
</style>

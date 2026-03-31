<script lang="ts">
	import type { CombatLogEntry } from '$lib/games/regicide/types';

	let { entries }: { entries: CombatLogEntry[] } = $props();

	let open = $state(false);
	let scrollEl = $state<HTMLDivElement | null>(null);

	$effect(() => {
		void entries.length;
		const el = scrollEl;
		if (el && open) {
			requestAnimationFrame(() => {
				el.scrollTop = el.scrollHeight;
			});
		}
	});

	const colorMap: Record<CombatLogEntry['type'], string> = {
		play: 'var(--text-primary)',
		power: '#2563eb',
		damage: '#dc2626',
		enemy_attack: '#ea580c',
		discard: 'var(--text-tertiary)',
		defeat: '#16a34a',
		jester: '#7c3aed',
		draw: '#0284c7',
		heal: '#059669'
	};

	const iconMap: Record<CombatLogEntry['type'], string> = {
		play: '▶',
		power: '✨',
		damage: '⚔',
		enemy_attack: '🛡',
		discard: '↩',
		defeat: '💀',
		jester: '🃏',
		draw: '📥',
		heal: '💚'
	};

	// Last entry for preview
	const lastEntry = $derived(entries.length > 0 ? entries[entries.length - 1] : null);
</script>

<!-- Compact bar: shows last entry, tap to open -->
<button class="log-bar" onclick={() => { open = true; }}>
	{#if lastEntry}
		<span class="last-icon" style:color={colorMap[lastEntry.type]}>{iconMap[lastEntry.type]}</span>
		<span class="last-msg">{lastEntry.message}</span>
	{:else}
		<span class="last-msg empty">전투 기록</span>
	{/if}
	<span class="open-icon">▲</span>
</button>

<!-- Bottom sheet overlay -->
{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="log-backdrop" onclick={() => { open = false; }} onkeydown={(e) => e.key === 'Escape' && (open = false)}>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="log-sheet" onclick={(e) => e.stopPropagation()} ontouchstart={(e) => e.stopPropagation()}>
			<div class="sheet-header">
				<span class="sheet-title">전투 기록</span>
				<button class="sheet-close" onclick={() => { open = false; }}>✕</button>
			</div>
			<div class="sheet-entries" bind:this={scrollEl} ontouchmove={(e) => e.stopPropagation()}>
				{#if entries.length === 0}
					<div class="sheet-empty">전투 기록이 없습니다</div>
				{:else}
					{#each entries as entry, i (i)}
						<div class="log-entry" style:color={colorMap[entry.type]}>
							<span class="entry-icon">{iconMap[entry.type]}</span>
							<span class="entry-message">{entry.message}</span>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	/* ─── Compact bar ─── */
	.log-bar {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 10px;
		background: var(--bg-surface);
		border: 1px solid var(--border-primary);
		border-radius: 8px;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.log-bar:active {
		background: var(--bg-hover);
	}

	.last-icon {
		font-size: 11px;
		flex-shrink: 0;
	}

	.last-msg {
		flex: 1;
		font-size: 11px;
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-align: left;
	}

	.last-msg.empty {
		color: var(--text-tertiary);
	}

	.open-icon {
		font-size: 10px;
		color: var(--text-tertiary);
		flex-shrink: 0;
	}

	/* ─── Bottom sheet ─── */
	.log-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		z-index: 150;
		display: flex;
		align-items: flex-end;
		justify-content: center;
	}

	.log-sheet {
		width: 100%;
		max-width: 500px;
		max-height: 60vh;
		background: var(--bg-primary);
		border-radius: 16px 16px 0 0;
		display: flex;
		flex-direction: column;
		animation: sheetUp 0.25s ease-out;
	}

	@keyframes sheetUp {
		from { transform: translateY(100%); }
		to { transform: translateY(0); }
	}

	.sheet-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 12px 16px;
		border-bottom: 1px solid var(--border-primary);
		flex-shrink: 0;
	}

	.sheet-title {
		font-size: 14px;
		font-weight: 700;
		color: var(--text-primary);
	}

	.sheet-close {
		background: none;
		border: none;
		font-size: 16px;
		color: var(--text-tertiary);
		cursor: pointer;
		padding: 4px 8px;
		border-radius: 6px;
		-webkit-tap-highlight-color: transparent;
	}

	.sheet-close:active {
		background: var(--bg-hover);
	}

	.sheet-entries {
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 8px 16px 16px;
		-webkit-overflow-scrolling: touch;
		touch-action: pan-y;
	}

	.sheet-empty {
		font-size: 13px;
		color: var(--text-tertiary);
		text-align: center;
		padding: 24px 0;
	}

	.log-entry {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		font-size: 13px;
		line-height: 1.5;
		padding: 4px 0;
		border-bottom: 1px solid var(--bg-tertiary);
	}

	.log-entry:last-child {
		border-bottom: none;
	}

	.entry-icon {
		flex-shrink: 0;
		font-size: 12px;
		width: 18px;
		text-align: center;
		padding-top: 2px;
	}

	.entry-message {
		min-width: 0;
		word-break: keep-all;
		overflow-wrap: break-word;
	}
</style>

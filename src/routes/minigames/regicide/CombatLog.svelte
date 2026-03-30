<script lang="ts">
	import type { CombatLogEntry } from '$lib/games/regicide/types';

	let { entries }: { entries: CombatLogEntry[] } = $props();

	let expanded = $state(false);
	let scrollEl = $state<HTMLDivElement | null>(null);

	const visibleEntries = $derived(expanded ? entries : entries.slice(-4));
	const hasMore = $derived(entries.length > 4);

	// Auto-scroll to bottom when new entries arrive
	$effect(() => {
		// Access entries.length to track changes
		void entries.length;
		const el = scrollEl;
		if (el) {
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
		play: '\u25B6',
		power: '\u2728',
		damage: '\u2694',
		enemy_attack: '\u{1F6E1}',
		discard: '\u21A9',
		defeat: '\u{1F480}',
		jester: '\u{1F0CF}',
		draw: '\u{1F4E5}',
		heal: '\u{1F49A}'
	};
</script>

<div class="combat-log">
	<div class="log-header">
		<span class="log-title">전투 기록</span>
		{#if hasMore}
			<button class="toggle-btn" onclick={() => (expanded = !expanded)}>
				{expanded ? '접기' : '더보기'}
			</button>
		{/if}
	</div>

	<div
		bind:this={scrollEl}
		class="log-entries"
		class:expanded
	>
		{#if visibleEntries.length === 0}
			<div class="empty">전투 기록이 없습니다</div>
		{:else}
			{#each visibleEntries as entry, i (expanded ? i : entries.length - visibleEntries.length + i)}
				<div class="log-entry" style:color={colorMap[entry.type]}>
					<span class="entry-icon">{iconMap[entry.type]}</span>
					<span class="entry-message">{entry.message}</span>
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.combat-log {
		flex: 1;
		min-width: 0;
		background: var(--bg-surface);
		border: 1px solid var(--border-primary);
		border-radius: 12px;
		padding: 0.4rem 0.5rem;
		display: flex;
		flex-direction: column;
	}

	.log-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.25rem;
		flex-shrink: 0;
	}

	.log-title {
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--text-tertiary);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.toggle-btn {
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--color-blue);
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.15rem 0.3rem;
		border-radius: 4px;
		transition: background 0.15s;
	}

	.toggle-btn:active {
		background: var(--bg-hover);
	}

	.log-entries {
		overflow-y: auto;
		max-height: 72px;
		scrollbar-width: none;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.log-entries::-webkit-scrollbar {
		display: none;
	}

	.log-entries.expanded {
		max-height: 80px;
	}

	.empty {
		font-size: 0.7rem;
		color: var(--text-tertiary);
		text-align: center;
		padding: 0.5rem 0;
	}

	.log-entry {
		display: flex;
		align-items: baseline;
		gap: 0.3rem;
		font-size: 0.72rem;
		line-height: 1.4;
		padding: 0.1rem 0;
	}

	.entry-icon {
		flex-shrink: 0;
		font-size: 0.65rem;
		width: 1rem;
		text-align: center;
	}

	.entry-message {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>

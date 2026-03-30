<script lang="ts">
	import type { CombatLogEntry } from '$lib/games/regicide/types';

	let { entries }: { entries: CombatLogEntry[] } = $props();

	let showAll = $state(false);
	let scrollEl = $state<HTMLDivElement | null>(null);

	// Show last 3 in compact, all when expanded
	const visibleEntries = $derived(showAll ? entries : entries.slice(-3));

	// Auto-scroll to bottom
	$effect(() => {
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
</script>

<div class="combat-log" class:expanded={showAll}>
	<button class="log-toggle" onclick={() => (showAll = !showAll)}>
		<span class="log-title">전투 기록</span>
		<span class="toggle-icon">{showAll ? '▼' : '▲'}</span>
	</button>

	<div bind:this={scrollEl} class="log-entries">
		{#if visibleEntries.length === 0}
			<div class="empty">전투 기록이 없습니다</div>
		{:else}
			{#each visibleEntries as entry, i (showAll ? i : entries.length - visibleEntries.length + i)}
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
		width: 100%;
		background: var(--bg-surface);
		border: 1px solid var(--border-primary);
		border-radius: 10px;
		overflow: hidden;
	}

	.log-toggle {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 6px 10px;
		background: none;
		border: none;
		cursor: pointer;
		-webkit-tap-highlight-color: transparent;
	}

	.log-toggle:active {
		background: var(--bg-hover);
	}

	.log-title {
		font-size: 11px;
		font-weight: 600;
		color: var(--text-tertiary);
	}

	.toggle-icon {
		font-size: 10px;
		color: var(--text-tertiary);
	}

	.log-entries {
		overflow-y: auto;
		max-height: 56px;
		scrollbar-width: none;
		padding: 0 10px 6px;
	}

	.log-entries::-webkit-scrollbar {
		display: none;
	}

	.combat-log.expanded .log-entries {
		max-height: 200px;
	}

	.empty {
		font-size: 11px;
		color: var(--text-tertiary);
		text-align: center;
		padding: 4px 0;
	}

	.log-entry {
		display: flex;
		align-items: flex-start;
		gap: 4px;
		font-size: 11px;
		line-height: 1.5;
		padding: 1px 0;
	}

	.entry-icon {
		flex-shrink: 0;
		font-size: 10px;
		width: 14px;
		text-align: center;
		padding-top: 2px;
	}

	.entry-message {
		min-width: 0;
		word-break: keep-all;
		overflow-wrap: break-word;
	}
</style>

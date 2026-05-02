<script lang="ts">
	import type { Danger } from '$lib/games/block-blaster/types';
	import { dangerLabel, dangerDescription } from '$lib/games/block-blaster/danger';

	let { stageNumber, dangers, act = null } = $props<{
		stageNumber: number;
		dangers: Danger[];
		act?: number | null;
	}>();

	const actNames: Record<number, string> = {
		1: '기 — 도입',
		2: '승 — 전개',
		3: '전 — 위기',
		4: '결 — 클라이맥스'
	};

	/** 같은 종류 위험은 한 번만 안내 (예: doom-row 2개여도 1줄 설명) */
	const uniqueDangers = $derived.by(() => {
		const seen = new Set<string>();
		const out: Danger[] = [];
		for (const d of dangers) {
			if (seen.has(d.type)) continue;
			seen.add(d.type);
			out.push(d);
		}
		return out;
	});
</script>

<div class="intro" class:has-act={act !== null}>
	{#if act !== null}
		<div class="act-tag">ACT {act}</div>
		<div class="act-name">{actNames[act] ?? ''}</div>
	{/if}
	<div class="stage-tag">STAGE {stageNumber}</div>
	<div class="warn">위험 {dangers.length}개 등장!</div>

	<div class="danger-list">
		{#each uniqueDangers as d (d.type)}
			<div class="danger-item">
				<div class="danger-name">⚠️ {dangerLabel(d.type)}</div>
				<div class="danger-desc">{dangerDescription(d.type)}</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.intro {
		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		background: rgba(0, 0, 0, 0.55);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		z-index: 270;
		pointer-events: none;
		padding: 1rem;
		animation: introIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), introOut 0.4s ease-out 2.6s forwards;
	}

	.act-tag {
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 4px;
		color: #fbbf24;
	}

	.act-name {
		font-size: 1rem;
		font-weight: 700;
		color: #fff;
		margin-bottom: 0.6rem;
	}

	.stage-tag {
		font-size: 2rem;
		font-weight: 900;
		color: #fff;
		letter-spacing: 2px;
		text-shadow: 0 2px 12px rgba(239, 68, 68, 0.6);
	}

	.warn {
		font-size: 0.95rem;
		font-weight: 700;
		color: #ef4444;
		text-shadow: 0 0 8px rgba(239, 68, 68, 0.6);
		margin-bottom: 0.85rem;
	}

	.danger-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-width: 360px;
		width: 100%;
	}

	.danger-item {
		background: rgba(0, 0, 0, 0.55);
		border: 1px solid rgba(239, 68, 68, 0.45);
		border-radius: 10px;
		padding: 0.55rem 0.75rem;
	}

	.danger-name {
		font-size: 0.82rem;
		font-weight: 800;
		color: #fbbf24;
		margin-bottom: 0.2rem;
	}

	.danger-desc {
		font-size: 0.72rem;
		color: rgba(255, 255, 255, 0.85);
		line-height: 1.4;
	}

	@keyframes introIn {
		from { opacity: 0; transform: scale(1.1); }
		to { opacity: 1; transform: scale(1); }
	}

	@keyframes introOut {
		to { opacity: 0; transform: scale(0.95); }
	}
</style>

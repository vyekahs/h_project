<script lang="ts">
	import type { Danger } from '$lib/games/block-blaster/types';
	import { dangerLabel, dangerDescription } from '$lib/games/block-blaster/danger';

	let { stageNumber, dangers, onConfirm } = $props<{
		stageNumber: number;
		dangers: Danger[];
		onConfirm: () => void;
	}>();

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

<div class="overlay">
	<div class="modal" role="dialog" aria-modal="true" tabindex="-1">
		<div class="stage-tag">STAGE {stageNumber}</div>
		<div class="warn">위험 {dangers.length}개 등장!{#if dangers.length > 1} (단계별 등장){/if}</div>

		<div class="danger-list">
			{#each uniqueDangers as d (d.type)}
				<div class="danger-item">
					<div class="danger-name">⚠️ {dangerLabel(d.type)}</div>
					<div class="danger-desc">{dangerDescription(d.type)}</div>
				</div>
			{/each}
		</div>

		<button class="confirm-btn" onclick={onConfirm}>확인</button>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.65);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		z-index: 270;
		padding: 1rem;
		animation: fadeIn 0.25s ease-out;
	}

	.modal {
		width: 100%;
		max-width: 380px;
		background: linear-gradient(135deg, #1f2937, #111827);
		border: 2px solid rgba(239, 68, 68, 0.5);
		border-radius: 18px;
		padding: 1.25rem 1.1rem;
		color: #fff;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 24px rgba(239, 68, 68, 0.35);
		animation: popIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
		display: flex;
		flex-direction: column;
		align-items: stretch;
	}

	.stage-tag {
		font-size: 1.6rem;
		font-weight: 900;
		color: #fff;
		letter-spacing: 1.5px;
		text-shadow: 0 2px 12px rgba(239, 68, 68, 0.5);
		text-align: center;
	}

	.warn {
		font-size: 0.95rem;
		font-weight: 700;
		color: #ef4444;
		text-shadow: 0 0 8px rgba(239, 68, 68, 0.5);
		margin-bottom: 0.85rem;
		text-align: center;
	}

	.danger-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.danger-item {
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(239, 68, 68, 0.4);
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
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.85);
		line-height: 1.45;
	}

	.confirm-btn {
		width: 100%;
		padding: 0.75rem;
		border: none;
		border-radius: 12px;
		background: linear-gradient(135deg, #ef4444, #b91c1c);
		color: #fff;
		font-family: inherit;
		font-size: 0.9rem;
		font-weight: 800;
		cursor: pointer;
		box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
	}

	.confirm-btn:active {
		transform: scale(0.98);
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes popIn {
		from { opacity: 0; transform: scale(0.95); }
		to { opacity: 1; transform: scale(1); }
	}
</style>

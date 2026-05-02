<script lang="ts">
	let { stageNumber, dangerCount, act = null } = $props<{
		stageNumber: number;
		dangerCount: number;
		act?: number | null;
	}>();

	const actNames: Record<number, string> = {
		1: '기 — 도입',
		2: '승 — 전개',
		3: '전 — 위기',
		4: '결 — 클라이맥스'
	};
</script>

<div class="intro" class:has-act={act !== null}>
	{#if act !== null}
		<div class="act-tag">ACT {act}</div>
		<div class="act-name">{actNames[act] ?? ''}</div>
	{/if}
	<div class="stage-tag">STAGE {stageNumber}</div>
	<div class="warn">위험 {dangerCount}개 등장!</div>
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
		background: rgba(0, 0, 0, 0.4);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		z-index: 270;
		pointer-events: none;
		animation: introIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), introOut 0.4s ease-out 1.5s forwards;
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
		font-size: 2.2rem;
		font-weight: 900;
		color: #fff;
		letter-spacing: 2px;
		text-shadow: 0 2px 12px rgba(239, 68, 68, 0.6);
	}

	.warn {
		font-size: 1rem;
		font-weight: 700;
		color: #ef4444;
		text-shadow: 0 0 8px rgba(239, 68, 68, 0.6);
	}

	@keyframes introIn {
		from { opacity: 0; transform: scale(1.1); }
		to { opacity: 1; transform: scale(1); }
	}

	@keyframes introOut {
		to { opacity: 0; transform: scale(0.95); }
	}
</style>

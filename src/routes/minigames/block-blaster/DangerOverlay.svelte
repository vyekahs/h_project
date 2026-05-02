<script lang="ts">
	import type { Danger } from '$lib/games/block-blaster/types';

	let { dangers } = $props<{ dangers: Danger[] }>();

	/** 진행 중 위험만 (resolved 제외) */
	const activeDangers = $derived(dangers.filter((d: Danger) => !d.resolved));

	/**
	 * 카운트다운 색상 — 초기값 대비 비율로 점진 변화.
	 * 100~50%: 노랑 → 50~25%: 주황 → 25~0%: 빨강+깜빡임
	 */
	function severity(d: Danger): 'low' | 'mid' | 'high' {
		const ratio = d.countdown / Math.max(1, d.initialCountdown);
		if (ratio > 0.5) return 'low';
		if (ratio > 0.25) return 'mid';
		return 'high';
	}

	/** 줄 인덱스 (doom-row의 row, doom-col의 col) */
	function lineIndex(d: Danger): number {
		return d.type === 'doom-row' ? d.cells[0][0] : d.cells[0][1];
	}
</script>

<div class="danger-overlay">
	{#each activeDangers as d (d.id)}
		{@const sev = severity(d)}
		{#if d.type === 'doom-row'}
			{@const idx = lineIndex(d)}
			<div
				class="doom-line doom-row sev-{sev}"
				style="--idx: {idx}"
				aria-label="게임오버 줄, 카운트다운 {d.countdown}"
			>
				<span class="countdown">{d.countdown}</span>
			</div>
		{:else if d.type === 'doom-col'}
			{@const idx = lineIndex(d)}
			<div
				class="doom-line doom-col sev-{sev}"
				style="--idx: {idx}"
				aria-label="게임오버 열, 카운트다운 {d.countdown}"
			>
				<span class="countdown">{d.countdown}</span>
			</div>
		{:else if d.type === 'hazard-zone'}
			{@const ar = d.cells[0][0]}
			{@const ac = d.cells[0][1]}
			<div
				class="hazard-zone sev-{sev}"
				style="--ar: {ar}; --ac: {ac};"
				aria-label="위험 구역, 카운트다운 {d.countdown}"
			>
				<span class="countdown">{d.countdown}</span>
			</div>
		{/if}
	{/each}
</div>

<style>
	.danger-overlay {
		position: absolute;
		inset: 6px; /* board padding 만큼 안쪽 */
		pointer-events: none;
		z-index: 10;
	}

	.doom-line {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		box-sizing: border-box;
	}

	/* 가로 줄: row idx 기반. board는 8×8 grid에 gap 3px이므로 1셀 = (100% - 7*gap) / 8 */
	.doom-row {
		left: 0;
		right: 0;
		height: calc((100% - 7 * 3px) / 8);
		top: calc(var(--idx) * (((100% - 7 * 3px) / 8) + 3px));
	}

	/* 세로 열: col idx */
	.doom-col {
		top: 0;
		bottom: 0;
		width: calc((100% - 7 * 3px) / 8);
		left: calc(var(--idx) * (((100% - 7 * 3px) / 8) + 3px));
	}

	/* 위험 구역: 3×3 영역 */
	.hazard-zone {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		width: calc(3 * ((100% - 7 * 3px) / 8) + 2 * 3px);
		height: calc(3 * ((100% - 7 * 3px) / 8) + 2 * 3px);
		top: calc(var(--ar) * (((100% - 7 * 3px) / 8) + 3px));
		left: calc(var(--ac) * (((100% - 7 * 3px) / 8) + 3px));
		border-radius: 6px;
		box-sizing: border-box;
	}

	/* 심각도별 색 */
	.sev-low {
		border: 2px solid #fbbf24;
		box-shadow: 0 0 8px rgba(251, 191, 36, 0.5), inset 0 0 8px rgba(251, 191, 36, 0.3);
	}
	.sev-mid {
		border: 2px solid #fb923c;
		box-shadow: 0 0 12px rgba(251, 146, 60, 0.6), inset 0 0 10px rgba(251, 146, 60, 0.4);
	}
	.sev-high {
		border: 2px solid #ef4444;
		box-shadow: 0 0 16px rgba(239, 68, 68, 0.8), inset 0 0 14px rgba(239, 68, 68, 0.5);
		animation: sevPulse 0.6s ease-in-out infinite;
	}

	@keyframes sevPulse {
		0%, 100% {
			box-shadow: 0 0 16px rgba(239, 68, 68, 0.8), inset 0 0 14px rgba(239, 68, 68, 0.5);
		}
		50% {
			box-shadow: 0 0 26px rgba(239, 68, 68, 1), inset 0 0 20px rgba(239, 68, 68, 0.7);
		}
	}

	.countdown {
		font-size: 1.4rem;
		font-weight: 900;
		color: #fff;
		background: rgba(0, 0, 0, 0.65);
		padding: 2px 9px;
		border-radius: 6px;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
		font-variant-numeric: tabular-nums;
	}

	.sev-high .countdown {
		background: rgba(239, 68, 68, 0.85);
		animation: cdBlink 0.5s ease-in-out infinite;
	}

	@keyframes cdBlink {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.6; }
	}
</style>

<script lang="ts">
	import type { Danger } from '$lib/games/block-blaster/types';

	let { dangers, dangerIdToColorIdx = {} } = $props<{
		dangers: Danger[];
		/** 위험 ID → 잠금 매칭 색 인덱스 (있으면 작은 점 오버레이 표시) */
		dangerIdToColorIdx?: Record<string, number>;
	}>();

	const LOCK_COLORS = ['#ef4444', '#3b82f6', '#10b981']; // red, blue, green

	// 대기 중(delayTurns>0) 위험은 보드에 표시하지 않음 — 활성된 시점에만 등장
	const activeDangers = $derived(dangers.filter((d: Danger) => !d.resolved && d.delayTurns === 0));

	/** 카운트 비율 — 0~1, 작을수록 위험 */
	function ratio(d: Danger): number {
		return d.countdown / Math.max(1, d.initialCountdown);
	}

	function severity(d: Danger): 'low' | 'mid' | 'high' {
		const r = ratio(d);
		if (r > 0.5) return 'low';
		if (r > 0.25) return 'mid';
		return 'high';
	}

	function lineIndex(d: Danger): number {
		return d.type === 'doom-row' ? d.cells[0][0] : d.cells[0][1];
	}
</script>

<div class="danger-overlay">
	{#each activeDangers as d (d.id)}
		{@const sev = severity(d)}
		{@const lockColor = dangerIdToColorIdx[d.id] != null ? LOCK_COLORS[dangerIdToColorIdx[d.id] % LOCK_COLORS.length] : null}
		{#if d.type === 'doom-row'}
			{@const idx = lineIndex(d)}
			<div class="doom doom-row sev-{sev}" style="--idx: {idx}">
				<div class="doom-content">
					<span class="doom-label">DOOM</span>
					<span class="doom-cd">{d.countdown}</span>
					{#if lockColor}<span class="lock-dot" style="background: {lockColor}"></span>{/if}
				</div>
			</div>
		{:else if d.type === 'doom-col'}
			{@const idx = lineIndex(d)}
			<div class="doom doom-col sev-{sev}" style="--idx: {idx}">
				<div class="doom-content vertical">
					<span class="doom-label">DOOM</span>
					<span class="doom-cd">{d.countdown}</span>
					{#if lockColor}<span class="lock-dot" style="background: {lockColor}"></span>{/if}
				</div>
			</div>
		{:else if d.type === 'hazard-zone'}
			{@const ar = d.cells[0][0]}
			{@const ac = d.cells[0][1]}
			<div class="zone sev-{sev}" style="--ar: {ar}; --ac: {ac};">
				<span class="zone-label">ZONE</span>
				<span class="zone-cd">{d.countdown}</span>
				{#if lockColor}<span class="lock-dot" style="background: {lockColor}"></span>{/if}
			</div>
		{/if}
	{/each}
</div>

<style>
	.danger-overlay {
		position: absolute;
		inset: 6px;
		pointer-events: none;
		z-index: 10;
	}

	/* === DOOM 라인 — 강한 빨강 + 굵은 외곽 + 격자 패턴 === */
	.doom {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		border: 3px solid #dc2626;
		background:
			repeating-linear-gradient(
				45deg,
				rgba(220, 38, 38, 0.18) 0,
				rgba(220, 38, 38, 0.18) 6px,
				transparent 6px,
				transparent 12px
			);
		box-shadow:
			0 0 14px rgba(220, 38, 38, 0.85),
			inset 0 0 14px rgba(220, 38, 38, 0.45);
	}

	.doom-row {
		left: 0;
		right: 0;
		height: calc((100% - 7 * 3px) / 8);
		top: calc(var(--idx) * (((100% - 7 * 3px) / 8) + 3px));
		border-radius: 4px;
	}

	.doom-col {
		top: 0;
		bottom: 0;
		width: calc((100% - 7 * 3px) / 8);
		left: calc(var(--idx) * (((100% - 7 * 3px) / 8) + 3px));
		border-radius: 4px;
	}

	.doom-content {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		background: #dc2626;
		color: #fff;
		padding: 3px 9px;
		border-radius: 999px;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
	}

	.doom-content.vertical {
		flex-direction: column;
		gap: 0.15rem;
		padding: 6px 4px;
		border-radius: 12px;
	}

	.doom-label {
		font-size: 0.6rem;
		font-weight: 900;
		letter-spacing: 1.5px;
	}

	.doom-cd {
		font-size: 1.2rem;
		font-weight: 900;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	/* DOOM 심각도별 강조 */
	.doom.sev-mid {
		border-color: #ef4444;
		box-shadow:
			0 0 18px rgba(239, 68, 68, 0.95),
			inset 0 0 18px rgba(239, 68, 68, 0.55);
	}

	.doom.sev-high {
		border-color: #f87171;
		animation: doomPulse 0.5s ease-in-out infinite;
	}

	.doom.sev-high .doom-content {
		animation: doomCdBlink 0.45s ease-in-out infinite;
	}

	@keyframes doomPulse {
		0%, 100% {
			box-shadow:
				0 0 18px rgba(239, 68, 68, 0.95),
				inset 0 0 18px rgba(239, 68, 68, 0.55);
		}
		50% {
			box-shadow:
				0 0 30px rgba(248, 113, 113, 1),
				inset 0 0 26px rgba(248, 113, 113, 0.8);
		}
	}

	@keyframes doomCdBlink {
		0%, 100% { transform: scale(1); }
		50% { transform: scale(1.1); }
	}

	/* === ZONE — 노란 빗금 패턴, 점선 보더 === */
	.zone {
		position: absolute;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.15rem;
		width: calc(3 * ((100% - 7 * 3px) / 8) + 2 * 3px);
		height: calc(3 * ((100% - 7 * 3px) / 8) + 2 * 3px);
		top: calc(var(--ar) * (((100% - 7 * 3px) / 8) + 3px));
		left: calc(var(--ac) * (((100% - 7 * 3px) / 8) + 3px));
		border: 3px dashed #fbbf24;
		border-radius: 12px;
		box-sizing: border-box;
		background:
			repeating-linear-gradient(
				-45deg,
				rgba(251, 191, 36, 0.22) 0,
				rgba(251, 191, 36, 0.22) 5px,
				transparent 5px,
				transparent 10px
			);
		box-shadow:
			0 0 10px rgba(251, 191, 36, 0.55),
			inset 0 0 10px rgba(251, 191, 36, 0.35);
	}

	.zone-label {
		font-size: 0.6rem;
		font-weight: 900;
		letter-spacing: 2px;
		color: #fbbf24;
		background: rgba(0, 0, 0, 0.6);
		padding: 2px 8px;
		border-radius: 999px;
	}

	.zone-cd {
		font-size: 1.1rem;
		font-weight: 900;
		color: #fff;
		background: rgba(245, 158, 11, 0.85);
		padding: 2px 9px;
		border-radius: 6px;
		font-variant-numeric: tabular-nums;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
	}

	.zone.sev-mid {
		border-color: #fb923c;
		background:
			repeating-linear-gradient(
				-45deg,
				rgba(251, 146, 60, 0.28) 0,
				rgba(251, 146, 60, 0.28) 5px,
				transparent 5px,
				transparent 10px
			);
	}

	.zone.sev-high {
		border-color: #f97316;
		animation: zonePulse 0.7s ease-in-out infinite;
	}

	@keyframes zonePulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.7; }
	}

	/* 잠금 매칭 색 점 — 위험 라벨 옆에 작게 */
	.lock-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		display: inline-block;
		box-shadow: 0 0 4px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.4);
		flex-shrink: 0;
	}
</style>

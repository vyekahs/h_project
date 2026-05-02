<script lang="ts">
	import type {
		Ability,
		OwnedAbility
	} from '$lib/games/block-blaster/abilities';
	import { findOwned, MAX_LEVEL, getLevelEffect } from '$lib/games/block-blaster/abilities';
	import AbilityIcon from './AbilityIcon.svelte';

	let {
		options,
		owned,
		stage,
		onPick
	} = $props<{
		options: Ability[];
		owned: OwnedAbility[];
		stage: number;
		onPick: (a: Ability) => void;
	}>();

	function ownedLevel(id: string): number {
		return findOwned(owned, id)?.level ?? 0;
	}

	function rarityLabel(r: string): string {
		return r === 'epic' ? '에픽' : r === 'rare' ? '레어' : '커먼';
	}
</script>

<div class="overlay" role="dialog" aria-modal="true">
	<div class="modal">
		<div class="header">
			<div class="stage-pill">STAGE {stage} CLEAR</div>
			<h2>능력을 선택하세요</h2>
			<p class="subtitle">선택 후 보드에 압박 셀이 추가됩니다</p>
		</div>

		<div class="cards">
			{#each options as ab (ab.id)}
				{@const lvl = ownedLevel(ab.id)}
				{@const nextLvl = Math.min(lvl + 1, MAX_LEVEL)}
				{@const willMaxOut = nextLvl >= MAX_LEVEL}
				<button
					class="card rarity-{ab.rarity}"
					onclick={() => onPick(ab)}
				>
					<div class="card-glow"></div>
					<div class="rarity-stripe">{rarityLabel(ab.rarity)}</div>

					<div class="icon-wrap">
						<div class="icon-bg"></div>
						<div class="icon"><AbilityIcon id={ab.id} size={32} /></div>
					</div>

					<div class="content">
						<div class="name-row">
							<span class="name">{ab.name}</span>
							{#if lvl === 0}
								<span class="status-tag new">NEW</span>
							{:else if willMaxOut}
								<span class="status-tag max">MAX Lv{nextLvl}</span>
							{:else}
								<span class="status-tag up">Lv{lvl} → Lv{nextLvl}</span>
							{/if}
						</div>
						{#if lvl === 0}
							<div class="effect-block">
								<div class="effect-row">
									<span class="lv-tag">Lv1</span>
									<p class="lv-text">{getLevelEffect(ab.id, 1)}</p>
								</div>
							</div>
						{:else}
							<div class="effect-block">
								<div class="effect-row old">
									<span class="lv-tag old">Lv{lvl}</span>
									<p class="lv-text muted">{getLevelEffect(ab.id, lvl)}</p>
								</div>
								<div class="effect-arrow">↓</div>
								<div class="effect-row">
									<span class="lv-tag new-lv">Lv{nextLvl}</span>
									<p class="lv-text">{getLevelEffect(ab.id, nextLvl)}</p>
								</div>
							</div>
						{/if}
					</div>

					<div class="select-arrow">선택 ›</div>
				</button>
			{/each}
		</div>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.85), rgba(0, 0, 0, 0.95));
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 300;
		padding: 1rem;
		animation: fadeIn 0.25s ease-out;
	}

	.modal {
		width: 100%;
		max-width: 440px;
		max-height: 90vh;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}

	.header {
		text-align: center;
		padding: 0.5rem 0;
	}

	.stage-pill {
		display: inline-block;
		padding: 4px 12px;
		font-size: 0.65rem;
		font-weight: 800;
		letter-spacing: 2px;
		color: #fff;
		background: linear-gradient(135deg, #f59e0b, #ef4444);
		border-radius: 20px;
		margin-bottom: 0.5rem;
		box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
	}

	.header h2 {
		margin: 0 0 0.25rem;
		font-size: 1.4rem;
		font-weight: 800;
		color: #fff;
		letter-spacing: -0.5px;
	}

	.subtitle {
		margin: 0;
		font-size: 0.78rem;
		color: rgba(255, 255, 255, 0.55);
	}

	.cards {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}

	.card {
		position: relative;
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 0.85rem;
		padding: 1rem 1.1rem;
		border: none;
		border-radius: 16px;
		background: linear-gradient(135deg, #1f2937, #111827);
		cursor: pointer;
		text-align: left;
		font-family: inherit;
		color: #fff;
		overflow: hidden;
		transition: transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.15s ease;
		animation: slideUp 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
	}

	.card:nth-child(1) { animation-delay: 0.05s; }
	.card:nth-child(2) { animation-delay: 0.12s; }
	.card:nth-child(3) { animation-delay: 0.19s; }

	.card:active {
		transform: scale(0.98) translateY(1px);
	}

	@media (hover: hover) {
		.card:hover {
			transform: translateY(-2px);
		}
		.card:hover .select-arrow {
			transform: translateX(4px);
			opacity: 1;
		}
	}

	.card-glow {
		position: absolute;
		inset: 0;
		opacity: 0.18;
		pointer-events: none;
	}

	.card.rarity-common .card-glow {
		background: linear-gradient(135deg, transparent, #94a3b8 80%);
	}
	.card.rarity-rare .card-glow {
		background: linear-gradient(135deg, transparent, #3b82f6 80%);
		opacity: 0.25;
	}
	.card.rarity-epic .card-glow {
		background: linear-gradient(135deg, transparent, #a855f7 80%);
		opacity: 0.35;
	}

	.card.rarity-common {
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.06);
	}
	.card.rarity-rare {
		box-shadow:
			0 4px 14px rgba(0, 0, 0, 0.4),
			0 0 0 1.5px rgba(59, 130, 246, 0.5),
			0 0 16px rgba(59, 130, 246, 0.3),
			inset 0 1px 0 rgba(255, 255, 255, 0.06);
	}
	.card.rarity-epic {
		box-shadow:
			0 4px 14px rgba(0, 0, 0, 0.5),
			0 0 0 1.5px rgba(168, 85, 247, 0.6),
			0 0 24px rgba(168, 85, 247, 0.4),
			inset 0 1px 0 rgba(255, 255, 255, 0.08);
	}

	.rarity-stripe {
		position: absolute;
		top: 8px;
		right: 10px;
		font-size: 0.55rem;
		font-weight: 800;
		letter-spacing: 2px;
		padding: 2px 8px;
		border-radius: 4px;
		text-transform: uppercase;
	}

	.card.rarity-common .rarity-stripe {
		background: rgba(148, 163, 184, 0.2);
		color: #cbd5e1;
	}
	.card.rarity-rare .rarity-stripe {
		background: rgba(59, 130, 246, 0.25);
		color: #93c5fd;
	}
	.card.rarity-epic .rarity-stripe {
		background: rgba(168, 85, 247, 0.3);
		color: #e9d5ff;
	}

	.icon-wrap {
		position: relative;
		width: 56px;
		height: 56px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.icon-bg {
		position: absolute;
		inset: 0;
		border-radius: 14px;
		background: rgba(255, 255, 255, 0.06);
	}

	.card.rarity-rare .icon-bg {
		background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.05));
	}
	.card.rarity-epic .icon-bg {
		background: linear-gradient(135deg, rgba(168, 85, 247, 0.3), rgba(168, 85, 247, 0.08));
	}

	.icon {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4));
	}

	.content {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.name-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.name {
		font-size: 1.05rem;
		font-weight: 700;
		color: #fff;
		letter-spacing: -0.3px;
	}

	.status-tag {
		font-size: 0.6rem;
		font-weight: 800;
		letter-spacing: 0.5px;
		padding: 2px 7px;
		border-radius: 4px;
	}

	.status-tag.new {
		background: linear-gradient(135deg, #10b981, #059669);
		color: #fff;
		box-shadow: 0 2px 6px rgba(16, 185, 129, 0.4);
	}

	.status-tag.up {
		background: rgba(245, 158, 11, 0.2);
		color: #fbbf24;
		border: 1px solid rgba(245, 158, 11, 0.4);
	}

	.status-tag.max {
		background: linear-gradient(135deg, #f59e0b, #ef4444);
		color: #fff;
		box-shadow: 0 2px 6px rgba(239, 68, 68, 0.4);
	}

	/* 레벨별 효과 표시 영역 */
	.effect-block {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-top: 0.4rem;
		padding: 0.55rem 0.65rem;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 8px;
	}

	.effect-row {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.effect-row.old {
		opacity: 0.6;
	}

	.effect-arrow {
		text-align: center;
		font-size: 0.85rem;
		color: #fbbf24;
		line-height: 1;
		font-weight: 700;
	}

	.lv-tag {
		font-size: 0.6rem;
		font-weight: 800;
		padding: 2px 6px;
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.15);
		color: #fff;
		flex-shrink: 0;
		margin-top: 1px;
	}

	.lv-tag.old {
		background: rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.6);
	}

	.lv-tag.new-lv {
		background: linear-gradient(135deg, #f59e0b, #ef4444);
		color: #fff;
	}

	.lv-text {
		margin: 0;
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.92);
		font-weight: 500;
		line-height: 1.5;
	}

	.lv-text.muted {
		color: rgba(255, 255, 255, 0.55);
	}

	.select-arrow {
		font-size: 0.75rem;
		font-weight: 700;
		color: rgba(255, 255, 255, 0.4);
		opacity: 0.7;
		transition: transform 0.15s ease, opacity 0.15s ease;
		white-space: nowrap;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>

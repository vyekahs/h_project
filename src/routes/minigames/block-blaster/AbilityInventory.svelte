<script lang="ts">
	import type { Ability, OwnedAbility } from '$lib/games/block-blaster/abilities';
	import {
		isPassive,
		computeCooldown,
		reviveCooldown,
		getLevelEffect,
		MAX_LEVEL,
		INVENTORY_SLOTS,
		ABILITY_POOL
	} from '$lib/games/block-blaster/abilities';
	import AbilityIcon from './AbilityIcon.svelte';

	/** 저장된 inventory의 ability에는 옛 description이 박혀있을 수 있어 항상 최신 풀에서 lookup */
	function freshAbility(a: Ability): Ability {
		return ABILITY_POOL.find(p => p.id === a.id) ?? a;
	}

	let {
		inventory,
		pendingSlot,
		onSlotClick,
		onSlotPointerDown
	} = $props<{
		inventory: OwnedAbility[];
		pendingSlot: number | null;
		onSlotClick: (index: number) => void;
		onSlotPointerDown?: (index: number, e: PointerEvent) => void;
	}>();

	let infoOpen = $state(false);

	function openInfo() {
		infoOpen = true;
	}

	function closeInfo() {
		infoOpen = false;
	}

	function targetTypeLabel(t: string): string {
		switch (t) {
			case 'instant': return '즉시 발동';
			case 'cell': return '셀에 드래그';
			case 'row': return '가로줄 드래그';
			case 'col': return '세로열 드래그';
			case 'block': return '트레이 블록 선택';
			case 'passive': return '상시 효과';
			default: return '';
		}
	}

	const slots = $derived.by(() => {
		const arr: (OwnedAbility | null)[] = [];
		for (let i = 0; i < INVENTORY_SLOTS; i++) {
			arr.push(inventory[i] ?? null);
		}
		return arr;
	});

	function handleSlotClick(i: number) {
		onSlotClick(i);
	}
</script>

<div class="inventory">
	<div class="bar">
		<div class="slots">
			{#each slots as slot, i}
				{@const passive = slot ? isPassive(slot.ability) : false}
				{@const isPending = pendingSlot === i}
				{@const onCooldown = slot ? slot.cooldownRemaining > 0 : false}
				<button
					type="button"
					class="slot"
					class:empty={!slot}
					class:passive
					class:pending={isPending}
					class:cooldown={onCooldown}
					disabled={!slot}
					onclick={() => handleSlotClick(i)}
					onpointerdown={(e) => {
						if (!slot || passive || onCooldown) return;
						onSlotPointerDown?.(i, e);
					}}
					aria-label={slot ? `${slot.ability.name} Lv${slot.level}` : '빈 슬롯'}
				>
					{#if slot}
						<span class="icon"><AbilityIcon id={slot.ability.id} size={22} /></span>
						<span class="lvl">L{slot.level}</span>
						{#if passive}
							<span class="type-badge">P</span>
						{/if}
						{#if onCooldown}
							<span class="cd-overlay">{slot.cooldownRemaining}</span>
						{/if}
						{#if isPending}
							<span class="pending-ring"></span>
						{/if}
					{/if}
				</button>
			{/each}
		</div>
		<button
			type="button"
			class="info-toggle"
			onclick={openInfo}
			disabled={inventory.length === 0}
			aria-label="보유 능력 보기"
			title="보유 능력 보기"
		>
			<AbilityIcon id="info" size={18} />
		</button>
	</div>

	{#if pendingSlot !== null}
		<div class="hint">타겟을 선택하세요</div>
	{/if}
</div>

{#if infoOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="info-overlay" onclick={closeInfo}>
		<div
			class="info-modal"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
		>
			<div class="info-modal-head">
				<h2>보유 능력</h2>
				<button class="x-btn" onclick={closeInfo} aria-label="닫기">✕</button>
			</div>

			{#if inventory.length === 0}
				<p class="empty-msg">아직 획득한 능력이 없습니다.</p>
			{:else}
				<div class="ability-list">
					{#each inventory as own (own.ability.id)}
						{@const ab = freshAbility(own.ability)}
						{@const isReviveAb = ab.id === 'revive'}
						{@const cd = isReviveAb ? reviveCooldown(own.level) : isPassive(ab) ? 0 : computeCooldown(ab, own.level)}
						{@const showCooldown = !isPassive(ab) || isReviveAb}
						{@const isMax = own.level >= MAX_LEVEL}
						<div class="ability-row rarity-{ab.rarity}">
							<div class="row-head">
								<span class="row-icon"><AbilityIcon id={ab.id} size={28} /></span>
								<div class="row-title">
									<div class="row-name">
										{ab.name}
										<span class="row-lvl">Lv{own.level}</span>
										{#if isMax}<span class="max-tag">MAX</span>{/if}
									</div>
									<div class="row-meta">
										{ab.rarity.toUpperCase()} · {targetTypeLabel(ab.targetType)}
										{#if showCooldown}
											· 쿨다운 {cd}턴
											{#if own.cooldownRemaining > 0}
												<span class="hot">(남음 {own.cooldownRemaining})</span>
											{/if}
										{/if}
									</div>
								</div>
							</div>
							<div class="row-effect">
								<span class="effect-tag">현재 효과</span>
								<p class="effect-text">{getLevelEffect(ab.id, own.level)}</p>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.inventory {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		width: 100%;
		padding: 0 0.25rem;
	}

	.bar {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.4rem;
		align-items: center;
	}

	.slots {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 0.4rem;
		min-width: 0;
	}

	.info-toggle {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		border: 1.5px solid rgba(168, 85, 247, 0.5);
		background: rgba(168, 85, 247, 0.15);
		color: #fff;
		font-family: inherit;
		font-size: 0.85rem;
		font-weight: 800;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		flex-shrink: 0;
		transition: transform 0.1s, background 0.1s;
	}

	.info-toggle:not(:disabled):active {
		transform: scale(0.92);
		background: rgba(168, 85, 247, 0.4);
	}

	.info-toggle:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.slot {
		position: relative;
		aspect-ratio: 1;
		min-height: 48px;
		border-radius: 10px;
		border: 1.5px dashed var(--border-color, rgba(0, 0, 0, 0.12));
		background: var(--bg-elevated);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		font-family: inherit;
		padding: 0;
		transition: transform 0.1s, border-color 0.1s, box-shadow 0.1s;
	}

	.slot:not(.empty) {
		border-style: solid;
		border-color: var(--border-color, rgba(0, 0, 0, 0.15));
	}

	.slot:not(.empty):not(:disabled):active {
		transform: scale(0.95);
	}

	.slot.empty {
		opacity: 0.5;
		cursor: default;
	}

	.slot.passive {
		border-color: rgba(168, 85, 247, 0.5);
		cursor: help;
	}

	.slot.pending {
		border-color: #f59e0b;
		box-shadow: 0 0 10px rgba(245, 158, 11, 0.5);
	}

	.slot.cooldown {
		filter: grayscale(0.7);
		opacity: 0.7;
	}

	.icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: var(--text-primary);
	}

	.lvl {
		position: absolute;
		bottom: 2px;
		right: 4px;
		font-size: 0.6rem;
		font-weight: 700;
		color: var(--text-tertiary);
	}

	.type-badge {
		position: absolute;
		top: 2px;
		left: 4px;
		font-size: 0.55rem;
		font-weight: 700;
		color: #a855f7;
	}

	.cd-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.2rem;
		font-weight: 700;
		color: #fff;
		background: rgba(0, 0, 0, 0.5);
		border-radius: 9px;
	}

	.pending-ring {
		position: absolute;
		inset: -3px;
		border-radius: 12px;
		border: 2px solid #f59e0b;
		animation: pulse 1.2s ease-in-out infinite;
		pointer-events: none;
	}

	@keyframes pulse {
		0%, 100% { opacity: 0.5; transform: scale(1); }
		50% { opacity: 1; transform: scale(1.04); }
	}

	.hint {
		text-align: center;
		font-size: 0.7rem;
		color: #f59e0b;
		font-weight: 600;
	}

	/* === 보유 능력 통합 정보 모달 === */
	.info-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		z-index: 250;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		animation: fadeIn 0.2s ease-out;
	}

	.info-modal {
		width: 100%;
		max-width: 400px;
		max-height: 85vh;
		background: linear-gradient(135deg, #1f2937, #111827);
		border-radius: 18px;
		padding: 0;
		color: #fff;
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
		animation: popIn 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.info-modal-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.1rem 0.6rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	.info-modal-head h2 {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 800;
	}

	.x-btn {
		width: 28px;
		height: 28px;
		border: none;
		background: rgba(255, 255, 255, 0.08);
		color: #fff;
		font-family: inherit;
		font-size: 0.85rem;
		font-weight: 700;
		border-radius: 50%;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
	}

	.x-btn:active {
		transform: scale(0.92);
	}

	.empty-msg {
		margin: 0;
		padding: 2rem 1rem;
		text-align: center;
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.85rem;
	}

	.ability-list {
		padding: 0.5rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.ability-row {
		padding: 0.7rem 0.85rem;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.04);
		border-left: 3px solid rgba(148, 163, 184, 0.5);
	}

	.ability-row.rarity-rare {
		border-left-color: #3b82f6;
	}
	.ability-row.rarity-epic {
		border-left-color: #a855f7;
	}

	.row-head {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		margin-bottom: 0.4rem;
	}

	.row-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.4));
	}

	.row-title {
		flex: 1;
		min-width: 0;
	}

	.row-name {
		font-size: 0.95rem;
		font-weight: 700;
		display: flex;
		align-items: baseline;
		gap: 0.35rem;
		flex-wrap: wrap;
	}

	.row-lvl {
		font-size: 0.7rem;
		font-weight: 700;
		color: #fbbf24;
	}

	.max-tag {
		font-size: 0.55rem;
		font-weight: 800;
		padding: 1px 5px;
		border-radius: 3px;
		background: linear-gradient(135deg, #f59e0b, #ef4444);
		color: #fff;
		letter-spacing: 0.5px;
	}

	.row-meta {
		font-size: 0.65rem;
		color: rgba(255, 255, 255, 0.5);
		font-weight: 600;
		margin-top: 1px;
	}

	.row-meta .hot {
		color: #fb923c;
		margin-left: 0.2rem;
	}

	.row-effect {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.55rem 0.65rem;
		background: rgba(168, 85, 247, 0.1);
		border-radius: 8px;
	}

	.effect-tag {
		font-size: 0.6rem;
		font-weight: 800;
		color: #a855f7;
		letter-spacing: 0.5px;
	}

	.effect-text {
		margin: 0;
		font-size: 0.78rem;
		color: rgba(255, 255, 255, 0.92);
		font-weight: 500;
		line-height: 1.5;
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

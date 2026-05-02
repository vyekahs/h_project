<script lang="ts">
	import type {
		Ability,
		OwnedAbility
	} from '$lib/games/block-blaster/abilities';
	import AbilityIcon from './AbilityIcon.svelte';

	let {
		ability,
		inventory,
		onDiscard,
		onCancel
	} = $props<{
		ability: Ability;
		inventory: OwnedAbility[];
		onDiscard: (slotIndex: number) => void;
		onCancel: () => void;
	}>();
</script>

<div class="overlay" role="dialog" aria-modal="true">
	<div class="modal">
		<h2>슬롯이 가득 찼습니다</h2>
		<p class="new-ability">
			<span class="new-icon"><AbilityIcon id={ability.id} size={20} /></span>
			새 능력 <strong>{ability.name}</strong>을 추가하려면 버릴 슬롯을 선택하세요.
		</p>
		<div class="slot-list">
			{#each inventory as owned, i}
				<button class="slot-btn" onclick={() => onDiscard(i)}>
					<span class="icon"><AbilityIcon id={owned.ability.id} size={22} /></span>
					<span class="info">
						<span class="name">{owned.ability.name}</span>
						<span class="lvl">Lv{owned.level}</span>
					</span>
					<span class="action">버리기</span>
				</button>
			{/each}
		</div>
		<button class="cancel-btn" onclick={onCancel}>취소 (능력 포기)</button>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 350;
		padding: 1rem;
	}

	.modal {
		background: var(--bg-primary);
		border-radius: 20px;
		padding: 1.5rem 1rem;
		width: 100%;
		max-width: 380px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}

	h2 {
		margin: 0 0 0.5rem;
		font-size: 1.1rem;
		text-align: center;
		color: var(--text-primary);
	}

	p {
		margin: 0 0 1rem;
		text-align: center;
		font-size: 0.85rem;
		color: var(--text-secondary);
		line-height: 1.4;
	}

	.new-ability {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		flex-wrap: wrap;
	}

	.new-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: var(--text-darker, #1f2937);
	}

	.slot-list {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-bottom: 1rem;
	}

	.slot-btn {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.65rem 0.85rem;
		border: 1.5px solid transparent;
		border-radius: 10px;
		background: var(--bg-elevated);
		cursor: pointer;
		font-family: inherit;
		text-align: left;
	}

	.slot-btn:active {
		transform: scale(0.98);
		border-color: #ef4444;
	}

	.icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: var(--text-darker, #1f2937);
	}

	.info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.name {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.lvl {
		font-size: 0.7rem;
		color: var(--text-tertiary);
	}

	.action {
		font-size: 0.75rem;
		color: #ef4444;
		font-weight: 600;
	}

	.cancel-btn {
		width: 100%;
		padding: 0.75rem;
		background: var(--bg-tertiary);
		color: var(--text-primary);
		border: none;
		border-radius: 12px;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		font-family: inherit;
	}

	.cancel-btn:active {
		transform: scale(0.98);
	}
</style>

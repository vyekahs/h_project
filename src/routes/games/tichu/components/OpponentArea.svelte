<script lang="ts">
	import type { TichuPlayer } from '$lib/games/tichu/types';

	let { player, isCurrentTurn = false, position, isPartner = false, stateVersion = 0 } = $props<{
		player: TichuPlayer;
		isCurrentTurn?: boolean;
		position: 'left' | 'top' | 'right';
		isPartner?: boolean;
		stateVersion?: number;
	}>();

	// player is a mutable object — access stateVersion to force reactivity
	const cardCount = $derived.by(() => { void stateVersion; return player.hand.length; });
	const finishLabel: Record<number, string> = { 1: '1등', 2: '2등', 3: '3등', 4: '4등' };
</script>

<div class="opponent {position}" class:current-turn={isCurrentTurn}>
	<div class="opponent-info">
		<div class="avatar team-{player.team}" class:finished={player.finishOrder !== null}>
			{#if player.finishOrder !== null}
				<span class="finish-badge">{finishLabel[player.finishOrder]}</span>
			{:else}
				{player.name.charAt(0)}
			{/if}
		</div>
		<div class="name-area">
			<span class="name">{player.name}</span>
			{#if isPartner}<span class="partner-badge">파트너</span>{/if}
		</div>
		{#if cardCount > 0}
			<div class="card-count">{cardCount}장</div>
		{/if}
		{#if isCurrentTurn && cardCount > 0}
			<div class="thinking">생각 중…</div>
		{/if}
	</div>

	<!-- Declarations -->
	{#if player.grandTichu === true}
		<div class="declaration grand">GT</div>
	{/if}
	{#if player.smallTichu}
		<div class="declaration small-tichu">ST</div>
	{/if}

	<!-- Card backs -->
	{#if cardCount > 0 && player.finishOrder === null}
		<div class="card-backs">
			{#each Array(Math.min(cardCount, 8)) as _}
				<div class="card-back"></div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.opponent {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 6px;
		border-radius: 8px;
		transition: background 0.3s;
	}
	.opponent.current-turn {
		background: rgba(245,158,11,0.15);
		box-shadow: 0 0 12px rgba(245,158,11,0.3);
	}

	.opponent-info {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}
	.avatar {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 600;
		font-size: 0.9rem;
	}
	.avatar.team-A { background: rgba(239,68,68,0.3); }
	.avatar.team-B { background: rgba(59,130,246,0.3); }
	.avatar.finished { background: rgba(34,197,94,0.3); }
	.finish-badge { font-size: 0.65rem; font-weight: 700; }

	.name-area {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.name {
		font-size: 0.75rem;
		font-weight: 500;
		max-width: 80px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.partner-badge {
		font-size: 0.55rem;
		background: rgba(239,68,68,0.3);
		color: #fca5a5;
		padding: 0 4px;
		border-radius: 3px;
		font-weight: 600;
	}
	.card-count {
		font-size: 0.65rem;
		opacity: 0.6;
	}

	.thinking {
		font-size: 0.6rem;
		opacity: 0.7;
		animation: thinkPulse 1.2s infinite;
	}
	@keyframes thinkPulse {
		0%, 100% { opacity: 0.7; }
		50% { opacity: 0.3; }
	}

	.declaration {
		font-size: 0.6rem;
		font-weight: 700;
		padding: 1px 6px;
		border-radius: 3px;
	}
	.declaration.grand {
		background: rgba(239,68,68,0.4);
		color: #fca5a5;
	}
	.declaration.small-tichu {
		background: rgba(59,130,246,0.4);
		color: #93c5fd;
	}

	.card-backs {
		display: flex;
		gap: 1px;
		margin-top: 2px;
	}
	.card-back {
		width: 14px;
		height: 20px;
		border-radius: 2px;
		background: linear-gradient(135deg, #1e3a5f, #2563eb);
		border: 1px solid rgba(255,255,255,0.15);
	}

	/* Position-specific adjustments */
	.left {
		position: absolute;
		left: 8px;
		top: 50%;
		transform: translateY(-50%);
	}
	.left .card-backs {
		flex-direction: column;
	}
	.left .card-back {
		width: 20px;
		height: 14px;
	}

	.top {
		position: absolute;
		top: 8px;
		left: 50%;
		transform: translateX(-50%);
	}

	.right {
		position: absolute;
		right: 8px;
		top: 50%;
		transform: translateY(-50%);
	}
	.right .card-backs {
		flex-direction: column;
	}
	.right .card-back {
		width: 20px;
		height: 14px;
	}
</style>

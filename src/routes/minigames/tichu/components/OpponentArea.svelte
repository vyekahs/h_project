<script lang="ts">
	import type { TichuPlayer } from '$lib/games/tichu/types';

	let { player, isCurrentTurn = false, position, isPartner = false, passed = false, stateVersion = 0 } = $props<{
		player: TichuPlayer;
		isCurrentTurn?: boolean;
		position: 'left' | 'top' | 'right';
		isPartner?: boolean;
		passed?: boolean;
		stateVersion?: number;
	}>();

	// player is a mutable object — access stateVersion to force reactivity
	const cardCount = $derived.by(() => { void stateVersion; return player.hand.length; });
	const finishOrder = $derived.by(() => { void stateVersion; return player.finishOrder; });
	const isGrandTichu = $derived.by(() => { void stateVersion; return player.grandTichu === true; });
	const isSmallTichu = $derived.by(() => { void stateVersion; return player.smallTichu; });
	const finishLabel: Record<number, string> = { 1: '1등', 2: '2등', 3: '3등', 4: '4등' };
</script>

<div class="opponent {position}" class:current-turn={isCurrentTurn}>
	<!-- Declarations -->
	<div class="declarations">
		{#if isGrandTichu}
			<div class="declaration grand">GT</div>
		{/if}
		{#if isSmallTichu}
			<div class="declaration small-tichu">ST</div>
		{/if}
	</div>

	<div class="opponent-card">
		<div class="avatar-container">
			<div class="avatar team-{player.team}" class:finished={finishOrder !== null}>
				{#if finishOrder !== null}
					<span class="finish-badge">{finishLabel[finishOrder]}</span>
				{:else}
					{player.name.charAt(0)}
				{/if}
			</div>
			{#if isCurrentTurn && cardCount > 0}
				<div class="thinking-ring"></div>
			{/if}
		</div>
		
		<div class="info-area">
			<div class="name-row">
				<span class="name">{player.name}</span>
				{#if isPartner}<span class="partner-badge">P</span>{/if}
			</div>
			{#if finishOrder !== null}
				<div class="finish-banner badge-{finishOrder}">{finishLabel[finishOrder]} 마감</div>
			{:else if cardCount > 0}
				<div class="card-count-badge">
					<span class="count-num">{cardCount}</span>
					<span class="count-label">장</span>
				</div>
			{/if}
			{#if passed}
				<div class="pass-badge">패스</div>
			{/if}
		</div>
	</div>
</div>

<style>
	/* Fonts */
	@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

	.opponent {
		position: absolute;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		z-index: 20;
		font-family: 'Inter', sans-serif;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.opponent-card {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 12px 10px;
		background: rgba(30, 41, 59, 0.65); /* Dark Slate/Blue-ish Glass */
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border-radius: 20px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
		min-width: 72px;
		gap: 8px;
		transition: all 0.3s ease;
	}

	/* Current Turn Styles */
	.opponent.current-turn .opponent-card {
		background: rgba(30, 41, 59, 0.8);
		border-color: rgba(251, 191, 36, 0.6);
		box-shadow: 0 0 25px rgba(251, 191, 36, 0.3), inset 0 0 10px rgba(251, 191, 36, 0.1);
		transform: scale(1.05);
	}

	.avatar-container {
		position: relative;
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.avatar {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 700;
		font-size: 1.1rem;
		color: #fff;
		border: 2px solid rgba(255,255,255,0.2);
		box-shadow: 0 4px 10px rgba(0,0,0,0.3);
		text-shadow: 0 1px 2px rgba(0,0,0,0.5);
		z-index: 2;
	}
	.avatar.team-A { background: linear-gradient(135deg, #ef4444, #991b1b); }
	.avatar.team-B { background: linear-gradient(135deg, #3b82f6, #1e40af); }
	.avatar.finished { background: linear-gradient(135deg, #22c55e, #166534); border-color: #86efac; }
	.finish-badge { font-size: 0.75rem; }

	.thinking-ring {
		position: absolute;
		top: -4px; left: -4px; right: -4px; bottom: -4px;
		border-radius: 50%;
		border: 2px solid #fbbf24;
		opacity: 0;
		animation: thinkRing 1.5s infinite;
		z-index: 1;
	}
	@keyframes thinkRing {
		0% { transform: scale(0.9); opacity: 0.8; }
		100% { transform: scale(1.3); opacity: 0; }
	}

	.info-area {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}

	.name-row {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.name {
		font-size: 0.8rem;
		font-weight: 600;
		color: #e2e8f0;
		max-width: 80px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-shadow: 0 1px 2px rgba(0,0,0,0.6);
	}
	.partner-badge {
		font-size: 0.6rem;
		background: rgba(220, 38, 38, 0.4);
		color: #fca5a5;
		padding: 1px 4px;
		border-radius: 4px;
		font-weight: 700;
	}

	.card-count-badge {
		background: rgba(0, 0, 0, 0.3);
		padding: 2px 10px;
		border-radius: 10px;
		display: flex;
		align-items: baseline;
		gap: 2px;
	}
	.count-num {
		font-size: 0.9rem;
		font-weight: 700;
		color: #fbbf24;
	}
	.count-label {
		font-size: 0.7rem;
		color: #94a3b8;
		font-weight: 500;
	}

	.finish-banner {
		font-size: 0.75rem;
		font-weight: 800;
		padding: 2px 8px;
		border-radius: 6px;
		box-shadow: 0 2px 6px rgba(0,0,0,0.3);
		margin-top: 2px;
	}
	.finish-banner.badge-1 { background: linear-gradient(135deg, #fbbf24, #d97706); color: #fff; border: 1px solid #fde68a; }
	.finish-banner.badge-2 { background: linear-gradient(135deg, #94a3b8, #64748b); color: #fff; border: 1px solid #cbd5e1; }
	.finish-banner.badge-3 { background: linear-gradient(135deg, #b45309, #78350f); color: #fff; border: 1px solid #fcd34d; }
	.finish-banner.badge-4 { background: rgba(0,0,0,0.5); color: #9ca3af; border: 1px solid #4b5563; }

	.pass-badge {
		position: absolute;
		top: -8px;
		right: -8px;
		font-size: 0.75rem;
		font-weight: 800;
		color: #fff;
		background: rgba(107, 114, 128, 0.95); /* Visible Gray */
		padding: 4px 10px;
		border-radius: 10px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		box-shadow: 0 4px 10px rgba(0,0,0,0.3);
		z-index: 30;
		animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
	}

	.declarations {
		position: absolute;
		display: flex;
		gap: 4px;
		z-index: 30;
	}
	.declaration {
		font-size: 0.7rem;
		font-weight: 800;
		padding: 3px 8px;
		border-radius: 8px;
		color: #fff;
		box-shadow: 0 4px 10px rgba(0,0,0,0.3);
		animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
	}
	.declaration.grand {
		background: linear-gradient(135deg, #dc2626, #b91c1c);
		border: 1px solid rgba(252, 165, 165, 0.4);
	}
	.declaration.small-tichu {
		background: linear-gradient(135deg, #059669, #047857);
		border: 1px solid rgba(110, 231, 183, 0.4);
	}
	@keyframes popIn { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }

	/* Positioning Logic */
	.left {
		left: 16px;
		top: 50%;
		transform: translateY(-50%);
	}
	.left .declarations {
		bottom: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-bottom: 8px;
	}

	.top {
		top: 8px;
		left: 50%;
		transform: translateX(-50%);
	}
	.top .declarations {
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-top: 8px;
	}

	.right {
		right: 16px;
		top: 50%;
		transform: translateY(-50%);
	}
	.right .declarations {
		bottom: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-bottom: 8px;
	}
</style>

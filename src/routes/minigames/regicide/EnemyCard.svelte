<script lang="ts">
	import { SUIT_SYMBOL, SUIT_COLOR, SUIT_NAME_KO, SUIT_POWER_NAME } from '$lib/games/regicide/types';
	import type { Enemy, Suit } from '$lib/games/regicide/types';

	type AnimEvent =
		| { type: 'power'; suits: Suit[]; immuneSuits: Suit[]; attackValue: number }
		| { type: 'damage'; amount: number; doubled: boolean }
		| { type: 'defeat'; exactKill: boolean }
		| { type: 'enemy_attack'; amount: number }
		| null;

	let { enemy, enemiesDefeated, animEvent = null }: {
		enemy: Enemy;
		enemiesDefeated: number;
		animEvent?: AnimEvent;
	} = $props();

	const color = $derived(SUIT_COLOR[enemy.card.suit] === 'red' ? '#ef4444' : '#e2e8f0');
	const symbol = $derived(SUIT_SYMBOL[enemy.card.suit]);
	const hpPercent = $derived(Math.max(0, (enemy.currentHp / enemy.maxHp) * 100));
	const effectiveAttack = $derived(Math.max(0, enemy.attack - enemy.shieldReduction));

	function hpBarColor(pct: number): string {
		if (pct > 60) return '#22c55e';
		if (pct > 30) return '#eab308';
		return '#ef4444';
	}

	const POWER_CONFIG: Record<Suit, { color: string; label: string }> = {
		diamonds: { color: '#3b82f6', label: '드로우' },
		spades: { color: '#60a5fa', label: '방어' },
		clubs: { color: '#ef4444', label: '×2' },
		hearts: { color: '#22c55e', label: '치유' }
	};
</script>

<div class="enemy-container">
<div class="enemy-top">
	<!-- Left: Card -->
	<div class="enemy-card-area">
		<div
			class="enemy-card"
			class:shake={animEvent?.type === 'damage'}
			class:defeated={animEvent?.type === 'defeat'}
			class:enemy-attacking={animEvent?.type === 'enemy_attack'}
			style:color={color}
		>
			<div class="corner top-left">
				<span class="rank">{enemy.card.rank}</span>
				<span class="suit">{symbol}</span>
			</div>
			<div class="center-suit">{symbol}</div>
			<div class="corner bottom-right">
				<span class="rank">{enemy.card.rank}</span>
				<span class="suit">{symbol}</span>
			</div>
		</div>

		<!-- Damage popup -->
		{#if animEvent?.type === 'damage'}
			<div class="damage-popup" class:doubled={animEvent.doubled}>
				-{animEvent.amount}
			</div>
		{/if}

		<!-- Defeat badge -->
		{#if animEvent?.type === 'defeat'}
			<div class="defeat-badge">
				{animEvent.exactKill ? '완벽 처치!' : '처치!'}
			</div>
		{/if}

		<!-- Enemy attack flash -->
		{#if animEvent?.type === 'enemy_attack'}
			<div class="attack-flash">
				⚔️ {animEvent.amount}
			</div>
		{/if}

		<!-- Power flash overlays -->
		{#if animEvent?.type === 'power'}
			<div class="power-overlay">
				{#each animEvent.suits as suit}
					<span class="power-tag" style:background={POWER_CONFIG[suit].color}>
						{SUIT_SYMBOL[suit]} {POWER_CONFIG[suit].label}
					</span>
				{/each}
				{#each animEvent.immuneSuits as suit}
					<span class="power-tag immune">
						{SUIT_SYMBOL[suit]} 면역
					</span>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Right: Stats -->
	<div class="enemy-stats">
		<div class="enemy-name" style:color={SUIT_COLOR[enemy.card.suit] === 'red' ? '#dc2626' : '#1e293b'}>
			{enemy.card.rank}{symbol}
			<span class="tier-text">처치 {enemiesDefeated}/12</span>
		</div>

		<div class="stats-row">
			<span class="stat">⚔️ ATK {enemy.attack}</span>
			{#if enemy.shieldReduction > 0}
				<span class="stat shield">🛡️ -{enemy.shieldReduction} = {effectiveAttack}</span>
			{/if}
		</div>

		<div class="immune-row">
			<span class="immune-label">면역</span>
			<span class="immune-suit" style:color={SUIT_COLOR[enemy.card.suit] === 'red' ? '#dc2626' : '#475569'}>
				{symbol} {SUIT_NAME_KO[enemy.card.suit]}
			</span>
		</div>
	</div>
	</div>
	<div class="enemy-bottom">
		<div class="hp-section">
			<div class="hp-label">HP {enemy.currentHp}/{enemy.maxHp}</div>
			<div class="hp-bar-track">
				<div
					class="hp-bar-fill"
					style:width="{hpPercent}%"
					style:background={hpBarColor(hpPercent)}
				></div>
			</div>
		</div>
	</div>
</div>

<style>
	.enemy-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 2px 12px;
		background: var(--bg-surface);
		border-radius: 12px;
		border: 1px solid var(--border-primary);
		width: 100%;
	}
	.enemy-top{
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 12px;
		padding: 8px 12px;
		background: var(--bg-surface);
		border-radius: 12px;
		border: 1px solid var(--border-primary);
		width: 100%;
	}
	.enemy-bottom {
		display: flex;
		width: 100%;
		padding: 0 4px;
	}

	/* ─── Card ─── */

	.enemy-card-area {
		position: relative;
		flex-shrink: 0;
	}

	.enemy-card {
		width: 64px;
		height: 90px;
		background: #0f172a;
		border-radius: 6px;
		border: 2px solid #334155;
		position: relative;
		box-shadow: var(--shadow-lg);
		transition: border-color 0.3s;
	}

	.corner {
		position: absolute;
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 1;
		padding: 3px 4px;
	}
	.top-left { top: 0; left: 0; }
	.bottom-right { bottom: 0; right: 0; transform: rotate(180deg); }
	.rank { font-size: 13px; font-weight: 800; font-family: 'Georgia', serif; }
	.suit { font-size: 9px; line-height: 1; }
	.center-suit {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 24px;
		line-height: 1;
		opacity: 0.9;
	}

	/* ─── Stats (right side) ─── */

	.enemy-stats {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
	}

	.enemy-name {
		font-size: 18px;
		font-weight: 800;
		color: var(--text-primary);
		display: flex;
		align-items: baseline;
		gap: 6px;
	}

	.tier-text {
		font-size: 11px;
		font-weight: 500;
		color: var(--text-tertiary);
	}

	.hp-section {
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 100%;
	}

	.hp-label {
		font-size: 12px;
		font-weight: 700;
		color: var(--text-primary);
	}

	.hp-bar-track {
		width: 100%;
		height: 10px;
		background: var(--bg-tertiary);
		border-radius: 5px;
		overflow: hidden;
	}

	.hp-bar-fill {
		height: 100%;
		border-radius: 4px;
		transition: width 0.4s ease, background 0.4s ease;
	}

	.stats-row {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.stat {
		font-size: 14px;
		font-weight: 700;
		color: var(--text-primary);
	}

	.stat.shield {
		color: #2563eb;
	}

	.immune-row {
		display: flex;
		align-items: center;
		gap: 5px;
		font-size: 13px;
	}

	.immune-label {
		color: var(--text-tertiary);
		font-weight: 600;
		background: var(--bg-tertiary);
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 12px;
	}

	.immune-suit {
		font-weight: 700;
		font-size: 14px;
	}

	/* ─── Animations ─── */

	.enemy-card.shake {
		animation: shake 0.4s ease;
		border-color: #ef4444;
	}
	@keyframes shake {
		0%, 100% { transform: translateX(0); }
		15% { transform: translateX(-5px) rotate(-1deg); }
		30% { transform: translateX(4px) rotate(1deg); }
		45% { transform: translateX(-3px); }
		60% { transform: translateX(2px); }
	}

	.enemy-card.defeated {
		animation: defeatShrink 0.7s ease-in forwards;
	}
	@keyframes defeatShrink {
		0% { transform: scale(1); opacity: 1; }
		40% { transform: scale(1.05); opacity: 1; }
		100% { transform: scale(0.3) rotate(10deg); opacity: 0; }
	}

	.enemy-card.enemy-attacking {
		animation: enemyPulse 0.5s ease;
		border-color: #f59e0b;
		box-shadow: 0 0 16px rgba(245, 158, 11, 0.4);
	}
	@keyframes enemyPulse {
		0%, 100% { transform: scale(1); }
		50% { transform: scale(1.05); }
	}

	.damage-popup {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 24px;
		font-weight: 900;
		color: #ef4444;
		text-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
		animation: damageFloat 0.6s ease-out forwards;
		pointer-events: none;
		z-index: 10;
	}
	.damage-popup.doubled {
		color: #f59e0b;
		font-size: 28px;
	}
	@keyframes damageFloat {
		0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
		30% { transform: translate(-50%, -70%) scale(1.2); opacity: 1; }
		100% { transform: translate(-50%, -120%) scale(1); opacity: 0; }
	}

	.defeat-badge {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 14px;
		font-weight: 800;
		color: #fbbf24;
		text-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
		background: rgba(0, 0, 0, 0.6);
		padding: 4px 10px;
		border-radius: 6px;
		animation: defeatBadge 0.7s ease forwards;
		pointer-events: none;
		z-index: 10;
		white-space: nowrap;
	}
	@keyframes defeatBadge {
		0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
		40% { transform: translate(-50%, -50%) scale(1.1); opacity: 1; }
		100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
	}

	.attack-flash {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 20px;
		font-weight: 800;
		color: #f59e0b;
		text-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
		animation: attackFlash 0.5s ease;
		pointer-events: none;
		z-index: 10;
	}
	@keyframes attackFlash {
		0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
		50% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
		100% { transform: translate(-50%, -50%) scale(1); opacity: 0.8; }
	}

	.power-overlay {
		position: absolute;
		top: -6px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 3px;
		animation: powerSlide 0.7s ease forwards;
		pointer-events: none;
		z-index: 10;
		white-space: nowrap;
	}
	@keyframes powerSlide {
		0% { transform: translateX(-50%) translateY(8px); opacity: 0; }
		30% { transform: translateX(-50%) translateY(-4px); opacity: 1; }
		100% { transform: translateX(-50%) translateY(-4px); opacity: 0; }
	}

	.power-tag {
		font-size: 10px;
		font-weight: 700;
		color: #fff;
		padding: 2px 6px;
		border-radius: 4px;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
	}
	.power-tag.immune {
		background: #64748b;
	}
</style>

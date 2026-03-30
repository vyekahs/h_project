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

	const tierLabel = $derived(() => {
		const rank = enemy.card.rank;
		if (rank === 'J') return 'J단계';
		if (rank === 'Q') return 'Q단계';
		return 'K단계';
	});

	const tierProgress = $derived(`${enemiesDefeated}/12`);

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
	<div class="tier-badge">
		{tierLabel()} — 처치 {tierProgress}
	</div>

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
				{animEvent.exactKill ? '정확 처치!' : '처치!'}
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

	<div class="hp-section">
		<div class="hp-bar-track">
			<div
				class="hp-bar-fill"
				style:width="{hpPercent}%"
				style:background={hpBarColor(hpPercent)}
			></div>
		</div>
		<div class="hp-text">
			HP: {enemy.currentHp} / {enemy.maxHp}
		</div>
	</div>

	<div class="stats-row">
		<div class="stat">
			<span class="stat-icon">⚔️</span>
			<span class="stat-label">ATK</span>
			<span class="stat-value">{enemy.attack}</span>
		</div>
		{#if enemy.shieldReduction > 0}
			<div class="stat shield">
				<span class="stat-icon">🛡️</span>
				<span class="stat-value">-{enemy.shieldReduction}</span>
				<span class="stat-effective">= {effectiveAttack}</span>
			</div>
		{/if}
	</div>

	<div class="immune-row">
		<span class="immune-label">면역</span>
		<span class="immune-suit" style:color={SUIT_COLOR[enemy.card.suit] === 'red' ? '#ef4444' : '#475569'}>
			{symbol} {SUIT_NAME_KO[enemy.card.suit]}
		</span>
	</div>
</div>

<style>
	.enemy-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 12px;
		background: var(--bg-surface);
		border-radius: 12px;
		border: 1px solid var(--border-primary);
	}

	.tier-badge {
		font-size: 11px;
		font-weight: 600;
		color: var(--text-tertiary);
		background: var(--bg-tertiary);
		padding: 3px 10px;
		border-radius: 10px;
	}

	.enemy-card-area {
		position: relative;
	}

	.enemy-card {
		width: 90px;
		height: 126px;
		background: #0f172a;
		border-radius: 8px;
		border: 2px solid #334155;
		position: relative;
		box-shadow: var(--shadow-lg);
		transition: border-color 0.3s;
	}

	/* ─── Animations ─── */

	.enemy-card.shake {
		animation: shake 0.4s ease;
		border-color: #ef4444;
	}
	@keyframes shake {
		0%, 100% { transform: translateX(0); }
		15% { transform: translateX(-6px) rotate(-1deg); }
		30% { transform: translateX(5px) rotate(1deg); }
		45% { transform: translateX(-4px); }
		60% { transform: translateX(3px); }
		75% { transform: translateX(-2px); }
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
		box-shadow: 0 0 20px rgba(245, 158, 11, 0.4);
	}
	@keyframes enemyPulse {
		0%, 100% { transform: scale(1); }
		50% { transform: scale(1.06); }
	}

	/* ─── Overlays ─── */

	.damage-popup {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 28px;
		font-weight: 900;
		color: #ef4444;
		text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
		animation: damageFloat 0.6s ease-out forwards;
		pointer-events: none;
		z-index: 10;
	}
	.damage-popup.doubled {
		color: #f59e0b;
		font-size: 32px;
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
		font-size: 18px;
		font-weight: 800;
		color: #fbbf24;
		text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
		background: rgba(0, 0, 0, 0.6);
		padding: 6px 16px;
		border-radius: 8px;
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
		font-size: 24px;
		font-weight: 800;
		color: #f59e0b;
		text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
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
		top: -8px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 4px;
		animation: powerSlide 0.7s ease forwards;
		pointer-events: none;
		z-index: 10;
		white-space: nowrap;
	}
	@keyframes powerSlide {
		0% { transform: translateX(-50%) translateY(10px); opacity: 0; }
		30% { transform: translateX(-50%) translateY(-4px); opacity: 1; }
		100% { transform: translateX(-50%) translateY(-4px); opacity: 0; }
	}

	.power-tag {
		font-size: 11px;
		font-weight: 700;
		color: #fff;
		padding: 3px 8px;
		border-radius: 6px;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
	}
	.power-tag.immune {
		background: #64748b;
	}

	/* ─── Card face ─── */

	.corner {
		position: absolute;
		display: flex;
		flex-direction: column;
		align-items: center;
		line-height: 1;
		padding: 5px 6px;
	}
	.top-left { top: 0; left: 0; }
	.bottom-right { bottom: 0; right: 0; transform: rotate(180deg); }
	.rank { font-size: 16px; font-weight: 800; font-family: 'Georgia', serif; }
	.suit { font-size: 12px; line-height: 1; }
	.center-suit {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 36px;
		line-height: 1;
		opacity: 0.9;
	}

	/* ─── HP ─── */

	.hp-section { width: 100%; max-width: 180px; }
	.hp-bar-track {
		width: 100%;
		height: 10px;
		background: var(--bg-tertiary);
		border-radius: 5px;
		overflow: hidden;
	}
	.hp-bar-fill {
		height: 100%;
		border-radius: 5px;
		transition: width 0.4s ease, background 0.4s ease;
	}
	.hp-text {
		text-align: center;
		font-size: 12px;
		font-weight: 600;
		color: var(--text-primary);
		margin-top: 3px;
	}

	/* ─── Stats ─── */

	.stats-row { display: flex; gap: 12px; align-items: center; }
	.stat { display: flex; align-items: center; gap: 4px; font-size: 13px; color: var(--text-primary); }
	.stat-icon { font-size: 14px; }
	.stat-label { font-weight: 500; color: var(--text-tertiary); }
	.stat-value { font-weight: 700; }
	.stat.shield .stat-value { color: #60a5fa; }
	.stat-effective { color: #f59e0b; font-weight: 700; }

	.immune-row { display: flex; align-items: center; gap: 6px; font-size: 11px; }
	.immune-label {
		color: var(--text-tertiary);
		font-weight: 500;
		background: var(--bg-tertiary);
		padding: 1px 6px;
		border-radius: 4px;
	}
	.immune-suit { font-weight: 600; font-size: 12px; }
</style>

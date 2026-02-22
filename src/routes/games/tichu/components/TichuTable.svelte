<script lang="ts">
	import { untrack } from 'svelte';
	import type { SeatIndex } from '$lib/games/tichu/types';
	import type { GameEvent } from '$lib/games/tichu/ai/localGameEngine';
	import OpponentArea from './OpponentArea.svelte';
	import TrickArea from './TrickArea.svelte';
	import PlayerHand from './PlayerHand.svelte';
	import TichuDeclareModal from './TichuDeclareModal.svelte';
	import CardComponent from './CardComponent.svelte';
	import { triggerHaptic } from '$lib/stores/haptics';

	let { game } = $props<{ game: any }>();

	// Helper: access stateVersion to trigger reactivity on mutable engine state
	function gs() {
		void game.stateVersion;
		return game.gameState;
	}

	// Human is always seat 0
	const mySeat = 0 as SeatIndex;
	const leftSeat = 3 as SeatIndex;
	const topSeat = 2 as SeatIndex;   // partner
	const rightSeat = 1 as SeatIndex;

	const myPlayer = $derived.by(() => gs()?.players[mySeat]);
	const leftPlayer = $derived.by(() => gs()?.players[leftSeat]);
	const topPlayer = $derived.by(() => gs()?.players[topSeat]);
	const rightPlayer = $derived.by(() => gs()?.players[rightSeat]);

	const currentSeat = $derived.by(() => gs()?.round?.currentSeat ?? null);
	const trick = $derived.by(() => gs()?.round?.trick ?? null);

	// Derive lastPlay here (where gs() forces reactivity) because trick is a mutable
	// object — TrickArea's $derived won't detect plays array mutations.
	const lastPlay = $derived.by(() => {
		const t = gs()?.round?.trick;
		if (!t || t.plays.length === 0) return null;
		return t.plays[t.plays.length - 1];
	});

	// Player names for trick display
	const playerNames = $derived.by(() => {
		const s = gs();
		if (!s) return {} as Record<number, string>;
		const names: Record<number, string> = {};
		for (let i = 0; i < 4; i++) names[i] = s.players[i]?.name ?? `P${i + 1}`;
		return names;
	});

	const isGrandTichuPhase = $derived(game.isGrandTichuPhase);

	// Last event for visual feedback
	const lastEvent = $derived(game.lastEvent as GameEvent | null);

	// Track which seats have passed in the current trick (persistent)
	let passedSeats = $state(new Set<SeatIndex>());

	$effect(() => {
		const evt = lastEvent;
		if (!evt) return;
		untrack(() => {
			if (evt.type === 'pass') {
				passedSeats = new Set(passedSeats).add(evt.seat);
			} else if (evt.type === 'play' || evt.type === 'bomb' || evt.type === 'trick_won' || evt.type === 'dog' || evt.type === 'dragon_gift') {
				if (passedSeats.size > 0) passedSeats = new Set();
			}
		});
	});

	const leftPassed = $derived(passedSeats.has(leftSeat));
	const topPassed = $derived(passedSeats.has(topSeat));
	const rightPassed = $derived(passedSeats.has(rightSeat));

	// Haptic feedback for my turn and big events
	$effect(() => {
		const evt = lastEvent;
		if (!evt) return;

		untrack(() => {
			// My turn
			if (game.isMyTurn && evt.type !== 'play' && evt.type !== 'pass' && evt.type !== 'bomb') {
				// Prevent triggering multiple times if the event hasn't really changed the phase
				// We mostly want to trigger when a previous player plays or passes and now it's my turn over.
				// However, `game.isMyTurn` could be true initially or after someone plays.
				// A reliable way is to watch `currentSeat` transitions to `mySeat`.
			}
			
			// Big Impact: Bomb
			if (evt.type === 'bomb') {
				triggerHaptic([300, 100, 300]);
			}
		});
	});

	// Separate effect to watch turn transitions clearly
	let previousTurnSeat: SeatIndex | null = $state(null);
	$effect(() => {
		const current = currentSeat;
		untrack(() => {
			if (current === mySeat && previousTurnSeat !== mySeat) {
				// It just became my turn
				triggerHaptic([100, 50, 100]); // Increased duration
			}
			previousTurnSeat = current;
		});
	});

	// Watch for Grand Tichu declarations
	let previousGrandDecls: number = $state(0);
	$effect(() => {
		const currentDecls = tichuDeclarations.filter(d => d.type === 'grand').length;
		untrack(() => {
			if (currentDecls > previousGrandDecls) {
				// Someone declared Grand Tichu
				triggerHaptic([300, 100, 300]);
			}
			previousGrandDecls = currentDecls;
		});
	});

	function seatPosition(seat: SeatIndex): 'left' | 'top' | 'right' | 'bottom' {
		const rel = ((seat - mySeat + 4) % 4);
		if (rel === 0) return 'bottom';
		if (rel === 1) return 'right';
		if (rel === 2) return 'top';
		return 'left';
	}

	const trickWonSeat = $derived.by(() => {
		if (!lastEvent || lastEvent.type !== 'trick_won') return null;
		return lastEvent.seat;
	});

	const trickWonName = $derived.by(() => {
		if (trickWonSeat === null) return '';
		return gs()?.players[trickWonSeat]?.name ?? '';
	});

	// Dog card event
	const dogEvent = $derived.by(() => {
		if (!lastEvent || lastEvent.type !== 'dog') return null;
		return lastEvent as { type: 'dog'; seat: SeatIndex; targetSeat: SeatIndex };
	});

	// Dragon gift event
	const dragonGiftEvent = $derived.by(() => {
		if (!lastEvent || lastEvent.type !== 'dragon_gift') return null;
		return lastEvent as { type: 'dragon_gift'; seat: SeatIndex; targetSeat: SeatIndex };
	});

	// Phase display
	const phaseLabel = $derived.by(() => {
		const p = game.phase;
		if (p === 'grand_tichu_window') return '그랜드 티츄';
		if (p === 'exchange') return '카드 교환';
		if (p === 'playing') return null;
		if (p === 'wish_declare') return '소원 선언';
		if (p === 'dragon_gift') return '용 양도';
		if (p === 'round_end') return '라운드 종료';
		if (p === 'game_end') return '게임 종료';
		return null;
	});

	// Wish indicator
	const wishActive = $derived.by(() => gs()?.round?.wish?.active ?? false);
	const wishRank = $derived.by(() => gs()?.round?.wish?.requestedRank);
	const rankNames: Record<number, string> = {
		2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8',
		9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A'
	};

	// Tichu declarations for all players (for display)
	const tichuDeclarations = $derived.by(() => {
		const s = gs();
		if (!s) return [];
		const decls: { seat: SeatIndex; name: string; type: 'grand' | 'small' }[] = [];
		for (const p of s.players) {
			if (p.grandTichu === true) decls.push({ seat: p.seat, name: p.name, type: 'grand' });
			else if (p.smallTichu) decls.push({ seat: p.seat, name: p.name, type: 'small' });
		}
		return decls;
	});
</script>

<div class="game-table">
	<!-- Score Header -->
	<div class="score-header">
		<div class="team-score team-a">
			우리: {gs()?.cumulativeScoreA ?? 0}
		</div>
		<div class="round-info">
			R{(gs()?.completedRounds?.length ?? 0) + 1}
		</div>
		<div class="team-score team-b">
			상대: {gs()?.cumulativeScoreB ?? 0}
		</div>
		<button class="btn-back" onclick={() => game.pauseGame()} title="나가기">
			✕
		</button>
	</div>

	<!-- Phase indicator -->
	{#if phaseLabel}
		<div class="phase-indicator">{phaseLabel}</div>
	{/if}

	<!-- Tichu declarations banner -->
	{#if tichuDeclarations.length > 0}
		<div class="tichu-declarations">
			{#each tichuDeclarations as decl (decl.seat)}
				<div class="tichu-badge" class:grand={decl.type === 'grand'} class:small={decl.type === 'small'} class:is-me={decl.seat === mySeat}>
					{decl.name}: {decl.type === 'grand' ? '그랜드 티츄' : '스몰 티츄'}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Table Area -->
	<div class="table-field">
		<!-- Small Tichu button (inside table-field so it stays above hand area) -->
		{#if game.canDeclareSmallTichu}
			<button class="btn-small-tichu" onclick={() => game.declareSmallTichu()}>
				스몰 티츄!
			</button>
		{/if}
		<!-- Opponents -->
		{#if leftPlayer}
			<OpponentArea
				player={leftPlayer}
				isCurrentTurn={currentSeat === leftSeat}
				position="left"
				passed={passedSeats.has(leftSeat)}
				stateVersion={game.stateVersion}
			/>
		{/if}
		{#if topPlayer}
			<OpponentArea
				player={topPlayer}
				isCurrentTurn={currentSeat === topSeat}
				position="top"
				isPartner
				passed={passedSeats.has(topSeat)}
				stateVersion={game.stateVersion}
			/>
		{/if}
		{#if rightPlayer}
			<OpponentArea
				player={rightPlayer}
				isCurrentTurn={currentSeat === rightSeat}
				position="right"
				passed={passedSeats.has(rightSeat)}
				stateVersion={game.stateVersion}
			/>
		{/if}

		<!-- Center Trick (only show during play phases) -->
		<div class="center-area">
			{#if game.phase === 'playing' || game.phase === 'wish_declare' || game.phase === 'dragon_gift' || game.phase === 'round_ending'}
				{#if dogEvent}
					<div class="special-event-notice dog-notice">
						<img src="/tichu/dog.svg" alt="Dog" class="event-icon-img" />
						<span>{playerNames[dogEvent.seat]} → {playerNames[dogEvent.targetSeat]}에게 선 양도</span>
					</div>
				{:else if dragonGiftEvent}
					<div class="special-event-notice dragon-notice">
						<img src="/tichu/dragon.svg" alt="Dragon" class="event-icon-img" />
						<span>{playerNames[dragonGiftEvent.seat]} → {playerNames[dragonGiftEvent.targetSeat]}에게 용 양도</span>
					</div>
				{:else if trickWonSeat !== null}
					<div class="trick-won-notice">
						{trickWonSeat === mySeat ? '트릭 승리!' : `${trickWonName} 승리`}
					</div>
				{:else}
					<TrickArea {trick} {lastPlay} {mySeat} {playerNames} isMyTurn={game.isMyTurn} />
				{/if}
			{/if}
			{#if wishActive && wishRank}
				<div class="wish-indicator">
					소원: {rankNames[wishRank] ?? wishRank}
				</div>
			{/if}
		</div>

		<!-- My turn indicator / Finish indicator -->
		{#if myPlayer?.finishOrder !== null}
			<div class="my-finish-indicator badge-{myPlayer?.finishOrder}">
				{myPlayer?.finishOrder}등 마감!
			</div>
		{:else if game.isMyTurn && trickWonSeat === null && !dogEvent && !dragonGiftEvent}
			<div class="my-turn-indicator">내 차례!</div>
		{/if}
	</div>

	<!-- Grand Tichu Phase -->
	{#if isGrandTichuPhase}
		<TichuDeclareModal {game} />
	{/if}

	<!-- Exchange Result Overlay -->
	{#if game.exchangeResultData}
		<div class="exchange-result-overlay">
			<div class="exchange-result-content">
				<div class="exchange-result-title">받은 카드</div>
				<div class="exchange-result-cards">
					{#each game.exchangeResultData as entry}
						<div class="exchange-result-item">
							<span class="exchange-from">{entry.fromName}</span>
							<CardComponent card={entry.card} />
						</div>
					{/each}
				</div>
				<button class="exchange-result-dismiss" onclick={() => game.dismissExchangeResult()}>
					확인
				</button>
			</div>
		</div>
	{/if}

	<!-- My Hand (bottom) -->
	<PlayerHand {game} />
</div>

<style>
	/* Fonts */
	@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

	.game-table {
		display: flex;
		flex-direction: column;
		height: 100vh;
		height: 100dvh;
		position: relative;
		overflow: hidden;
		font-family: 'Inter', sans-serif;
	}

	.score-header {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 20px;
		padding: 12px 20px;
		padding-top: calc(12px + env(safe-area-inset-top));
		background: rgba(0, 0, 0, 0.4);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border-bottom: 1px solid rgba(251, 191, 36, 0.3);
		font-size: 0.95rem;
		font-weight: 700;
		color: #f3f4f6;
		box-shadow: 0 4px 20px rgba(0,0,0,0.4);
	}
	.team-score {
		display: flex;
		align-items: center;
		gap: 6px;
		text-shadow: 0 1px 2px rgba(0,0,0,0.5);
	}
	.team-score.team-a { color: #fca5a5; } /* Light Red for Team A (Us) */
	.team-score.team-b { color: #93c5fd; } /* Light Blue for Team B (Them) */

	.round-info {
		color: #d1d5db;
		font-size: 0.8rem;
		background: rgba(255,255,255,0.1);
		padding: 2px 8px;
		border-radius: 6px;
		font-weight: 600;
	}
	.btn-back {
		position: absolute;
		right: 16px;
		background: rgba(255,255,255,0.1);
		border: 1px solid rgba(255,255,255,0.2);
		border-radius: 50%;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #e5e7eb;
		font-size: 1rem;
		cursor: pointer;
		transition: all 0.2s;
	}
	.btn-back:hover {
		background: rgba(255,255,255,0.2);
		color: #fff;
		transform: scale(1.1);
	}

	.phase-indicator {
		position: absolute;
		top: 60px;
		left: 16px;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid rgba(251, 191, 36, 0.4);
		color: #fbbf24;
		padding: 6px 16px;
		border-radius: 14px;
		font-size: 0.8rem;
		font-weight: 700;
		z-index: 50;
		white-space: nowrap;
		box-shadow: 0 4px 12px rgba(0,0,0,0.3);
		text-shadow: 0 1px 2px rgba(0,0,0,0.5);
	}

	.pass-bubble {
		position: absolute;
		background: rgba(0, 0, 0, 0.85); /* Much darker background */
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 2px solid rgba(209, 213, 219, 0.4); /* Stronger border */
		color: #ffffff; /* Pure white text */
		padding: 8px 20px; /* Larger padding */
		border-radius: 16px;
		font-size: 1.1rem; /* Much larger font */
		font-weight: 800;
		letter-spacing: 0.05em;
		z-index: 40;
		pointer-events: none;
		box-shadow: 0 8px 24px rgba(0,0,0,0.6);
		text-shadow: 0 2px 4px rgba(0,0,0,0.8);
		white-space: nowrap;
	}

	/* Tichu declarations */
	.tichu-declarations {
		display: flex;
		justify-content: center;
		gap: 10px;
		padding: 8px 12px;
		flex-wrap: wrap;
	}
	.tichu-badge {
		padding: 5px 14px;
		border-radius: 12px;
		font-size: 0.8rem;
		font-weight: 700;
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		animation: tichuPop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
		box-shadow: 0 4px 10px rgba(0,0,0,0.2);
		text-shadow: 0 1px 1px rgba(0,0,0,0.3);
	}
	/* Grand Tichu: Imperial Gold/Red */
	.tichu-badge.grand {
		background: linear-gradient(135deg, rgba(220, 38, 38, 0.8), rgba(153, 27, 27, 0.9));
		border: 1px solid rgba(252, 165, 165, 0.5);
		color: #fef2f2;
	}
	/* Small Tichu: Jade/Blue */
	.tichu-badge.small {
		background: linear-gradient(135deg, rgba(5, 150, 105, 0.8), rgba(4, 120, 87, 0.9));
		border: 1px solid rgba(110, 231, 183, 0.5);
		color: #ecfdf5;
	}
	.tichu-badge.is-me {
		border: 2px solid #fbbf24; /* Gold border for me */
		box-shadow: 0 0 15px rgba(251, 191, 36, 0.4);
	}
	@keyframes tichuPop {
		0% { opacity: 0; transform: scale(0.5); }
		100% { opacity: 1; transform: scale(1); }
	}

	.wish-indicator {
		background: rgba(0, 0, 0, 0.75);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid rgba(251, 191, 36, 0.5);
		color: #fbbf24;
		padding: 6px 16px;
		border-radius: 16px;
		font-size: 0.85rem;
		font-weight: 700;
		box-shadow: 0 4px 15px rgba(0,0,0,0.3);
		text-shadow: 0 1px 2px rgba(0,0,0,0.5);
		white-space: nowrap;
	}

	.btn-small-tichu {
		position: absolute;
		bottom: 12px;
		right: 16px;
		z-index: 50;
		padding: 10px 20px;
		border-radius: 16px;
		border: 1px solid rgba(14, 165, 233, 0.4);
		background: rgba(14, 165, 233, 0.25); /* Semi-transparent blue for glassmorphism */
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		color: #e0f2fe;
		font-weight: 700;
		font-size: 0.9rem;
		cursor: pointer;
		transition: all 0.2s;
		box-shadow: 0 4px 15px rgba(14, 165, 233, 0.3);
		text-shadow: 0 1px 2px rgba(0,0,0,0.5);
	}
	.btn-small-tichu:hover {
		background: rgba(14, 165, 233, 0.4);
		transform: translateY(-2px) scale(1.05);
		box-shadow: 0 8px 20px rgba(14, 165, 233, 0.5);
		border-color: rgba(14, 165, 233, 0.6);
		color: #fff;
	}

	.table-field {
		flex: 1;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 0;
	}

	.center-area {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		z-index: 25;
	}

	.my-finish-indicator {
		position: absolute;
		bottom: 24px;
		left: 50%;
		transform: translateX(-50%);
		padding: 8px 32px;
		border-radius: 20px;
		font-size: 1.2rem;
		font-weight: 800;
		box-shadow: 0 4px 20px rgba(0,0,0,0.5);
		animation: turnPulse 2s ease-in-out infinite;
		text-shadow: 0 2px 4px rgba(0,0,0,0.5);
	}
	.my-finish-indicator.badge-1 { background: linear-gradient(135deg, #fbbf24, #d97706); color: #fff; border: 2px solid #fde68a; }
	.my-finish-indicator.badge-2 { background: linear-gradient(135deg, #94a3b8, #64748b); color: #fff; border: 2px solid #cbd5e1; }
	.my-finish-indicator.badge-3 { background: linear-gradient(135deg, #b45309, #78350f); color: #fff; border: 2px solid #fcd34d; }
	.my-finish-indicator.badge-4 { background: rgba(0,0,0,0.7); color: #9ca3af; border: 2px solid #4b5563; }

	.my-turn-indicator {
		position: absolute;
		bottom: 24px;
		left: 50%;
		transform: translateX(-50%);
		background: linear-gradient(90deg, rgba(251, 191, 36, 0.05), rgba(251, 191, 36, 0.8), rgba(251, 191, 36, 0.05));
		border-radius: 24px;
		color: #fff;
		padding: 10px 48px;
		font-size: 1.1rem;
		font-weight: 800;
		letter-spacing: 0.05em;
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
		box-shadow: 0 0 20px rgba(251, 191, 36, 0.3);
		animation: turnPulse 1.5s ease-in-out infinite;
		pointer-events: none;
	}
	@keyframes turnPulse {
		0%, 100% { opacity: 0.8; transform: translateX(-50%) scale(1); text-shadow: 0 0 10px rgba(251, 191, 36, 0.6); }
		50% { opacity: 1; transform: translateX(-50%) scale(1.05); text-shadow: 0 0 20px rgba(251, 191, 36, 0.9); }
	}

	/* Trick won notice */
	.trick-won-notice {
		background: rgba(16, 185, 129, 0.2); /* Jade Green Tint */
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid rgba(52, 211, 153, 0.4);
		color: #6ee7b7;
		padding: 10px 24px;
		border-radius: 16px;
		font-size: 1rem;
		font-weight: 700;
		animation: trickWonPop 0.4s ease-out;
		box-shadow: 0 4px 15px rgba(16, 185, 129, 0.2);
		text-shadow: 0 1px 2px rgba(0,0,0,0.5);
	}
	@keyframes trickWonPop {
		0% { opacity: 0; transform: scale(0.7); }
		60% { transform: scale(1.1); }
		100% { opacity: 1; transform: scale(1); }
	}

	/* Special event notices (dog, dragon gift) */
	.special-event-notice {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 24px;
		border-radius: 16px;
		font-size: 0.9rem;
		font-weight: 700;
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		animation: trickWonPop 0.4s ease-out;
		box-shadow: 0 4px 15px rgba(0,0,0,0.3);
		text-shadow: 0 1px 2px rgba(0,0,0,0.5);
	}
	.event-icon-img {
		width: 28px;
		height: 28px;
		object-fit: contain;
		filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
	}
	.dog-notice {
		background: rgba(124, 58, 237, 0.25);
		border: 1px solid rgba(167, 139, 250, 0.4);
		color: #ddd6fe;
	}
	.dragon-notice {
		background: rgba(220, 38, 38, 0.25);
		border: 1px solid rgba(252, 165, 165, 0.4);
		color: #fca5a5;
	}

	/* Exchange result overlay */
	.exchange-result-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.6);
		backdrop-filter: blur(5px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}
	.exchange-result-content {
		background: rgba(30, 41, 59, 0.85); /* Dark Slate */
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border: 1px solid rgba(255,255,255,0.1);
		border-radius: 24px;
		padding: 24px 32px;
		text-align: center;
		color: #f3f4f6;
		min-width: 240px;
		box-shadow: 0 20px 50px rgba(0,0,0,0.5);
		animation: modalIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
	}
	@keyframes modalIn {
		from { opacity: 0; transform: scale(0.95); }
		to { opacity: 1; transform: scale(1); }
	}

	.exchange-result-title {
		font-size: 1rem;
		font-weight: 700;
		margin-bottom: 20px;
		color: #9ca3af;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.exchange-result-cards {
		display: flex;
		justify-content: center;
		gap: 20px;
		margin-bottom: 24px;
	}
	.exchange-result-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}
	.exchange-from {
		font-size: 0.75rem;
		color: #cbd5e1;
		font-weight: 600;
	}
	.exchange-result-dismiss {
		padding: 10px 32px;
		border-radius: 14px;
		border: 1px solid rgba(255,255,255,0.2);
		background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
		color: #fff;
		font-weight: 700;
		font-size: 0.95rem;
		cursor: pointer;
		box-shadow: 0 4px 15px rgba(245,158,11,0.3);
		transition: all 0.2s;
	}
	.exchange-result-dismiss:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 20px rgba(245,158,11,0.5);
	}


</style>

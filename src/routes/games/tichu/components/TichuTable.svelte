<script lang="ts">
	import { untrack } from 'svelte';
	import type { SeatIndex } from '$lib/games/tichu/types';
	import type { GameEvent } from '$lib/games/tichu/ai/localGameEngine';
	import OpponentArea from './OpponentArea.svelte';
	import TrickArea from './TrickArea.svelte';
	import PlayerHand from './PlayerHand.svelte';
	import TichuDeclareModal from './TichuDeclareModal.svelte';
	import CardComponent from './CardComponent.svelte';

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
		<button class="btn-back" onclick={() => game.backToSetup()} title="나가기">
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

	<!-- Small Tichu button -->
	{#if game.canDeclareSmallTichu}
		<button class="btn-small-tichu" onclick={() => game.declareSmallTichu()}>
			스몰 티츄!
		</button>
	{/if}

	<!-- Table Area -->
	<div class="table-field">
		<!-- Opponents -->
		{#if leftPlayer}
			<OpponentArea
				player={leftPlayer}
				isCurrentTurn={currentSeat === leftSeat}
				position="left"
				stateVersion={game.stateVersion}
			/>
		{/if}
		{#if topPlayer}
			<OpponentArea
				player={topPlayer}
				isCurrentTurn={currentSeat === topSeat}
				position="top"
				isPartner
				stateVersion={game.stateVersion}
			/>
		{/if}
		{#if rightPlayer}
			<OpponentArea
				player={rightPlayer}
				isCurrentTurn={currentSeat === rightSeat}
				position="right"
				stateVersion={game.stateVersion}
			/>
		{/if}

		<!-- Persistent pass indicators -->
		{#each [...passedSeats] as seat (seat)}
			{@const pos = seatPosition(seat)}
			{#if pos !== 'bottom'}
				<div class="pass-bubble pass-{pos}">패스</div>
			{/if}
		{/each}

		<!-- Center Trick (only show during play phases) -->
		<div class="center-area">
			{#if wishActive && wishRank}
				<div class="wish-indicator">
					소원: {rankNames[wishRank] ?? wishRank}
				</div>
			{/if}
			{#if game.phase === 'playing' || game.phase === 'wish_declare' || game.phase === 'dragon_gift'}
				{#if dogEvent}
					<div class="special-event-notice dog-notice">
						<span class="event-icon">🐕</span>
						<span>{playerNames[dogEvent.seat]} → {playerNames[dogEvent.targetSeat]}에게 선 양도</span>
					</div>
				{:else if dragonGiftEvent}
					<div class="special-event-notice dragon-notice">
						<span class="event-icon">🐉</span>
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
		</div>

		<!-- My turn indicator -->
		{#if game.isMyTurn && trickWonSeat === null && !dogEvent && !dragonGiftEvent}
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
							<CardComponent card={entry.card} small />
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
	.game-table {
		display: flex;
		flex-direction: column;
		height: 100vh;
		height: 100dvh;
		position: relative;
	}

	.score-header {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 16px;
		padding: 8px 16px;
		padding-top: calc(8px + env(safe-area-inset-top));
		background: rgba(0,0,0,0.3);
		font-size: 0.85rem;
		font-weight: 600;
	}
	.team-score.team-a { color: #fca5a5; }
	.team-score.team-b { color: #93c5fd; }
	.round-info { opacity: 0.5; font-size: 0.75rem; }
	.btn-back {
		position: absolute;
		right: 12px;
		background: none;
		border: none;
		color: rgba(255,255,255,0.5);
		font-size: 1.1rem;
		cursor: pointer;
		padding: 4px 8px;
	}
	.btn-back:hover {
		color: rgba(255,255,255,0.8);
	}

	.phase-indicator {
		position: absolute;
		top: 48px;
		left: 12px;
		background: rgba(99,102,241,0.85);
		color: white;
		padding: 3px 14px;
		border-radius: 10px;
		font-size: 0.75rem;
		font-weight: 600;
		z-index: 50;
		white-space: nowrap;
	}

	/* Tichu declarations */
	.tichu-declarations {
		display: flex;
		justify-content: center;
		gap: 8px;
		padding: 4px 12px;
		flex-wrap: wrap;
	}
	.tichu-badge {
		padding: 3px 12px;
		border-radius: 10px;
		font-size: 0.75rem;
		font-weight: 700;
		animation: tichuPop 0.4s ease-out;
	}
	.tichu-badge.grand {
		background: rgba(239,68,68,0.3);
		border: 1px solid rgba(239,68,68,0.6);
		color: #fca5a5;
	}
	.tichu-badge.small {
		background: rgba(59,130,246,0.3);
		border: 1px solid rgba(59,130,246,0.6);
		color: #93c5fd;
	}
	.tichu-badge.is-me {
		border-width: 2px;
	}
	.tichu-badge.is-me.grand {
		background: rgba(239,68,68,0.4);
		color: #fecaca;
	}
	.tichu-badge.is-me.small {
		background: rgba(59,130,246,0.4);
		color: #bfdbfe;
	}
	@keyframes tichuPop {
		0% { opacity: 0; transform: scale(0.7); }
		60% { transform: scale(1.1); }
		100% { opacity: 1; transform: scale(1); }
	}

	.wish-indicator {
		background: rgba(245,158,11,0.9);
		color: #000;
		padding: 3px 12px;
		border-radius: 12px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.btn-small-tichu {
		position: absolute;
		bottom: 200px;
		right: 12px;
		z-index: 50;
		padding: 8px 16px;
		border-radius: 8px;
		border: 2px solid #3b82f6;
		background: rgba(59,130,246,0.2);
		color: #93c5fd;
		font-weight: 600;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.btn-small-tichu:hover {
		background: rgba(59,130,246,0.3);
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
		gap: 6px;
	}

	.my-turn-indicator {
		position: absolute;
		bottom: 8px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(245,158,11,0.8);
		color: #000;
		padding: 4px 16px;
		border-radius: 12px;
		font-size: 0.8rem;
		font-weight: 700;
		animation: turnPulse 1.5s infinite;
	}
	@keyframes turnPulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.6; }
	}

	/* Pass bubbles (persistent until next play) */
	.pass-bubble {
		position: absolute;
		background: rgba(100,116,139,0.85);
		color: #e2e8f0;
		padding: 3px 10px;
		border-radius: 8px;
		font-size: 0.7rem;
		font-weight: 600;
		z-index: 40;
		pointer-events: none;
	}
	.pass-left {
		left: 80px;
		top: 50%;
		transform: translateY(-50%);
	}
	.pass-right {
		right: 80px;
		top: 50%;
		transform: translateY(-50%);
	}
	.pass-top {
		top: 80px;
		left: 50%;
		transform: translateX(-50%);
	}

	/* Trick won notice */
	.trick-won-notice {
		background: rgba(34,197,94,0.2);
		border: 1px solid rgba(34,197,94,0.4);
		color: #4ade80;
		padding: 8px 20px;
		border-radius: 12px;
		font-size: 0.9rem;
		font-weight: 700;
		animation: trickWonPop 0.4s ease-out;
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
		gap: 8px;
		padding: 8px 20px;
		border-radius: 12px;
		font-size: 0.85rem;
		font-weight: 600;
		animation: trickWonPop 0.4s ease-out;
	}
	.event-icon {
		font-size: 1.2rem;
	}
	.dog-notice {
		background: rgba(139,92,246,0.2);
		border: 1px solid rgba(139,92,246,0.4);
		color: #c4b5fd;
	}
	.dragon-notice {
		background: rgba(239,68,68,0.2);
		border: 1px solid rgba(239,68,68,0.4);
		color: #fca5a5;
	}

	/* Exchange result overlay */
	.exchange-result-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}
	.exchange-result-content {
		background: #1e293b;
		border-radius: 14px;
		padding: 20px 24px;
		text-align: center;
		color: white;
		min-width: 200px;
	}
	.exchange-result-title {
		font-size: 0.9rem;
		font-weight: 600;
		margin-bottom: 14px;
		opacity: 0.8;
	}
	.exchange-result-cards {
		display: flex;
		justify-content: center;
		gap: 16px;
		margin-bottom: 16px;
	}
	.exchange-result-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
	}
	.exchange-from {
		font-size: 0.7rem;
		opacity: 0.6;
		font-weight: 500;
	}
	.exchange-result-dismiss {
		padding: 8px 28px;
		border-radius: 8px;
		border: none;
		background: #f59e0b;
		color: #000;
		font-weight: 600;
		font-size: 0.85rem;
		cursor: pointer;
	}
</style>

<script lang="ts">
	let { playerName, tichuType, onDismiss } = $props<{
		playerName: string;
		tichuType: 'grand' | 'small';
		onDismiss: () => void;
	}>();

	const isGrand = $derived(tichuType === 'grand');
	const label = $derived(isGrand ? '그랜드 티츄' : '스몰 티츄');
	const scoreText = $derived(isGrand ? '성공 +200 / 실패 -200' : '성공 +100 / 실패 -100');
</script>

<div class="overlay" role="button" tabindex="-1" onclick={onDismiss} onkeydown={onDismiss}>
	<div class="content" class:grand={isGrand} class:small={!isGrand}>
		<div class="icon">{isGrand ? '🔥' : '⚡'}</div>
		<div class="title">{label} 선언!</div>
		<div class="player-name">{playerName}</div>
		<div class="score-info">{scoreText}</div>
	</div>
</div>

<style>
	@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1100;
		font-family: 'Inter', sans-serif;
		cursor: pointer;
	}

	.content {
		padding: 28px 36px;
		border-radius: 24px;
		text-align: center;
		color: #fff;
		max-width: 300px;
		width: 80%;
		animation: slideIn 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275);
		pointer-events: none;
	}

	.content.grand {
		background: rgba(153, 27, 27, 0.92);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border: 1px solid rgba(252, 165, 165, 0.4);
		box-shadow: 0 10px 40px rgba(220, 38, 38, 0.5);
	}

	.content.small {
		background: rgba(4, 120, 87, 0.92);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border: 1px solid rgba(110, 231, 183, 0.4);
		box-shadow: 0 10px 40px rgba(5, 150, 105, 0.5);
	}

	.icon {
		font-size: 2rem;
		margin-bottom: 8px;
	}

	.title {
		font-size: 1.3rem;
		font-weight: 800;
		margin-bottom: 4px;
		letter-spacing: -0.02em;
	}

	.player-name {
		font-size: 1.1rem;
		font-weight: 600;
		opacity: 0.9;
		margin-bottom: 8px;
	}

	.score-info {
		font-size: 0.85rem;
		opacity: 0.7;
	}

	@keyframes slideIn {
		from { opacity: 0; transform: scale(0.85) translateY(20px); }
		to { opacity: 1; transform: scale(1) translateY(0); }
	}
</style>

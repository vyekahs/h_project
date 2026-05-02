<script lang="ts">
	let { stageNumber, dangerCount } = $props<{
		stageNumber: number;
		dangerCount: number;
	}>();
</script>

<div class="banner">
	<div class="ribbon">
		<span class="check">✓</span>
		<div class="text">
			<div class="title">STAGE {stageNumber} 클리어!</div>
			<div class="sub">위험 {dangerCount}개 해결 · 보상 획득</div>
		</div>
	</div>
</div>

<style>
	.banner {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 260;
		pointer-events: none;
		animation: bannerFade 1.5s ease-out forwards;
	}

	.ribbon {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		padding: 0.85rem 1.5rem;
		background: linear-gradient(135deg, rgba(34, 197, 94, 0.95), rgba(16, 185, 129, 0.95));
		border-radius: 14px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 24px rgba(34, 197, 94, 0.5);
		color: #fff;
		animation: ribbonPop 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.check {
		font-size: 1.6rem;
		font-weight: 800;
		text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.title {
		font-size: 1.05rem;
		font-weight: 800;
		letter-spacing: -0.3px;
	}

	.sub {
		font-size: 0.72rem;
		font-weight: 600;
		opacity: 0.92;
	}

	@keyframes bannerFade {
		0% { opacity: 0; }
		15% { opacity: 1; }
		80% { opacity: 1; }
		100% { opacity: 0; }
	}

	@keyframes ribbonPop {
		from { transform: scale(0.8); }
		to { transform: scale(1); }
	}
</style>

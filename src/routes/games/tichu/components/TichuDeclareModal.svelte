<script lang="ts">
	let { game } = $props<{ game: any }>();

	function handleDeclare() {
		game.declareGrandTichu();
	}

	function handlePass() {
		game.passGrandTichu();
	}
</script>

<div class="declare-overlay">
	<div class="declare-content">
		<h2>그랜드 티츄</h2>
		<p class="desc">8장을 보고 선언합니다.<br>성공 +200 / 실패 -200</p>
		<div class="declare-actions">
			<button class="btn-declare" onclick={handleDeclare}>
				선언!
			</button>
			<button class="btn-pass-declare" onclick={handlePass}>
				패스
			</button>
		</div>
	</div>
</div>

<style>
	.declare-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 800;
	}
	.declare-content {
		background: #1e293b;
		border-radius: 16px;
		padding: 24px 32px;
		text-align: center;
		color: white;
		max-width: 320px;
		width: 85%;
	}
	h2 {
		margin: 0 0 8px;
		font-size: 1.2rem;
		color: #fbbf24;
	}
	.desc {
		font-size: 0.85rem;
		opacity: 0.7;
		margin: 0 0 16px;
		line-height: 1.5;
	}
	.declare-actions {
		display: flex;
		gap: 12px;
		justify-content: center;
	}
	.btn-declare {
		padding: 12px 28px;
		border-radius: 10px;
		border: none;
		background: #ef4444;
		color: white;
		font-weight: 700;
		font-size: 1rem;
		cursor: pointer;
	}
	.btn-pass-declare {
		padding: 12px 28px;
		border-radius: 10px;
		border: 1px solid rgba(255,255,255,0.3);
		background: rgba(255,255,255,0.1);
		color: white;
		font-size: 1rem;
		cursor: pointer;
	}
</style>

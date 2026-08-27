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
	/* Fonts */
	@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

	.declare-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.3);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1100;
		font-family: 'Inter', sans-serif;
	}

	.declare-content {
		background: rgba(25, 25, 25, 0.9);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border: 1px solid rgba(230, 211, 163, 0.3);
		border-radius: 24px;
		padding: 32px 32px;
		text-align: center;
		color: #f3f4f6;
		max-width: 340px;
		width: 85%;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
		animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
	}

	h2 {
		margin: 0 0 12px;
		font-size: 1.6rem;
		font-weight: 800;
		color: #e6d3a3;
		text-shadow: 0 2px 12px rgba(168, 130, 79, 0.5);
		letter-spacing: -0.02em;
	}

	.desc {
		font-size: 0.95rem;
		color: #d1d5db;
		margin: 0 0 28px;
		line-height: 1.6;
	}

	.declare-actions {
		display: flex;
		gap: 16px;
		justify-content: center;
	}

	.btn-declare {
		padding: 14px 32px;
		border-radius: 16px;
		border: 1px solid rgba(196, 181, 253, 0.5);
		background: linear-gradient(135deg, #6b5a95 0%, #4a3d6b 100%);
		color: #fff;
		font-weight: 700;
		font-size: 1.1rem;
		cursor: pointer;
		box-shadow: 0 4px 15px rgba(139, 122, 184, 0.4);
		transition: all 0.2s;
	}
	.btn-declare:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 25px rgba(139, 122, 184, 0.6);
	}

	.btn-pass-declare {
		padding: 14px 32px;
		border-radius: 16px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		background: rgba(255, 255, 255, 0.05);
		color: #e5e7eb;
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}
	.btn-pass-declare:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #fff;
	}

	@keyframes popIn {
		from { opacity: 0; transform: scale(0.9) translateY(20px); }
		to { opacity: 1; transform: scale(1) translateY(0); }
	}
</style>

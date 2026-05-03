<script lang="ts">
	let { onClose } = $props<{ onClose: () => void }>();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="overlay" onclick={onClose}>
	<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
		<div class="header">
			<div class="badge">PLUS</div>
			<h2>플러스 모드</h2>
		</div>

		<p class="lede">
			총 <strong>10 WAVE</strong>를 정복하면 승리! WAVE마다 얻는 스킬로 위기를 뒤집고,
			같은 스킬을 레벨업시키며 더 다이내믹한 한 판을 즐겨보세요.
			(오류가 있으면 제보해 주세요)
		</p>

		<button class="confirm-btn" onclick={onClose}>시작하기</button>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		z-index: 290;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		animation: fadeIn 0.25s ease-out;
	}

	.modal {
		width: 100%;
		max-width: 420px;
		max-height: 90vh;
		overflow-y: auto;
		background: linear-gradient(135deg, #1f2937, #111827);
		border: 2px solid rgba(168, 85, 247, 0.55);
		border-radius: 18px;
		padding: 1.4rem 1.2rem 1.1rem;
		color: #fff;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55), 0 0 28px rgba(168, 85, 247, 0.4);
		animation: popIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.header {
		text-align: center;
		margin-bottom: 1rem;
	}

	.badge {
		display: inline-block;
		font-size: 0.65rem;
		font-weight: 900;
		letter-spacing: 3px;
		padding: 3px 10px;
		border-radius: 999px;
		background: linear-gradient(135deg, #a855f7, #6366f1);
		color: #fff;
		margin-bottom: 0.55rem;
		box-shadow: 0 4px 12px rgba(168, 85, 247, 0.45);
	}

	h2 {
		margin: 0 0 0.25rem;
		font-size: 1.15rem;
		font-weight: 800;
		letter-spacing: -0.3px;
	}

	.lede {
		margin: 0 0 1.3rem;
		padding: 0.95rem 1rem;
		font-size: 0.9rem;
		line-height: 1.6;
		color: rgba(255, 255, 255, 0.9);
		background: rgba(255, 255, 255, 0.05);
		border-radius: 12px;
	}

	.lede strong {
		color: #fbbf24;
		font-weight: 700;
	}

	.confirm-btn {
		width: 100%;
		padding: 0.85rem;
		border: none;
		border-radius: 14px;
		background: linear-gradient(135deg, #a855f7, #6366f1);
		color: #fff;
		font-family: inherit;
		font-size: 0.95rem;
		font-weight: 800;
		cursor: pointer;
		box-shadow: 0 4px 14px rgba(168, 85, 247, 0.5);
	}

	.confirm-btn:active {
		transform: scale(0.98);
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes popIn {
		from { opacity: 0; transform: scale(0.95); }
		to { opacity: 1; transform: scale(1); }
	}
</style>

<script lang="ts">
	let { onClose } = $props<{ onClose: () => void }>();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="overlay" onclick={onClose}>
	<div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
		<div class="header">
			<div class="badge">PLUS</div>
			<h2>블록 블라스터 플러스 모드</h2>
			<p class="subtitle">블록 퍼즐 + 위험 사이클 + 능력 시스템</p>
		</div>

		<div class="section">
			<div class="section-title">🧩 기본 흐름</div>
			<p class="section-body">
				평시에는 클래식처럼 블록을 배치해 라인을 클리어합니다.
				라인을 5개 클리어하면 <strong>위험 스테이지</strong>가 시작되고, 모든 위험을 해결하면
				능력 카드를 1개 보상으로 받습니다.
			</p>
		</div>

		<div class="section">
			<div class="section-title">⚠️ 위험 종류</div>
			<ul class="danger-list">
				<li><strong>DOOM (게임오버 줄/열)</strong> — 카운트 종료 전에 라인을 완성하지 못하면 즉시 게임오버.</li>
				<li><strong>ZONE (위험 구역)</strong> — 카운트 종료 전에 영역 셀을 모두 비우세요. 실패 시 검은 위험 셀로 굳어집니다.</li>
				<li><strong>강화 블록</strong> — 회색 블록은 라인 클리어 시마다 HP가 1씩 감소합니다. HP 0으로 만들면 사라집니다.</li>
				<li><strong>증식 블록</strong> — ★ 표시 근원 셀이 주기마다 인접 칸으로 증식합니다. 근원을 라인 클리어로 제거하면 자식까지 모두 사라집니다.</li>
			</ul>
		</div>

		<div class="section">
			<div class="section-title">🎁 능력 카드</div>
			<p class="section-body">
				위험 스테이지를 클리어하면 능력 3장 중 1장을 선택해 인벤토리에 추가합니다.
				같은 능력을 다시 뽑으면 레벨업(Lv1→Lv3)되어 효과가 강해집니다.
				9~10 스테이지에서는 <strong>보너스 드래프트</strong>로 1장 더 받을 수 있습니다.
			</p>
		</div>

		<div class="section">
			<div class="section-title">🎯 목표</div>
			<p class="section-body">
				위험 스테이지 <strong>10개</strong>를 모두 클리어하면 승리.
				DOOM 줄을 비우지 못하거나 보드에 더 이상 블록을 놓을 수 없으면 패배합니다.
			</p>
		</div>

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

	.subtitle {
		margin: 0;
		font-size: 0.78rem;
		color: rgba(255, 255, 255, 0.6);
	}

	.section {
		margin-bottom: 0.95rem;
		padding: 0.7rem 0.85rem;
		background: rgba(255, 255, 255, 0.04);
		border-radius: 12px;
	}

	.section-title {
		font-size: 0.85rem;
		font-weight: 800;
		color: #fbbf24;
		margin-bottom: 0.4rem;
	}

	.section-body {
		margin: 0;
		font-size: 0.78rem;
		line-height: 1.55;
		color: rgba(255, 255, 255, 0.88);
	}

	.danger-list {
		margin: 0;
		padding-left: 1.1rem;
		list-style: disc;
	}

	.danger-list li {
		font-size: 0.76rem;
		line-height: 1.55;
		color: rgba(255, 255, 255, 0.88);
		margin-bottom: 0.35rem;
	}

	.danger-list li strong {
		color: #fff;
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

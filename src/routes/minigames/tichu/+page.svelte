<script lang="ts">
	import { onDestroy } from 'svelte';
	import { createTichuGameState } from './gameState.svelte';
	import GameSetup from './components/GameSetup.svelte';
	import TichuTable from './components/TichuTable.svelte';
	import TutorialOverlay from './components/TutorialOverlay.svelte';
	import DragonGiftModal from './components/DragonGiftModal.svelte';
	import WishModal from './components/WishModal.svelte';
	import ScoreBoard from './components/ScoreBoard.svelte';
	import GameOverModal from './components/GameOverModal.svelte';

	let { data } = $props();
	const game = createTichuGameState();

	onDestroy(() => {
		game.cleanup();
	});
</script>

<svelte:window onbeforeunload={() => game.flushSave()} />

<svelte:head>
	<title>티츄</title>
</svelte:head>

<div class="page-background" class:is-playing={game.view !== 'setup'}></div>

<div class="tichu-page">
	{#if game.view === 'setup'}
		<GameSetup {game} user={data.user} isAdmin={data.isAdmin} />
	{:else if game.view === 'game' && game.gameState}
		<TichuTable {game} />
	{:else if game.view === 'tutorial' && game.gameState}
		<TichuTable {game} />
		<TutorialOverlay {game} />
	{/if}

	<!-- Modals -->
	{#if game.showDragonGiftModal && game.gameState}
		<DragonGiftModal {game} />
	{/if}

	{#if game.showWishModal && game.gameState}
		<WishModal {game} />
	{/if}

	{#if game.showRoundEndModal && game.roundResult}
		<ScoreBoard {game} />
	{/if}

	{#if game.showGameOverModal && game.gameEndData}
		<GameOverModal {game} />
	{/if}

	{#if game.showExitConfirmModal}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="exit-overlay" onkeydown={(e) => e.key === 'Escape' && game.resumeFromPause()}>
			<div class="exit-modal">
				<h3>종료하시겠습니까?</h3>
				<p>게임을 종료하면 진행 중인 게임이 삭제됩니다.</p>
				<div class="exit-actions">
					<button class="exit-btn exit-btn-cancel" onclick={() => game.resumeFromPause()}>
						계속하기
					</button>
					<button class="exit-btn exit-btn-confirm" onclick={() => game.backToSetup()}>
						종료
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Toast Notifications -->
	<div class="toast-container">
		{#each game.toasts as toast (toast.id)}
			<div class="toast toast-{toast.type}">
				{toast.message}
			</div>
		{/each}
	</div>
</div>

<style>
	/*
	 * 옻칠(라커) 테이블 위 단일 조명 컨셉. 대칭 비네트+회전 원뿔+펄스 블롭 조합을
	 * 걷어내고, 카드 위쪽에서 빛이 떨어지는 비대칭 단일 광원 + 검정·금 축으로 재구성.
	 * (검정 유리 + 금색 단일 악센트인 실제 인터랙션 요소들과 팔레트를 맞춤 — 라벤더는
	 * 그랜드 티츄 같은 희귀 이벤트에만 남겨두고 앰비언트 배경에서는 제거)
	 * 앰비언트 강도는 실제 게임플레이(game/tutorial 뷰)에서만 최대로 — 설정 화면은
	 * 빛이 거의 죽어 있는 차분한 라커 표면.
	 */
	.page-background {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		z-index: -1;
		background:
			radial-gradient(ellipse 900px 500px at 50% -8%, rgba(203, 170, 110, 0.11) 0%, transparent 55%),
			linear-gradient(180deg, #332818 0%, #211a10 55%, #140f0a 100%);
		overflow: hidden;
		transition: background 0.8s ease;
	}
	.page-background.is-playing {
		background:
			radial-gradient(ellipse 1000px 600px at 50% -8%, rgba(203, 170, 110, 0.22) 0%, transparent 55%),
			linear-gradient(180deg, #423218 0%, #2a2010 55%, #1a140c 100%);
	}

	/* 단일 저작 모션: 상단 조명 하나만 아주 느리게 숨쉬듯 — 여러 개가 따로 도는 효과 없음 */
	.page-background::before {
		content: '';
		position: absolute;
		top: -12%;
		left: 50%;
		transform: translateX(-50%);
		width: 70%;
		height: 55%;
		background: radial-gradient(ellipse at center, rgba(230, 211, 163, 0.18) 0%, transparent 70%);
		filter: blur(70px);
		opacity: 0.4;
		animation: breathe 6s ease-in-out infinite;
		animation-play-state: paused;
		transition: opacity 0.8s ease;
	}
	.page-background.is-playing::before {
		opacity: 1;
		animation-play-state: running;
	}

	@keyframes breathe {
		0%, 100% { transform: translateX(-50%) scale(1); }
		50% { transform: translateX(-50%) scale(1.06); }
	}

	.tichu-page {
		position: fixed;
		inset: 0;
		background: transparent;
		color: #f3efe8;
		overflow: hidden;
		overscroll-behavior: none;
		font-family: 'Inter', system-ui, -apple-system, sans-serif;
	}

	/* Toast */
	.toast-container {
		position: fixed;
		top: 40px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 2000;
		display: flex;
		flex-direction: column;
		gap: 8px;
		pointer-events: none;
		max-width: 90vw;
	}
	.toast {
		padding: 10px 20px;
		border-radius: 16px;
		font-size: 0.9rem;
		font-weight: 600;
		text-align: center;
		animation: toastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
		word-break: keep-all;
		overflow-wrap: break-word;
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border: 1px solid rgba(255,255,255,0.15);
		box-shadow: 0 4px 20px rgba(0,0,0,0.3);
		letter-spacing: -0.01em;
		color: #fff;
		text-shadow: 0 1px 2px rgba(0,0,0,0.2);
	}
	/* Toast 색상은 상태 의미(정보/성공/오류/경고)를 나타내는 고정 신호색 — 테마 색과 무관하게 유지 */
	.toast-info { background: rgba(59, 130, 246, 0.25); border-color: rgba(147, 197, 253, 0.3); }
	.toast-success { background: rgba(16, 185, 129, 0.25); border-color: rgba(110, 231, 183, 0.3); }
	.toast-error { background: rgba(239, 68, 68, 0.3); border-color: rgba(252, 165, 165, 0.3); }
	.toast-warning { background: rgba(245, 158, 11, 0.25); border-color: rgba(253, 230, 138, 0.3); }

	@keyframes toastIn {
		from { opacity: 0; transform: translateY(-12px) scale(0.95); }
		to { opacity: 1; transform: translateY(0) scale(1); }
	}

	/* Exit Confirm Modal */
	.exit-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(5px);
		-webkit-backdrop-filter: blur(5px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1500;
	}
	.exit-modal {
		background: rgba(30, 41, 59, 0.9);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 24px;
		padding: 28px 32px;
		text-align: center;
		color: #f3f4f6;
		min-width: 260px;
		max-width: 320px;
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
		animation: exitModalIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
	}
	.exit-modal h3 {
		margin: 0 0 8px;
		font-size: 1.15rem;
		font-weight: 700;
		color: #fff;
	}
	.exit-modal p {
		margin: 0 0 24px;
		font-size: 0.85rem;
		color: #9ca3af;
		line-height: 1.4;
	}
	.exit-actions {
		display: flex;
		gap: 10px;
	}
	.exit-btn {
		flex: 1;
		padding: 12px 0;
		border-radius: 14px;
		border: none;
		font-size: 0.95rem;
		font-weight: 700;
		cursor: pointer;
		transition: all 0.2s;
	}
	.exit-btn-cancel {
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: #e5e7eb;
	}
	.exit-btn-cancel:active {
		background: rgba(255, 255, 255, 0.2);
		transform: scale(0.97);
	}
	.exit-btn-confirm {
		background: linear-gradient(135deg, #dc2626, #b91c1c);
		color: #fff;
		box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
	}
	.exit-btn-confirm:active {
		transform: scale(0.97);
		box-shadow: 0 2px 8px rgba(220, 38, 38, 0.4);
	}
	@keyframes exitModalIn {
		from { opacity: 0; transform: scale(0.95); }
		to { opacity: 1; transform: scale(1); }
	}

</style>

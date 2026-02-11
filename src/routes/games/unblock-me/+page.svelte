<script lang="ts">
    import Board from './Board.svelte';
    import GamePauseModal from '$lib/components/games/GamePauseModal.svelte';
    import GameResultModal from '$lib/components/games/GameResultModal.svelte';
    import { goto } from '$app/navigation';
    import { browser } from '$app/environment';
    import { onMount } from 'svelte';
    import { createUnblockMeGame, difficultyLabels, difficultyList, formatTime, type Difficulty } from './gameLogic.svelte';

    const game = createUnblockMeGame();

    // Check for saved game on mount
    $effect(() => {
        game.checkSavedGame();
    });

    // Handle autostart/resume from unified start page
    onMount(() => {
        if (!browser) return;
        const params = new URLSearchParams(window.location.search);
        if (params.get('autostart') === 'true') {
            const diff = params.get('difficulty');
            if (diff) game.difficulty = diff as Difficulty;
            game.startGame();
        } else if (params.get('resume') === 'true') {
            game.loadGame();
        }
    });

    // Prevent pull-to-refresh during gameplay
    $effect(() => {
        if (game.gameState !== 'playing' && game.gameState !== 'paused') return;
        const handler = (e: TouchEvent) => {
            e.preventDefault();
        };
        document.addEventListener('touchmove', handler, { passive: false });
        document.body.style.overscrollBehavior = 'none';
        return () => {
            document.removeEventListener('touchmove', handler);
            document.body.style.overscrollBehavior = '';
        };
    });
</script>

<div class="game-container">
    {#if game.gameState === 'start'}
         <div class="screen start-screen">
            <!-- Header -->
            <div class="game-header">
                <a href="/minigames" class="back-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                </a>
                <h1>Unblock Me</h1>
            </div>

            <div class="tab-nav">
                <button class="tab-btn" class:active={game.activeTab === 'difficulty'} onclick={() => game.activeTab = 'difficulty'}>난이도</button>
                <button class="tab-btn" class:active={game.activeTab === 'ranking'} onclick={() => game.activeTab = 'ranking'}>랭킹</button>
            </div>

            {#if game.activeTab === 'difficulty'}
                <div class="start-content">
                    {#if game.hasSavedGame && game.startMode === 'initial'}
                        <div class="resume-section">
                            <button class="btn-primary" onclick={game.loadGame}>이어하기</button>
                            <button class="btn-secondary" onclick={() => game.startMode = 'diff_select'}>새 게임 시작</button>
                        </div>
                    {:else}
                         <div class="difficulty-section">
                            {#each difficultyList as diff}
                                <button class="diff-btn"
                                    class:selected={game.difficulty === diff}
                                    onclick={() => game.difficulty = diff}
                                >
                                    <span class="diff-label">{difficultyLabels[diff]}</span>
                                </button>
                            {/each}
                        </div>
                        <div class="start-btn">
                             <button class="btn-primary" onclick={game.startGame} disabled={game.isLoading}>
                                {game.isLoading ? '로딩 중...' : '게임 시작'}
                            </button>
                        </div>
                        {#if game.hasSavedGame}
                             <button class="btn-text secondary" style="margin-top:1rem" onclick={() => game.startMode = 'initial'}>취소</button>
                        {/if}
                    {/if}
                </div>
            {/if}
         </div>

    {:else}
        <!-- Playing / Paused / Finished -->
        <div class="game-play-area" class:blurred={game.alertMessage || game.confirmMessage || game.gameState === 'paused'}>
            <header>
                <div class="header-info">
                    <span class="difficulty-badge">{difficultyLabels[game.difficulty]}</span>
                    <span class="moves">{game.moveCount}회 이동</span>
                </div>
                <div class="timer-controls">
                    <div class="timer">
                        {formatTime(game.displayTimer)}
                    </div>
                    <button class="icon-btn" onclick={game.pauseGame} aria-label="Pause">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="2" height="6"/><rect x="13" y="9" width="2" height="6"/></svg>
                    </button>
                </div>
            </header>

            <div class="game-area">
                <Board
                    bind:blocks={game.blocks}
                    isGameOver={game.gameState === 'finished'}
                    onbeforemove={game.handleBeforeMove}
                    onmove={game.handleMove}
                    onwin={game.handleWin}
                    exitRow={game.currentLevel?.row ?? 2}
                />
            </div>

            <div class="controls-area">
                <button class="undo-btn" onclick={game.undo} disabled={game.history.length === 0 || game.gameState !== 'playing'}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
                    <span>되돌리기</span>
                </button>
            </div>
        </div>

        <!-- Pause Overlay -->
        {#if game.gameState === 'paused'}
            <GamePauseModal
                stats={[
                    { label: '이동', value: `${game.moveCount}회` },
                    { label: '시간', value: formatTime(game.displayTimer) }
                ]}
                onResume={game.resumeGame}
                onQuit={() => { game.stopTimer(); localStorage.removeItem('unblockme_save'); goto('/games/start/unblock-me'); }}
                onRestart={game.restartGame}
            />
        {/if}

        <!-- Result Overlay -->
        {#if game.gameState === 'finished'}
            <GameResultModal
                isWon={true}
                stats={[
                    { label: '난이도', value: difficultyLabels[game.difficulty] },
                    { label: '시간', value: formatTime(game.timerValue) },
                    { label: '이동', value: `${game.moveCount}회` },
                    { label: '점수', value: game.calculatedScore.toLocaleString(), highlight: true }
                ]}
                primaryAction={{ label: '다시 도전', onclick: game.startGame }}
                secondaryAction={{ label: '나가기', onclick: () => goto('/games/start/unblock-me') }}
            />
        {/if}
    {/if}

    <!-- Alert Modal -->
    {#if game.alertMessage}
        <div class="overlay" onclick={() => game.alertMessage = null}>
            <div class="modal alert-modal" onclick={(e) => e.stopPropagation()}>
                <p>{game.alertMessage}</p>
                <button class="btn-primary" onclick={() => game.alertMessage = null}>확인</button>
            </div>
        </div>
    {/if}

    <!-- Confirm Modal -->
    {#if game.confirmMessage}
        <div class="overlay" onclick={() => game.handleConfirm(false)}>
            <div class="modal alert-modal" onclick={(e) => e.stopPropagation()}>
                <p>{game.confirmMessage}</p>
                <div class="modal-actions">
                    <button class="btn-secondary" onclick={() => game.handleConfirm(false)}>취소</button>
                    <button class="btn-primary" onclick={() => game.handleConfirm(true)}>확인</button>
                </div>
            </div>
        </div>
    {/if}

    {#if game.isLoading}
        <div class="overlay">
            <div class="spinner"></div>
        </div>
    {/if}
</div>

<style>
    :global(.app-layout:has(.game-container)) {
        min-height: 0 !important;
        height: 100dvh;
        padding-bottom: 0 !important;
        overflow: hidden;
    }

    .game-container {
        padding: 1rem;
        max-width: 500px;
        height: 100dvh;
        display: flex;
        flex-direction: column;
        overscroll-behavior: none;
        margin: 0 auto;
    }

    /* Header */
    .game-header {
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        margin: 1.5rem 0 2rem 0;
    }

    .back-btn {
        position: absolute;
        left: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 10px;
        background: #f1f3f5;
        color: #333;
        text-decoration: none;
        transition: background 0.2s;
    }



    .game-header h1 {
        font-family: 'Outfit', sans-serif;
        font-size: 1.8rem;
        font-weight: 800;
        color: #333;
        letter-spacing: -1px;
        margin: 0;
    }

    /* Tab Nav */
    .tab-nav {
        display: flex;
        justify-content: center;
        gap: 0.5rem;
        padding: 0 1rem;
        margin-bottom: 0.5rem;
        flex-shrink: 0;
        width: 100%;
        margin: 0 auto 2rem auto;
    }

    .tab-btn {
        background: transparent;
        border: none;
        padding: 0.6rem 1.2rem;
        font-size: 1rem;
        color: #888;
        font-weight: 500;
        cursor: pointer;
        position: relative;
        transition: color 0.2s;
    }

    .tab-btn.active {
        color: #333;
        font-weight: 700;
        background: transparent;
        box-shadow: none; /* Reset */
    }

    .tab-btn.active::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        height: 3px;
        background: #333;
        border-radius: 3px;
    }

    /* Start Content */
    .start-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1.5rem;
        flex: 1;
        overflow-y: auto;
    }

    .resume-section {
        display: flex;
        flex-direction: column;
        gap: 0.8rem; /* Matches Sudoku */
        width: 100%;
        max-width: 280px;
    }

    .difficulty-section {
        display: flex;
        flex-direction: column;
        gap: 0.8rem; /* Matches Sudoku */
        width: 100%;
        max-width: 280px;
    }

    .diff-btn {
        background: #f5f5f7;
        border: 2px solid transparent;
        color: #555;
        padding: 0.9rem 1.2rem;
        border-radius: 14px;
        cursor: pointer;
        transition: all 0.2s ease;
        
        display: flex;
        justify-content: center;
        align-items: center;
        text-align: center;
    }

    .diff-btn:active {
        transform: scale(0.98);
    }

    .diff-btn.selected {
        background: #333;
        border-color: #333;
        color: white;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }

    .diff-label {
        font-size: 1rem;
        font-weight: 600;
        color: inherit;
    }

    .start-btn {
        width: 100%;
        max-width: 280px;
        margin-top: 0.5rem;
    }

    /* Buttons */
    .btn-primary {
        background: #333;
        color: white;
        border: none;
        padding: 0.85rem 1.5rem;
        border-radius: 14px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        width: 100%;
    }

    .btn-primary:active {
        transform: scale(0.97);
        background: #111;
    }

    .btn-primary:disabled {
        opacity: 0.5;
        pointer-events: none;
    }

    .btn-secondary {
        background: #f1f3f5;
        color: #333;
        border: none;
        padding: 0.85rem 1.5rem;
        border-radius: 14px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        width: 100%;
    }

    .btn-secondary:active {
        transform: scale(0.97);
        background: #e9ecef;
    }
    
    .btn-text {
        background: none;
        border: none;
        color: #888;
        cursor: pointer;
    }

    /* Game Header - matches Sudoku */
    header {
        width: 100%;
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0;
        flex-shrink: 0;
    }

    .header-info {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
    }

    .difficulty-badge {
        font-size: 0.75rem;
        font-weight: 600;
        color: #555;
        text-transform: uppercase;
        letter-spacing: 1px;
    }

    .moves {
        font-size: 0.85rem;
        font-weight: 600;
        color: #333;
    }

    .timer-controls {
        display: flex;
        align-items: center;
        gap: 1rem;
    }

    .timer {
        font-size: 1.6rem;
        font-weight: 400;
        font-variant-numeric: tabular-nums;
        color: #333;
        background: #f5f5f7;
        padding: 0.4rem 1rem;
        border-radius: 30px;
        min-width: 80px;
        text-align: center;
    }

    .icon-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px;
        border-radius: 50%;
        transition: background 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .icon-btn:active {
        background: #f0f0f0;
    }

    /* Game Play Area - matches Sudoku */
    .game-play-area {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        max-width: 500px;
        flex: 1;
        gap: 1rem;
        transition: filter 0.3s, opacity 0.3s;
    }

    .game-play-area.blurred {
        filter: blur(15px);
        opacity: 0.5;
    }

    .game-area {
        width: 100%;
    }

    /* Controls */
    .controls-area {
        width: 100%;
        display: flex;
        justify-content: center;
        padding: 0.5rem 0;
        padding-bottom: env(safe-area-inset-bottom, 0.5rem);
    }

    .undo-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        background: #f0f0f0;
        border: none;
        padding: 0.7rem 1.4rem;
        border-radius: 50px;
        font-size: 0.9rem;
        font-weight: 600;
        color: #555;
        cursor: pointer;
        transition: all 0.2s;
    }

    .undo-btn:active:not(:disabled) {
        background: #e0e0e0;
        transform: scale(0.95);
    }

    .undo-btn:disabled {
        opacity: 0.3;
        pointer-events: none;
    }

    /* Overlay / Modals */
    .overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100;
    }

    .modal {
        background: white;
        border-radius: 24px;
        padding: 2rem;
        width: 90%;
        max-width: 340px;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0,0,0,0.15);
        animation: popIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
    }


    .modal p {
        margin: 0 0 1.5rem 0;
        color: #555;
        font-size: 0.95rem;
        line-height: 1.5;
    }

    .modal-actions {
        display: flex;
        gap: 0.8rem;
    }

    @keyframes popIn {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
    }
    
    .spinner {
        width: 40px; height: 40px;
        border: 4px solid rgba(255,255,255,0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
</style>

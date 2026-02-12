<script lang="ts">
    import { onMount } from 'svelte';
    import BoardComponent from './Board.svelte';
    import Controls from './Controls.svelte';
    import { goto } from '$app/navigation';
    import { browser } from '$app/environment';
    import GamePauseModal from '$lib/components/games/GamePauseModal.svelte';
    import GameResultModal from '$lib/components/games/GameResultModal.svelte';
    import { user } from '$lib/stores/user';
    import TutorialModal from './TutorialModal.svelte';
    import KillerTutorialModal from '../killer-sudoku/KillerTutorialModal.svelte';
    import { GAME_CONFIG } from '$lib/config';

    import { createSudokuGame, difficultyLabels, formatTime } from './gameLogic.svelte';
    import { createTutorialLogic } from './tutorialLogic.svelte';

    const game = createSudokuGame();

    function openTutorial(id: string) {
        game.activeTutorialId = id;
        game.showTutorial = true;
    }

    const tutorial = createTutorialLogic(
        () => game.gameMode,
        () => $user.completedTutorials || [],
        openTutorial
    );

    // Connect tutorial checker to game logic
    game.setTutorialChecker(tutorial.checkAndShowTutorial);

    let isAutostart = false;

    // Load game on mount
    onMount(() => {
        // 1. Read Mode from URL
        if (browser) {
            const params = new URLSearchParams(window.location.search);
            const modeParam = params.get('mode');
            if (modeParam === 'killer') {
                game.gameMode = 'killer';
            } else if (modeParam === 'standard') {
                game.gameMode = 'standard';
            }
        }

        // Handle autostart/resume from unified start page
        if (browser) {
            const params = new URLSearchParams(window.location.search);
            if (params.get('autostart') === 'true') {
                isAutostart = true;
                const diff = params.get('difficulty');
                if (diff) game.difficulty = diff as any;
                // If saved game exists (e.g. page refresh), resume instead of starting new
                const saved = localStorage.getItem('sudoku_save');
                if (saved) {
                    user.refresh();
                    game.loadSavedGame();
                } else {
                    user.refresh().then(() => game.startGame());
                }
                return () => { game.clearTimerInterval(); };
            }
            if (params.get('resume') === 'true') {
                const saved = localStorage.getItem('sudoku_save');
                if (saved) {
                    user.refresh();
                    game.loadSavedGame();
                    return () => { game.clearTimerInterval(); };
                }
            }
            // No params - redirect to start page
            const gameId = game.gameMode === 'killer' ? 'killer-sudoku' : 'sudoku';
            goto(`/games/start/${gameId}`, { replaceState: true });
        }

        return () => {
            game.clearTimerInterval();
        };
    });
</script>

<div class="game-container">
    {#if game.showTutorial}
        <TutorialModal tutorialId={game.activeTutorialId} onclose={(shouldStart: boolean) => {
            if (shouldStart) {
                game.startGame(true);
            } else {
                game.showTutorial = false;
                if (isAutostart) {
                    goto(`/games/start/${game.gameMode === 'killer' ? 'killer-sudoku' : 'sudoku'}`);
                }
            }
        }} />

    {:else if game.gameState !== 'start'}
        <div class="game-play-area" class:blurred={game.alertMessage || game.confirmMessage || game.gameState === 'paused'}>
            <!-- Game Header -->
            <header>
                <div class="header-info">
                    <span class="difficulty-badge">{difficultyLabels[game.difficulty]}</span>
                    <span class="mistakes">{game.mistakes}/3 실수</span>
                </div>

                <div class="timer-controls">
                    <div class="header-items">
                        {#if $user.inventory.some((i: any) => i.item_code === 'time_stop')}
                            <button class="icon-btn theme-btn" onclick={() => game.handleAction('time_stop')} title="타임 스톱 (시간 정지)">
                                 <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" x2="22" y1="12" y2="12"/><line x1="12" x2="12" y1="2" y2="22"/><path d="m20 16-4-4 4-4"/><path d="m4 8 4 4-4 4"/><path d="m16 4-4 4-4-4"/><path d="m8 20 4-4 4 4"/></svg>
                            </button>
                        {/if}
                        {#if $user.inventory.some((i: any) => i.item_code === 'refresh_prob')}
                            <button class="icon-btn theme-btn" onclick={() => game.handleAction('refresh_prob')} title="문제 교체">
                                 <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
                            </button>
                        {/if}
                    </div>

                    <div class="timer" class:frozen={game.isTimeFrozen}>
                        {#if game.isTimeFrozen}❄️ {/if}{formatTime(game.displayTimer)}
                    </div>
                    <button class="icon-btn" onclick={game.pauseGame} aria-label="Pause">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="2" height="6"/><rect x="13" y="9" width="2" height="6"/></svg>
                    </button>
                </div>
            </header>

            <!-- Game Board -->
            <div class="game-area">
                 <BoardComponent
                     board={game.board}
                     cages={game.cages}
                     selectedCell={game.selectedCell}
                     isGameOver={game.gameState === 'finished'}
                     onselect={game.handleCellSelect}
                 />
            </div>

            <!-- Controls -->
            <div class="controls-area" class:hidden={game.gameState !== 'playing'}>
                <Controls
                    bind:isNoteMode={game.isNoteMode}
                    completedNumbers={game.completedNumbers}
                    onnumber={game.handleNumberInput}
                    onaction={game.handleAction}
                    onnewgame={() => {}}
                />
            </div>
        </div>
    {/if}

    <!-- Pause Overlay -->
    {#if game.gameState === 'paused'}
        <GamePauseModal
            stats={[
                { label: '시간', value: formatTime(game.displayTimer) },
                { label: '실수', value: `${game.mistakes}/3` }
            ]}
            onResume={game.resumeGame}
            onQuit={game.quitGame}
            onRestart={game.restartGame}
        />
    {/if}



<!-- ... -->

    <!-- Game Result Modal -->
    {#if game.gameState === 'finished'}
        <GameResultModal
            isWon={game.isWon}
            message={game.hasRestarted ? '다시시작한 게임은 랭킹에 반영되지 않습니다' : game.isWon ? (game.calculatedScore >= 5000 ? '전설적인 기록입니다! 🏆' : '퍼즐을 완벽하게 해결했습니다! 🎉') : '아쉽지만 다음 기회에... 😭'}
            stats={[
                { label: '난이도', value: difficultyLabels[game.difficulty] },
                { label: '시간', value: formatTime(game.displayTimer) },
                { label: '실수', value: `${game.mistakes} / 3` },
                ...(!game.hasRestarted ? [{ label: '점수', value: game.calculatedScore.toLocaleString(), highlight: true }] : [])
            ]}
            showAd={game.isWon && !game.hasRestarted && GAME_CONFIG.ENABLE_ADS}
            onAdReward={game.handleAdReward}
            primaryAction={{ label: '다시 도전하기', onclick: () => goto(`/games/start/${game.gameMode === 'killer' ? 'killer-sudoku' : 'sudoku'}`) }}
            secondaryAction={{ label: '나가기', onclick: game.quitGame }}
        />
    {/if}
    <!-- Confirmation Modal -->
    {#if game.confirmMessage}
        <div class="overlay" onclick={() => game.handleConfirm(false)}>
            <div class="modal alert-modal" onclick={(e) => e.stopPropagation()}>
                <h3>확인 🤔</h3>
                <p>{game.confirmMessage}</p>
                <div class="modal-actions">
                    <button class="btn-secondary" onclick={() => game.handleConfirm(false)}>취소</button>
                    <button class="btn-primary" onclick={() => game.handleConfirm(true)}>확인</button>
                </div>
            </div>
        </div>
    {/if}

    <!-- Simple Alert Modal -->
    {#if game.alertMessage}
        <div class="overlay" onclick={() => game.alertMessage = null}>
            <div class="modal alert-modal" onclick={(e) => e.stopPropagation()}>
                <h3>알림 🔔</h3>
                <p>{game.alertMessage}</p>
                <button class="btn-primary" onclick={() => game.alertMessage = null}>확인</button>
            </div>
        </div>
    {/if}
    {#if game.showTutorial}
        {#if game.gameMode === 'killer'}
            <KillerTutorialModal tutorialId={game.activeTutorialId} onclose={(shouldStart: boolean) => {
                if (shouldStart) {
                    game.startGame(true);
                } else {
                    game.showTutorial = false;
                    if (isAutostart) {
                        goto('/games/start/killer-sudoku');
                    }
                }
            }} />
        {:else}
            <TutorialModal tutorialId={game.activeTutorialId} onclose={(shouldStart: boolean) => {
                if (shouldStart) {
                    game.startGame(true);
                } else {
                    game.showTutorial = false;
                    if (isAutostart) {
                        goto('/games/start/sudoku');
                    }
                }
            }} />
        {/if}
    {/if}

</div>

<style>
    .modal-actions {
        display: flex;
        gap: 1rem;
        justify-content: center;
        width: 100%;
        margin-top: 1rem;
    }
    .modal-actions button {
        flex: 1;
        padding: 0.8rem;
    }

    .alert-modal {
        max-width: 320px;
        padding: 2rem;
    }
    .alert-modal h3 {
        margin: 0;
        font-size: 1.4rem;
        color: #333;
    }
    .alert-modal p {
        font-size: 1.05rem;
        color: #555;
        line-height: 1.4;
    }

	/* Wrapper for the whole page */
    :global(.app-layout:has(.game-container)) {
        min-height: 0 !important;
        height: 100dvh;
        padding-bottom: 0 !important;
        overflow: hidden;
    }
    .game-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0 1rem;
		gap: 0;
		max-width: 800px;
		margin: 0 auto;
        height: 100dvh;
        overflow: hidden;
        color: #333;
        position: relative;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        touch-action: manipulation;
        background: #f8f9fa;
	}

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
        border-radius: 20px;
    }
    
    .mistakes {
        font-size: 0.85rem;
        font-weight: 600;
        color: #333;
        display: flex;
        align-items: center;
        gap: 0.3rem;
    }
 
    .timer-controls {
        display: flex;
        align-items: center;
        gap: 1rem;
    }

    .header-items {
        display: flex;
        gap: 0.5rem;
        margin-right: 0.5rem;
    }
    
    .theme-btn {
        background: #f0f0f0;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1rem;
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
    
    .timer.frozen {
        background: linear-gradient(135deg, #e0f7fa, #b2ebf2);
        color: #00838f;
    }
    
    /* Pause Button Icon */
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
    
    .icon-btn:hover {
        background: #f0f0f0;
    }

    .game-play-area {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        max-width: 500px;
        flex: 1;
        gap: 1rem;
    }

    .game-play-area.blurred {
        filter: blur(15px);
        opacity: 0.5;
    }

	.game-area {
		width: 100%;
	}

	.controls-area {
		width: 100%;
        padding-bottom: env(safe-area-inset-bottom, 0.5rem);
        transition: opacity 0.3s;
	}
    
    .controls-area.hidden {
        opacity: 0;
        pointer-events: none;
    }
    
    .overlay {
        position: fixed;
        top:0; left:0; right:0; bottom:0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.2); /* Added slight bg dimming for better contrast */
    }
    
    .modal {
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        padding: 3rem;
        border-radius: 24px;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0,0,0,0.15);
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
        min-width: 300px;
        border: 1px solid rgba(0,0,0,0.05);
    }
    
    .btn-primary {
        background: #333;
        color: white;
        border: none;
        padding: 1rem 2.5rem;
        border-radius: 50px;
        font-weight: 600;
        font-size: 1.1rem;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
    
    .btn-primary:active {
        transform: scale(0.98);
        box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    }

    .btn-secondary {
        background: #f0f0f0;
        color: #333;
        border: none;
        padding: 0.8rem 2rem;
        border-radius: 50px;
        font-weight: 600;
        cursor: pointer;
        font-size: 1rem;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    
    .btn-secondary:hover {
        background: #e0e0e0;
    }

    .tutorial-modal {
        max-width: 400px;
        text-align: left;
    }
    
    .tutorial-content {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        font-size: 1rem;
        line-height: 1.5;
        color: #444;
    }
    
    .tutorial-content ul {
        list-style: none;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        background: #f9f9f9;
        padding: 1rem;
        border-radius: 12px;
    }
    
    .tutorial-content .tip {
        background: #e3f2fd;
        color: #1565c0;
        padding: 0.8rem;
        border-radius: 8px;
        margin-top: 0.5rem;
        font-size: 0.95rem;
    }

    .earned-points {
        font-size: 1.2rem;
        font-weight: 700;
        color: #007aff;
        margin-top: 0.5rem;
        animation: pop 0.5s cubic-bezier(0.18, 0.89, 0.32, 1.28);
    }
    
    @keyframes pop {
        0% { transform: scale(0.8); opacity: 0; }
        100% { transform: scale(1); opacity: 1; }
    }

    /* Sudoku Board Styles */
    .sudoku-board {
        display: flex;
        flex-direction: column;
        border: 3px solid #333;
        border-radius: 12px;
        background: #333;
        gap: 1px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
        user-select: none;
        overflow: hidden;
    }

    .row {
        display: flex;
        gap: 2px;
    }

    .row:nth-child(3n) {
        margin-bottom: 2px; /* Thicker gap for 3x3 boxes */
    }
    .row:last-child {
        margin-bottom: 0;
    }

    .cell {
        width: 40px;
        height: 40px;
        background: #fafafa;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.4rem;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s, transform 0.1s;
        position: relative;
        color: #1a73e8; /* User-entered numbers in blue */
    }

    .cell:nth-child(3n) {
        margin-right: 2px;
    }
    .cell:last-child {
        margin-right: 0;
    }
    
    .cell:active {
        transform: scale(0.95);
    }

    .cell.fixed {
        font-weight: 700;
        color: #333;
        background-color: #fff;
    }

    .cell.selected {
        background-color: #e8f0fe;
        box-shadow: inset 0 0 0 2px #1a73e8;
        z-index: 2;
    }

    /* Related cells (same row/col/box) */
    .cell.related {
        background-color: #f8f9fa;
    }

    /* Highlighted number (same value as selected) */
    .cell.highlighted {
        background-color: #c8e6ff;
        color: #0d47a1;
        font-weight: 700;
    }

    .cell.error {
        color: #d32f2f !important;
        background-color: #ffcdd2 !important;
        animation: shake 0.3s;
    }

    .cell .value {
        line-height: 1;
    }

    .cell .notes {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        width: 100%;
        height: 100%;
        padding: 2px;
    }

    .note {
        font-size: 9px;
        color: #666;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-2px); }
        75% { transform: translateX(2px); }
    }

    @media (max-width: 450px) {
        .cell {
            width: 36px;
            height: 36px;
            font-size: 1.3rem;
        }
    }
    @media (max-width: 350px) {
        .cell {
            width: 32px;
            height: 32px;
            font-size: 1.1rem;
        }
    }

</style>

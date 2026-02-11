<script lang="ts">
    import { onMount } from 'svelte';
    import KillerBoardComponent from './KillerBoard.svelte';
    import Controls from '../sudoku/Controls.svelte';
    import KillerTutorialModal from './KillerTutorialModal.svelte';
    import { goto } from '$app/navigation';
    import { browser } from '$app/environment';
    import RankingBoard from '$lib/components/gamification/RankingBoard.svelte';
    import GamePauseModal from '$lib/components/games/GamePauseModal.svelte';
    import GameResultModal from '$lib/components/games/GameResultModal.svelte';
    import { user } from '$lib/stores/user';
    import { GAME_CONFIG } from '$lib/config';

    import { createKillerSudokuGame, difficultyLabels, formatTime } from './gameLogic.svelte';
    import { createKillerTutorialLogic } from './tutorialLogic.svelte';

    const game = createKillerSudokuGame();

    function openTutorial(id: string) {
        game.activeTutorialId = id;
        game.showTutorial = true;
    }

    const tutorial = createKillerTutorialLogic(
        () => $user.completedTutorials || [],
        openTutorial
    );

    game.setTutorialChecker(tutorial.checkAndShowTutorial);

    let isAutostart = false;

    onMount(() => {
        user.refresh();

        if (browser) {
            const params = new URLSearchParams(window.location.search);
            if (params.get('autostart') === 'true') {
                isAutostart = true;
                const diff = params.get('difficulty');
                if (diff) game.difficulty = diff as any;
                game.startGame(true, true);
                return () => { game.clearTimerInterval(); };
            }
            if (params.get('resume') === 'true') {
                const saved = localStorage.getItem('killer_sudoku_save');
                if (saved) {
                    game.loadSavedGame();
                    return () => { game.clearTimerInterval(); };
                }
            }
        }

        game.checkSavedGameExists();

        return () => {
            game.clearTimerInterval();
        };
    });

    $effect(() => {
        if (browser) {
            const unlockedLocal: string[] = JSON.parse(localStorage.getItem('killer_sudoku_unlocked_tutorials') || '[]');
            const unlockedDB: string[] = $user.completedTutorials || [];
            const all = [...unlockedLocal, ...unlockedDB];
            const hasKiller = all.some(id => typeof id === 'string' && id.startsWith('killer_'));

            if (hasKiller) {
                game.hasUnlockedTutorials = true;
            }
        }
    });
</script>

<div class="game-container">
    {#if game.gameState === 'start'}
        {#if game.view === 'game'}
            <div class="screen start-screen">
                <div class="start-header">
                    <a href="/minigames" class="header-link left">← 오락실</a>
                    <h1>Killer Sudoku</h1>
                    <div class="header-links">
                        {#if game.hasUnlockedTutorials}
                            <button class="header-link" onclick={() => game.view = 'tutorials_list'}>공략집</button>
                        {/if}
                        <button class="header-link" onclick={() => { game.view = 'ranking'; game.rankingTab = 'halloffame'; game.loadHallOfFame(); }}>랭킹 🏆</button>
                    </div>
                </div>

                {#if game.hasSavedGame && game.startMode === 'initial'}
                    <div class="difficulty-select options">
                        <button class="btn-primary huge" onclick={game.loadSavedGame}>
                            이어하기
                        </button>
                        <div class="divider">OR</div>
                        <button class="btn-secondary huge" onclick={() => game.startMode = 'diff_select'}>
                            새 게임 시작
                        </button>
                    </div>
                    <div></div>
                {/if}

                {#if !game.hasSavedGame || game.startMode === 'diff_select'}
                    <div class="difficulty-select">
                        <h2>난이도 선택</h2>
                        <div class="options">
                            <label class:selected={game.difficulty === 'easy'}>
                                <input type="radio" name="difficulty" value="easy" bind:group={game.difficulty}>
                            쉬움
                            </label>
                            <label class:selected={game.difficulty === 'medium'}>
                                <input type="radio" name="difficulty" value="medium" bind:group={game.difficulty}>
                            보통
                            </label>
                            <label class:selected={game.difficulty === 'hard'}>
                                <input type="radio" name="difficulty" value="hard" bind:group={game.difficulty}>
                            어려움
                            </label>
                            <label class:selected={game.difficulty === 'expert'}>
                                <input type="radio" name="difficulty" value="expert" bind:group={game.difficulty}>
                            전문가
                            </label>
                            <label class:selected={game.difficulty === 'master'}>
                                <input type="radio" name="difficulty" value="master" bind:group={game.difficulty}>
                            마스터
                            </label>
                        </div>
                    </div>
                    <button class="btn-primary huge" onclick={() => game.startGame()}>게임 시작</button>

                    {#if game.hasSavedGame}
                        <button class="btn-text" onclick={() => game.startMode = 'initial'}>취소하고 돌아가기</button>
                    {/if}
                {/if}
            </div>

        {:else if game.view === 'ranking'}
            <div class="subpage">
                <div class="start-header">
                    <button class="header-link left" onclick={() => game.view = 'game'}>← 뒤로</button>
                    <h1>랭킹</h1>
                    <div class="header-links"></div>
                </div>
                <div class="ranking-tabs">
                    <button class="tab" class:active={game.rankingTab === 'halloffame'} onclick={() => { game.rankingTab = 'halloffame'; game.loadHallOfFame(); }}>명예의 전당</button>
                    <button class="tab" class:active={game.rankingTab === 'ranking'} onclick={() => game.rankingTab = 'ranking'}>킬러 스도쿠 랭킹</button>
                </div>
                <div class="subpage-body">
                    {#if game.rankingTab === 'halloffame'}
                        <div class="hall-of-fame">
                            {#if game.hallOfFameLoading}
                                <div class="hof-loading">불러오는 중...</div>
                            {:else if game.hallOfFameData.length === 0}
                                <div class="hof-empty">아직 기록이 없습니다.</div>
                            {:else}
                                {#each game.hallOfFameData as record, i}
                                    {@const diffLabel = difficultyLabels[record.difficulty as keyof typeof difficultyLabels] || record.difficulty}
                                    <div class="hof-card" class:hof-top3={i < 3}>
                                        <div class="hof-rank" class:hof-rank-1={i === 0} class:hof-rank-2={i === 1} class:hof-rank-3={i === 2}>
                                            {i + 1}
                                        </div>
                                        <div class="hof-body">
                                            <div class="hof-player">
                                                <span class="hof-name">{record.nickname || '익명'}</span>
                                                <span class="hof-difficulty">{diffLabel}</span>
                                            </div>
                                            <div class="hof-stats">
                                                <span class="hof-stat">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                                                    {record.score.toLocaleString()}
                                                </span>
                                                <span class="hof-stat">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                                    {formatTime(record.clear_time)}
                                                </span>
                                                <span class="hof-stat">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>
                                                    {record.mistakes}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                {/each}
                            {/if}
                        </div>
                    {:else}
                        <RankingBoard gameId="killer-sudoku" />
                    {/if}
                </div>
            </div>

        {:else if game.view === 'tutorials_list'}
            <div class="subpage">
                <div class="start-header">
                    <button class="header-link left" onclick={() => game.view = 'game'}>← 뒤로</button>
                    <h1>공략집</h1>
                    <div class="header-links"></div>
                </div>
                <div class="subpage-body">
                    <div class="tutorial-list-container">
                        <div class="tutorial-list">
                            {#each tutorial.tutorialOrder as tid}
                                {@const t = tutorial.tutorials[tid]}
                                {#if tutorial.unlockedTutorialIDs.has(tid)}
                                    <button class="tutorial-list-item" onclick={() => openTutorial(tid)}>
                                        <div class="t-info">
                                            <span class="t-badge {t.difficulty}">{t.difficulty.toUpperCase()}</span>
                                            <span class="t-title">{t.title}</span>
                                        </div>
                                        <span class="t-arrow">›</span>
                                    </button>
                                {/if}
                            {/each}
                        </div>
                    </div>
                </div>
            </div>
        {/if}

    {:else}
        <div class="game-play-area" class:blurred={game.alertMessage || game.confirmMessage || game.gameState === 'paused'}>
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

            <div class="game-area">
                 <KillerBoardComponent
                     board={game.board}
                     selectedCell={game.selectedCell}
                     cages={game.cages}
                     cageErrors={game.currentCageErrors}
                     isGameOver={game.gameState === 'finished'}
                     onselect={game.handleCellSelect}
                 />
            </div>

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

    {#if game.gameState === 'finished'}
        <GameResultModal
            isWon={game.isWon}
            message={game.isWon ? (game.calculatedScore >= 5000 ? '전설적인 기록입니다! 🏆' : '퍼즐을 완벽하게 해결했습니다! 🎉') : '아쉽지만 다음 기회에... 😭'}
            stats={[
                { label: '난이도', value: difficultyLabels[game.difficulty] },
                { label: '시간', value: formatTime(game.displayTimer) },
                { label: '실수', value: `${game.mistakes} / 3` },
                { label: '점수', value: game.calculatedScore.toLocaleString(), highlight: true }
            ]}
            showAd={game.isWon && GAME_CONFIG.ENABLE_ADS}
            onAdReward={game.handleAdReward}
            primaryAction={{ label: '다시 도전하기', onclick: () => goto('/games/start/killer-sudoku') }}
            secondaryAction={{ label: '나가기', onclick: game.quitGame }}
        />
    {/if}

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
    {/if}

    {#if game.isLoading}
        <div class="loading-overlay">
            <div class="spinner"></div>
            <p>게임 생성 중...</p>
        </div>
    {/if}
</div>

<style>
    .loading-overlay {
        position: fixed;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 2000;
        color: white;
        backdrop-filter: blur(5px);
    }
    .spinner {
        width: 40px; height: 40px;
        border: 4px solid rgba(255, 255, 255, 0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 1rem;
    }
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
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

    .divider {
        font-weight: bold;
        color: #bbb;
        margin: 0.5rem 0;
        font-size: 0.9rem;
        letter-spacing: 1px;
    }
    .btn-secondary.huge {
        width: 100%;
        justify-content: center;
        padding: 1rem;
        background: #fff;
        border: 2px solid #eee;
        font-size: 1.1rem;
        margin-bottom: 0.5rem;
    }
    .btn-secondary.huge:hover {
        border-color: #ddd;
        background: #fafafa;
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
	}

    .screen {
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        gap: 2.5rem;
        flex: 1;
        width: 100%;
        overflow: hidden;
        padding-top: 2rem;
    }
    .subpage {
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        width: 100%;
        flex: 1;
        gap: 2.5rem;
        overflow: hidden;
        padding-top: 2rem;
    }
    .subpage-body {
        overflow-y: auto;
        width: 100%;
    }

    .start-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 0 1rem;
    }

    .start-header h1 {
        font-size: 2.2rem;
        font-weight: 200;
        color: #333;
        margin: 0;
    }

    .header-link {
        font-size: 0.85rem;
        color: #666;
        text-decoration: none;
        background: none;
        border: none;
        cursor: pointer;
        padding: 0.5rem;
        transition: color 0.2s;
    }

    .header-link:hover {
        color: #333;
    }

    .start-screen h1 {
        font-size: 3rem;
        font-weight: 200;
        color: #333;
        margin-bottom: 1rem;
    }

    .difficulty-select {
        text-align: center;
        width: 100%;
    }

    .difficulty-select h2 {
        font-size: 1.1rem;
        font-weight: 500;
        color: #888;
        margin-bottom: 1rem;
        text-transform: uppercase;
        letter-spacing: 1px;
    }

    .options {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0.8rem;
        width: 100%;
    }

    @media (max-width: 600px) {
        .screen {
            gap: 1rem;
            padding: 1rem 0;
        }
        .start-screen h1 {
            font-size: 2rem;
            margin-bottom: 0.5rem;
        }
        .options {
            flex-direction: column;
            align-items: stretch;
            padding: 0 1rem;
        }
        .options label {
            justify-content: center;
            padding: 0.8rem 1.5rem;
            font-size: 1rem;
        }
    }

    .options label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 1rem 2rem;
        background: #f5f5f7;
        border-radius: 16px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        border: 2px solid transparent;
        color: #555;
        font-size: 1.1rem;
    }

    .options label:hover {
        background: #f0f0f0;
    }

    .options label.selected {
        background: #333;
        border-color: #333;
        color: white;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }

    .options input {
        display: none;
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
        width: 32px; height: 32px;
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
        background: rgba(0,0,0,0.2);
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

    .btn-primary.huge {
        font-size: 1.2rem;
        padding: 1.2rem 4rem;
    }

    .btn-danger {
        background: transparent;
        color: #ff3b30;
        border: 1px solid #ff3b30;
        padding: 0.8rem 2rem;
        border-radius: 50px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
    }

    .btn-danger:hover {
        background: #fff0f0;
    }

    .start-screen .btn-primary {
        margin-top: 1rem;
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

    @media (max-width: 600px) {
        .start-screen .btn-primary {
            width: 100%;
        }
        .btn-secondary {
            width: 100%;
            justify-content: center;
        }
    }

    .btn-text {
        background: none;
        border: none;
        color: #8e8e93;
        cursor: pointer;
        text-decoration: none;
        font-size: 0.95rem;
        transition: color 0.2s;
    }

    .btn-text:hover {
        color: #333;
    }

    /* Ranking Tabs */
    .ranking-tabs {
        display: flex;
        gap: 0;
        width: 100%;
        max-width: 500px;
        margin: 0 auto;
        background: #f0f0f0;
        border-radius: 12px;
        padding: 4px;
    }
    .tab {
        flex: 1;
        padding: 0.6rem 1rem;
        border: none;
        background: transparent;
        border-radius: 10px;
        font-weight: 600;
        font-size: 0.9rem;
        color: #888;
        cursor: pointer;
        transition: all 0.2s;
    }
    .tab.active {
        background: #fff;
        color: #333;
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }

    /* Hall of Fame */
    .hall-of-fame {
        width: 100%;
        max-width: 500px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
        overflow-y: auto;
        flex: 1;
    }
    .hof-card {
        display: flex;
        align-items: center;
        gap: 0.9rem;
        background: #fff;
        border-radius: 10px;
        padding: 0.7rem 1rem;
        border: 1px solid #eee;
    }
    .hof-top3 {
        background: #fafafa;
        border-color: #ddd;
    }
    .hof-rank {
        font-size: 0.85rem;
        font-weight: 800;
        width: 28px; height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: #f0f0f0;
        color: #999;
        font-variant-numeric: tabular-nums;
        flex-shrink: 0;
    }
    .hof-rank-1 { background: #333; color: #fff; }
    .hof-rank-2 { background: #777; color: #fff; }
    .hof-rank-3 { background: #aaa; color: #fff; }
    .hof-body { flex: 1; min-width: 0; }
    .hof-difficulty {
        font-size: 0.65rem;
        font-weight: 600;
        color: #bbb;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    .hof-player {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        margin-bottom: 0.2rem;
    }
    .hof-name {
        font-size: 0.95rem;
        font-weight: 700;
        color: #333;
    }
    .hof-stats {
        display: flex;
        gap: 0.7rem;
        font-size: 0.78rem;
        color: #888;
    }
    .hof-stat {
        display: flex;
        align-items: center;
        gap: 0.25rem;
    }
    .hof-stat svg { opacity: 0.5; }
    .hof-loading, .hof-empty {
        text-align: center;
        padding: 2rem;
        color: #888;
    }

    @media (max-width: 450px) {
        .start-screen h1 {
            font-size: 1.8rem;
        }
        .btn-primary {
            padding: 0.7rem 1.5rem;
            font-size: 0.95rem;
            margin-top: 0.5rem;
        }
    }

    /* Tutorial List Styles */
    .tutorial-list-container {
        width: 100%;
        max-width: 500px;
        margin: 0 auto;
        padding: 0 0.5rem;
    }
    .tutorial-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .tutorial-list-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #fff;
        border: 1px solid #eee;
        border-radius: 10px;
        padding: 0.8rem 1rem;
        cursor: pointer;
        transition: all 0.2s;
        width: 100%;
        text-align: left;
    }
    .tutorial-list-item:hover {
        background: #f8f9fa;
        border-color: #ddd;
    }
    .t-info {
        display: flex;
        align-items: center;
        gap: 0.6rem;
    }
    .t-badge {
        font-size: 0.6rem;
        font-weight: 700;
        padding: 0.15rem 0.4rem;
        border-radius: 4px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    .t-badge.easy { background: #d3f9d8; color: #2b8a3e; }
    .t-badge.medium { background: #fff3bf; color: #e67700; }
    .t-badge.hard { background: #ffc9c9; color: #c92a2a; }
    .t-badge.expert { background: #d0bfff; color: #5f3dc4; }
    .t-title {
        font-size: 0.95rem;
        font-weight: 600;
        color: #333;
    }
    .t-arrow {
        font-size: 1.2rem;
        color: #adb5bd;
        font-weight: 300;
    }
</style>

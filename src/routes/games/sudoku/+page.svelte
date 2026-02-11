<script lang="ts">
    import { onMount } from 'svelte';
    import BoardComponent from './Board.svelte';
    import Controls from './Controls.svelte';
    import { goto } from '$app/navigation';
    import { browser } from '$app/environment';
    import RankingBoard from '$lib/components/gamification/RankingBoard.svelte';
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
                user.refresh().then(() => game.startGame());
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
        }

        user.refresh();
        game.checkSavedGameExists();

        return () => {
            game.clearTimerInterval();
        };
    });

    $effect(() => {
        if (browser) {
            const unlockedLocal = JSON.parse(localStorage.getItem(
                game.gameMode === 'killer' ? 'killer_sudoku_unlocked_tutorials' : 'sudoku_unlocked_tutorials'
            ) || '[]');
            const unlockedDB = $user.completedTutorials || [];

            const all = [...unlockedLocal, ...unlockedDB];
            const prefix = game.gameMode === 'killer' ? 'killer_' : 'sudoku_';
            game.hasUnlockedTutorials = all.some((id: string) => typeof id === 'string' && id.startsWith(prefix));
        }
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

    {:else if game.gameState === 'start'}
        <div class="screen start-screen">
            <!-- Main Header -->
            <div class="start-header">
                <a href="/minigames" class="header-link left">← 오락실</a>
                <h1>{game.gameMode === 'killer' ? 'Killer Sudoku' : 'Sudoku'}</h1>
                <div class="header-links">
                    <!-- Right header area (empty or settings?) -->
                </div>
            </div>

            <!-- Tab Navigation -->
            <div class="tab-nav">
                <button
                    class="tab-btn"
                    class:active={game.activeTab === 'difficulty'}
                    onclick={() => game.activeTab = 'difficulty'}
                >
                    난이도
                </button>
                <button
                    class="tab-btn"
                    class:active={game.activeTab === 'ranking'}
                    onclick={() => { game.activeTab = 'ranking'; game.rankingTab = 'ranking'; }}
                >
                    랭킹
                </button>
                {#if game.hasUnlockedTutorials}
                    <button
                        class="tab-btn"
                        class:active={game.activeTab === 'guide'}
                        onclick={() => game.activeTab = 'guide'}
                    >
                        공략집
                    </button>
                {/if}
            </div>

            <!-- Tab Content -->
            <div class="tab-content">
                
                <!-- 1. Difficulty Tab -->
                {#if game.activeTab === 'difficulty'}
                    <div class="difficulty-tab-content">
                        {#if game.hasSavedGame && game.startMode === 'initial'}
                            <div class="saved-game-prompt">
                                <button class="btn-primary huge" onclick={game.loadSavedGame}>
                                    이어하기
                                </button>
                                <div class="divider">OR</div>
                                <button class="btn-secondary huge" onclick={() => game.startMode = 'diff_select'}>
                                    새 게임 시작
                                </button>
                            </div>
                        {:else}
                            <div class="difficulty-selection-container">
                                <div class="difficulty-select">
                                    <!-- <h2>난이도 선택</h2> --> 
                                    <!-- Title removed or kept? User said "Difficulty Select and Start Button space-between" -->
                                    <!-- Let's keep it simple. -->
                                            
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
                                
                                <div class="start-actions">
                                    <button class="btn-primary huge" onclick={() => game.startGame()}>게임 시작</button>
                                    {#if game.hasSavedGame}
                                        <button class="btn-text" onclick={() => game.startMode = 'initial'}>취소</button>
                                    {/if}
                                </div>

                            </div>
                        {/if}
                    </div>

                <!-- 2. Ranking Tab -->
                {:else if game.activeTab === 'ranking'}
                    <div class="subpage-body">
                        <div class="ranking-tabs">
                            <button class="tab" class:active={game.rankingTab === 'ranking'} onclick={() => game.rankingTab = 'ranking'}>랭킹</button>
                            <button class="tab" class:active={game.rankingTab === 'halloffame'} onclick={() => { game.rankingTab = 'halloffame'; game.loadHallOfFame(); }}>명예의 전당</button>
                        </div>
                        
                        {#if game.rankingTab === 'halloffame'}
                            <div class="hall-of-fame-limit">
                                <p class="score-desc">점수 = 기본점수 + (제한시간 - 클리어시간) x 난이도 배율</p>
                                <div class="hall-of-fame">
                                    {#if game.hallOfFameLoading}
                                        <div class="hof-loading">불러오는 중...</div>
                                    {:else if game.hallOfFameData.length === 0}
                                        <div class="hof-empty">아직 기록이 없습니다.</div>
                                    {:else}
                                        {#each ['easy', 'medium', 'hard', 'expert', 'master'] as diff}
                                            {@const record = game.hallOfFameData.find((r: any) => r.difficulty === diff)}
                                            {@const diffLabel = difficultyLabels[diff as keyof typeof difficultyLabels]}
                                            {#if record}
                                                <div class="hof-card">
                                                    <div class="hof-diff-badge {diff}">
                                                        {diffLabel}
                                                    </div>
                                                    <div class="hof-body">
                                                        <div class="hof-player">
                                                            <span class="hof-name">{record.nickname || '익명'}</span>
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
                                            {:else}
                                                <div class="hof-card hof-empty-card">
                                                    <div class="hof-diff-badge {diff}">{diffLabel}</div>
                                                    <div class="hof-body">
                                                        <span class="hof-no-record">-</span>
                                                    </div>
                                                </div>
                                            {/if}
                                        {/each}
                                    {/if}
                                </div>
                            </div>
                        {:else}
                            <p class="score-desc">매월 1일 초기화</p>
                            <!-- Use dynamic gameId based on mode -->
                            <RankingBoard gameId={game.gameMode === 'killer' ? 'killer-sudoku' : 'sudoku'} />
                        {/if}
                    </div>

                <!-- 3. Guide Tab -->
                {:else if game.activeTab === 'guide'}
                    <div class="subpage-body">
                        <div class="tutorial-list-container">
                            <div class="tutorial-list">
                                {#each tutorial.currentTutorialOrder as tid}
                                    {@const t = tutorial.currentTutorials[tid]}
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
                {/if}
            </div>
        </div>

    {:else}
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
            message={game.isWon ? (game.calculatedScore >= 5000 ? '전설적인 기록입니다! 🏆' : '퍼즐을 완벽하게 해결했습니다! 🎉') : '아쉽지만 다음 기회에... 😭'}
            stats={[
                { label: '난이도', value: difficultyLabels[game.difficulty] },
                { label: '시간', value: formatTime(game.displayTimer) },
                { label: '실수', value: `${game.mistakes} / 3` },
                { label: '점수', value: game.calculatedScore.toLocaleString(), highlight: true }
            ]}
            showAd={game.isWon && GAME_CONFIG.ENABLE_ADS}
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
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
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
        width: 40px;
        height: 40px;
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
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        width: 100%;
        padding: 0 1rem;
    }
    
    .start-header h1 {
        font-size: 2.5rem;
        font-weight: 200;
        color: #333;
        margin: 0;
        text-align: center;
    }

    .header-link.left {
        justify-self: start;
    }

    .header-links {
        justify-self: end;
        display: flex;
        gap: 0.5rem;
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
    
    .start-screen {
        /* Screen is already flex col */
        padding-top: 2rem;
        gap: 0.5rem; /* Reduce gap, let inner containers handle it */
    }

    /* Tab Navigation */
    .tab-nav {
        display: flex;
        justify-content: center;
        gap: 0.5rem;
        padding: 0 1rem;
        margin-bottom: 0.5rem;
        flex-shrink: 0;
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

    /* Tab Content - fills remaining space */
    .tab-content {
        flex: 1;
        width: 100%;
        overflow: hidden; /* Scroll inside */
        display: flex;
        flex-direction: column;
    }

    /* Difficulty Tab Layout */
    .difficulty-tab-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center; /* Center horizontally or vertically? */
        width: 100%;
        padding: 0 1rem 2rem 1rem;
    }

    .difficulty-selection-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: space-between; /* Push start button to bottom */
        width: 100%;
        align-items: center;
        gap: 2rem;
        padding-top: 2rem;
    }
    
    .difficulty-select {
        width: 100%;
    }

    .start-actions {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
    }

    .saved-game-prompt {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        flex: 1;
        width: 100%;
    }

    /* Scrollable ranking container */
    .hall-of-fame-limit {
        flex: 1;
        overflow-y: auto;
        padding: 0 1rem;
    }

    /* ... Existing Styles Below ... */
    
    .start-header {
        /* Reduced bottom margin */
        padding-bottom: 0.5rem; 
    }

    /* Fix start header title size for different modes if needed? */
    .start-header h1 {
        font-size: 2.2rem; /* Slightly smaller to fit tabs */
    }

    /* Hide old subpage styles if any overlap */
    .subpage-body {
        padding: 0; /* Remove padding for tab content context */
    }
    
    /* ... keep existing styles for options, btn, etc. ... */
    
    .options {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.8rem;
        width: 100%;
    }
    
    .options label {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 1.2rem;
        width: 100%;
        max-width: 500px;
        background: #f5f5f7;
        border-radius: 20px;
        cursor: pointer;
        font-weight: 600;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        border: 2px solid transparent;
        color: #555;
        font-size: 1.25rem;
        box-sizing: border-box;
    }
    
    .options label:hover {
        background: #f0f0f0;
    }

    /* ... */

    .btn-primary.huge {
        font-size: 1.3rem;
        padding: 1.4rem;
        width: 100%;
        max-width: 500px;
        border-radius: 24px;
    }

    /* ... */

    .btn-secondary.huge {
        width: 100%;
        max-width: 500px;
        justify-content: center;
        padding: 1.4rem;
        background: #fff;
        border: 2px solid #eee;
        font-size: 1.3rem;
        margin-bottom: 0.5rem;
        border-radius: 24px;
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
    
    .btn-primary.huge {
        font-size: 1.2rem;
        padding: 1rem 2rem;
        width: 100%;
        max-width: 320px;
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
    
    .sub-actions {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
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

    .divider {
        font-weight: bold;
        color: #bbb;
        margin: 0.5rem 0;
        font-size: 0.9rem;
        letter-spacing: 1px;
    }

    .btn-secondary.huge {
        width: 100%;
        max-width: 320px;
        justify-content: center;
        padding: 1rem;
        background: #fff;
        border: 2px solid #eee;
        font-size: 1.1rem;
        margin-bottom: 0.5rem;
    }

    @media (max-width: 600px) {
        .start-screen .btn-primary {
            width: 100%; /* Match the width of stretched difficulty buttons */
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
        .start-screen h1 {
            font-size: 2.3rem;
        }
        .difficulty-select h2 {
            font-size: 0.85rem;
            margin-bottom: 0.4rem;
        }
  
        .btn-primary {
            padding: 0.7rem 1.5rem;
            font-size: 0.95rem;
            margin-top: 0.5rem;
        }
    }
    @media (max-width: 350px) {
        .cell {
            width: 32px;
            height: 32px;
            font-size: 1.1rem;
        }
        .start-screen h1 {
            font-size: 1.8rem;
        }
    }

    /* Tutorial List Styles */
    .tutorial-list-container {
        width: 100%;
        max-width: 500px;
        margin: 0 auto;
    }
    
    .tutorial-list {
        display: flex;
        flex-direction: column;
        width: 100%;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        overflow: hidden;
    }
    
    .tutorial-list-item {
        background: white;
        border: none;
        border-bottom: 1px solid #f0f0f0;
        padding: 1rem 1.2rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        text-align: left;
        cursor: pointer;
        transition: background 0.2s;
    }
    
    .tutorial-list-item:hover {
        background: #f5f5f7;
    }
    
    .tutorial-list-item:last-child {
        border-bottom: none;
    }
    
    .t-info {
        display: flex;
        align-items: center;
        gap: 0.8rem;
    }
    
    .t-badge {
        font-size: 0.65rem;
        font-weight: 700;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        background: #eee;
        color: #666;
        min-width: 50px;
        text-align: center;
    }
    .t-badge.easy { background: #e8f5e9; color: #2e7d32; }
    .t-badge.medium { background: #fff3e0; color: #ef6c00; }
    .t-badge.hard { background: #ffebee; color: #c62828; }
    
    .t-title {
        font-size: 1rem;
        font-weight: 600;
        color: #333;
    }
    
    .t-arrow {
        color: #ccc;
        font-size: 1.5rem;
        font-weight: 300;
    }
    
    .empty-state {
        text-align: center;
        padding: 3rem 1rem;
        color: #888;
    }

    .empty-state p {
        margin: 0.5rem 0;
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
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: #f0f0f0;
        color: #999;
        font-variant-numeric: tabular-nums;
        flex-shrink: 0;
    }
    .hof-rank-1 {
        background: #333;
        color: #fff;
    }
    .hof-rank-2 {
        background: #777;
        color: #fff;
    }
    .hof-rank-3 {
        background: #aaa;
        color: #fff;
    }
    .hof-body {
        flex: 1;
        min-width: 0;
    }
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
    .hof-stat svg {
        opacity: 0.5;
    }
    .hof-loading, .hof-empty {
        text-align: center;
        padding: 2rem;
        color: #888;
    }
    .hof-diff-badge {
        font-size: 0.75rem;
        font-weight: 700;
        padding: 0.3rem 0.6rem;
        border-radius: 6px;
        min-width: 50px;
        text-align: center;
        flex-shrink: 0;
        background: #f0f0f0;
        color: #666;
    }
    .hof-diff-badge.easy { background: #e8f5e9; color: #2e7d32; }
    .hof-diff-badge.medium { background: #fff3e0; color: #ef6c00; }
    .hof-diff-badge.hard { background: #ffebee; color: #c62828; }
    .hof-diff-badge.expert { background: #e8eaf6; color: #283593; }
    .hof-diff-badge.master { background: #f3e5f5; color: #6a1b9a; }
    .hof-empty-card {
        opacity: 0.5;
    }
    .hof-no-record {
        font-size: 0.85rem;
        color: #aaa;
    }
    .score-desc {
        text-align: center;
        font-size: 0.78rem;
        color: #999;
        margin: 1rem 0 1rem 0;
    }

    .mode-badge {
        font-size: 0.8rem;
        background: #007aff;
        color: white;
        padding: 2px 8px;
        border-radius: 12px;
        margin-left: 8px;
        vertical-align: middle;
        font-weight: 600;
        text-transform: uppercase;
    }

</style>

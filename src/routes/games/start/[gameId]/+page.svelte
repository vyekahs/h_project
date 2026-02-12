<script lang="ts">
    import { goto } from '$app/navigation';
    import { browser } from '$app/environment';
    import RankingBoard from '$lib/components/gamification/RankingBoard.svelte';
    import { user } from '$lib/stores/user';
    import type { GameConfig } from '$lib/games/gameRegistry';
    import { formatTime } from '$lib/games/utils';

    let { data } = $props();
    let gameConfig = $derived(data.gameConfig);

    // Tabs
    let activeTab: 'difficulty' | 'ranking' | 'guide' = $state('difficulty');
    let rankingTab: 'ranking' | 'halloffame' = $state('ranking');

    // Difficulty - Initialize with default, but update via effect
    let difficulty = $state('');

    // Ensure valid difficulty when config changes
    $effect(() => {
        if (!difficulty || !gameConfig.difficulties.includes(difficulty)) {
            difficulty = gameConfig.difficulties[1] || gameConfig.difficulties[0];
        }
    });

    // Saved game
    let hasSavedGame = $state(false);
    let startMode: 'initial' | 'diff_select' = $state('initial');

    // Hall of Fame
    let hallOfFameData: any[] = $state([]);
    let hallOfFameLoading = $state(false);

    // Tutorials
    let hasUnlockedTutorials = $state(false);
    let tutorialData: Record<string, any> | null = $state(null);
    let tutorialOrder: string[] = $state([]);
    let unlockedTutorialIDs: Set<string> = $state(new Set());
    
    let visibleTutorials = $derived(
        (tutorialData && tutorialOrder)
        ? tutorialOrder.filter(tid => tutorialData[tid] && unlockedTutorialIDs.has(tid))
        : []
    );

    // Tutorial modal
    let showTutorial = $state(false);
    let activeTutorialId = $state('');
    let TutorialModalComponent: any = $state(null);

    // Check saved game
    $effect(() => {
        if (!browser) return;
        try {
            const saved = localStorage.getItem(gameConfig.localStorageSaveKey);
            if (saved) {
                const data = JSON.parse(saved);
                // For sudoku, check mode matches
                if (gameConfig.id === 'sudoku' && data.gameMode && data.gameMode !== 'standard') {
                    hasSavedGame = false;
                } else if (gameConfig.id === 'killer-sudoku' && data.gameMode && data.gameMode !== 'killer') {
                    hasSavedGame = false;
                } else {
                    hasSavedGame = true;
                }
            } else {
                hasSavedGame = false;
            }
        } catch {
            hasSavedGame = false;
        }
    });

    // Load tutorial data
    $effect(() => {
        if (!browser || !gameConfig.hasTutorials) {
            tutorialData = null;
            tutorialOrder = [];
            return;
        }

        const localKey = gameConfig.tutorialLocalStorageKey;
        const localData = localKey ? JSON.parse(localStorage.getItem(localKey) || '[]') : [];
        const dbData = ($user as any)?.completedTutorials || [];
        const allUnlocked = [...localData, ...dbData];
        unlockedTutorialIDs = new Set(allUnlocked);

        const prefix = gameConfig.tutorialPrefix || '';
        hasUnlockedTutorials = allUnlocked.some((id: string) => typeof id === 'string' && id.startsWith(prefix));

        // Dynamically load tutorial data
        if (gameConfig.id === 'sudoku') {
            import('../../../games/sudoku/tutorialData').then(m => {
                tutorialData = m.TUTORIALS;
                tutorialOrder = m.TUTORIAL_ORDER;
            });
        } else if (gameConfig.id === 'killer-sudoku') {
            import('../../../games/killer-sudoku/killerTutorialData').then(m => {
                tutorialData = m.KILLER_TUTORIALS;
                tutorialOrder = m.KILLER_TUTORIAL_ORDER;
            });
        } else {
            tutorialData = null;
            tutorialOrder = [];
        }
    });

    async function loadHallOfFame() {
        hallOfFameLoading = true;
        try {
            const res = await fetch(`/api/ranking/halloffame/${gameConfig.id}`);
            if (res.ok) {
                hallOfFameData = await res.json();
            }
        } catch (e) {
            console.error('Failed to load hall of fame', e);
        } finally {
            hallOfFameLoading = false;
        }
    }

    function startGame() {
        const separator = gameConfig.gameUrl.includes('?') ? '&' : '?';
        goto(`${gameConfig.gameUrl}${separator}autostart=true&difficulty=${difficulty}`);
    }

    function resumeGame() {
        const separator = gameConfig.gameUrl.includes('?') ? '&' : '?';
        goto(`${gameConfig.gameUrl}${separator}resume=true`);
    }

    async function openTutorial(tid: string) {
        activeTutorialId = tid;
        // Load the correct tutorial modal component
        if (gameConfig.id === 'sudoku') {
            const mod = await import('../../../games/sudoku/TutorialModal.svelte');
            TutorialModalComponent = mod.default;
        } else if (gameConfig.id === 'killer-sudoku') {
            const mod = await import('../../../games/killer-sudoku/KillerTutorialModal.svelte');
            TutorialModalComponent = mod.default;
        }
        showTutorial = true;
    }

    function handleTutorialClose(shouldStart: boolean) {
        showTutorial = false;
        TutorialModalComponent = null;
        if (shouldStart) {
            startGame();
        }
    }
</script>

<div class="page-background"></div>

<div class="game-container">
    <div class="screen start-screen">
        <!-- Header -->
        <div class="start-header">
            <a href="/minigames" class="back-btn glass-btn">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </a>
            <h1>{gameConfig.displayTitle}</h1>
            <div class="header-links"></div>
        </div>

        <!-- Glass Panel Container -->
        <div class="glass-panel main-panel">
            <!-- Tab Navigation -->
            <div class="tab-nav-pill">
                <button
                    class="tab-btn"
                    class:active={activeTab === 'difficulty'}
                    onclick={() => activeTab = 'difficulty'}
                >
                    난이도
                </button>
                <div class="tab-divider"></div>
                <button
                    class="tab-btn"
                    class:active={activeTab === 'ranking'}
                    onclick={() => { activeTab = 'ranking'; rankingTab = 'ranking'; }}
                >
                    랭킹
                </button>
                {#if gameConfig.hasTutorials}
                    <div class="tab-divider"></div>
                    <button
                        class="tab-btn"
                        class:active={activeTab === 'guide'}
                        onclick={() => activeTab = 'guide'}
                    >
                        공략집
                    </button>
                {/if}
            </div>

            <!-- Tab Content -->
            <div class="tab-content">

                <!-- 1. Difficulty Tab -->
                {#if activeTab === 'difficulty'}
                    <div class="difficulty-tab-content">
                        {#if hasSavedGame && startMode === 'initial'}
                            <div class="saved-game-prompt">
                                <p class="prompt-text">진행 중인 게임이 있습니다</p>
                                <button class="btn-primary huge" onclick={resumeGame}>
                                    이어하기
                                </button>
                                <div class="divider">
                                    <span>OR</span>
                                </div>
                                <button class="btn-secondary huge" onclick={() => startMode = 'diff_select'}>
                                    새 게임 시작
                                </button>
                            </div>
                        {:else}
                            <div class="difficulty-selection-container">
                                <div class="difficulty-select">
                                    <div class="options">
                                        {#each gameConfig.difficulties as diff}
                                            <label class:selected={difficulty === diff} class="diff-btn">
                                                <input type="radio" name="difficulty" value={diff} bind:group={difficulty}>
                                                <span class="diff-name">{gameConfig.difficultyLabels[diff]}</span>
                                            </label>
                                        {/each}
                                    </div>
                                </div>

                                <div class="start-actions">
                                    <button class="btn-primary huge" onclick={startGame}>게임 시작</button>
                                    {#if hasSavedGame}
                                        <button class="btn-text" onclick={() => startMode = 'initial'}>취소</button>
                                    {/if}
                                </div>
                            </div>
                        {/if}
                    </div>

                <!-- 2. Ranking Tab -->
                {:else if activeTab === 'ranking'}
                    <div class="subpage-body">
                        <div class="ranking-tabs-pill">
                            <button class="tab" class:active={rankingTab === 'ranking'} onclick={() => rankingTab = 'ranking'}>랭킹</button>
                            <button class="tab" class:active={rankingTab === 'halloffame'} onclick={() => { rankingTab = 'halloffame'; loadHallOfFame(); }}>명예의 전당</button>
                        </div>

                        {#if rankingTab === 'halloffame'}
                            <div class="hall-of-fame-limit">
                                <p class="score-desc">점수 = 기본점수 + (제한시간 - 클리어시간) x 난이도 배율</p>
                                <div class="hall-of-fame">
                                    {#if hallOfFameLoading}
                                        <div class="hof-loading">불러오는 중...</div>
                                    {:else if hallOfFameData.length === 0}
                                        <div class="hof-empty">아직 기록이 없습니다.</div>
                                    {:else}
                                        {#each gameConfig.difficulties as diff}
                                            {@const record = hallOfFameData.find((r: any) => r.difficulty === diff)}
                                            {@const diffLabel = gameConfig.difficultyLabels[diff]}
                                            {#if record}
                                                <div class="hof-card glass-list-item">
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
                                                                {#if gameConfig.id === 'unblock-me'}
                                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                                                        <polyline points="5 9 2 12 5 15" />
                                                                        <polyline points="9 5 12 2 15 5" />
                                                                        <polyline points="19 9 22 12 19 15" />
                                                                        <polyline points="15 19 12 22 9 19" />
                                                                        <line x1="2" y1="12" x2="22" y2="12" />
                                                                        <line x1="12" y1="2" x2="12" y2="22" />
                                                                    </svg>
                                                                {:else}
                                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/><line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/></svg>
                                                                {/if}
                                                                {record.mistakes}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            {:else}
                                                <div class="hof-card glass-list-item hof-empty-card">
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
                            <RankingBoard gameId={gameConfig.id} />
                        {/if}
                    </div>

                <!-- 3. Guide Tab -->
                {:else if activeTab === 'guide'}
                    <div class="subpage-body">
                        {#if visibleTutorials.length > 0}
                            <div class="tutorial-list-container">
                                <div class="tutorial-list">
                                    {#each visibleTutorials as tid}
                                        {@const t = tutorialData![tid]}
                                        <button class="tutorial-list-item glass-list-item" onclick={() => openTutorial(tid)}>
                                            <div class="t-info">
                                                <div class="hof-diff-badge {t.difficulty}">
                                                    {gameConfig.difficultyLabels[t.difficulty] || t.difficulty.toUpperCase()}
                                                </div>
                                                <span class="t-title">{t.title}</span>
                                            </div>
                                            <span class="t-arrow">›</span>
                                        </button>
                                    {/each}
                                </div>
                            </div>
                        {:else}
                            <div class="empty-state">
                                <p>아직 해금된 공략이 없습니다.</p>
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>
    </div>

    {#if showTutorial && TutorialModalComponent}
        <TutorialModalComponent tutorialId={activeTutorialId} onclose={handleTutorialClose} />
    {/if}
</div>

<style>
    :global(body) {
        margin: 0;
        background-color: #f0f2f5;
    }

    .page-background {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: -1;
        background: radial-gradient(circle at 10% 20%, rgba(216, 241, 230, 0.7) 0%, rgba(233, 240, 255, 0.4) 40%, rgba(240, 230, 250, 0.3) 80%);
        background-size: 200% 200%;
        animation: gradientMove 20s ease infinite;
    }

    @keyframes gradientMove {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
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
        max-width: 600px;
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
        gap: 1.5rem;
        flex: 1;
        width: 100%;
        overflow: hidden;
        padding-top: 2rem;
    }

    .start-screen {
        padding-top: 3.5rem;
    }

    /* Header */
    .start-header {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        width: 100%;
        padding: 0 0.5rem;
    }

    .start-header h1 {
        font-family: 'Outfit', sans-serif;
        font-size: 1.8rem;
        font-weight: 800;
        color: #333;
        margin: 0;
        text-align: center;
        letter-spacing: -0.5px;
    }

    .glass-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.5);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.6);
        color: #333;
        text-decoration: none;
        transition: all 0.2s;
    }

    .glass-btn:active {
        transform: scale(0.95);
        background: rgba(255, 255, 255, 0.7);
    }

    .back-btn {
        justify-self: start;
    }

    .header-links {
        justify-self: end;
        width: 40px;
    }

    /* Main Glass Panel */
    .glass-panel {
        background: rgba(255, 255, 255, 0.55);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.6);
        box-shadow: 
            0 10px 25px -5px rgba(0, 0, 0, 0.05), 
            0 8px 10px -6px rgba(0, 0, 0, 0.01);
        border-radius: 28px;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        flex: 1;
        overflow: hidden;
        min-height: 0; /* Important for inner scroll */
        margin-bottom: 2rem;
    }

    .main-panel {
        width: 100%;
        box-sizing: border-box;
    }

    /* Tab Navigation */
    .tab-nav-pill {
        display: flex;
        justify-content: center;
        align-items: center;
        background: rgba(255, 255, 255, 0.5);
        border-radius: 16px;
        padding: 4px;
        margin-bottom: 1rem;
        flex-shrink: 0;
        border: 1px solid rgba(255, 255, 255, 0.3);
    }

    .tab-btn {
        flex: 1;
        background: transparent;
        border: none;
        padding: 0.7rem 0;
        font-size: 0.95rem;
        color: #666;
        font-weight: 500;
        cursor: pointer;
        border-radius: 12px;
        transition: all 0.2s;
    }

    .tab-divider {
        width: 1px;
        height: 16px;
        background: rgba(0,0,0,0.1);
        margin: 0 2px;
    }

    .tab-btn.active {
        background: #fff;
        color: #333;
        font-weight: 700;
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }

    /* Tab Content */
    .tab-content {
        flex: 1;
        width: 100%;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        min-height: 0;
    }

    /* Difficulty Tab */
    .difficulty-tab-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        width: 100%;
        position: relative;
        min-height: 0;
    }

    .difficulty-selection-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        width: 100%;
        align-items: center;
        gap: 1rem;
        padding: 0.5rem 0;
        overflow: hidden;
        min-height: 0;
    }

    .difficulty-select {
        width: 100%;
        flex: 1;
        overflow-y: auto;
        padding: 0.5rem;
        min-height: 0;
    }

    .options {
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
    }

    .diff-btn {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 1rem;
        background: rgba(255, 255, 255, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.6);
        border-radius: 16px;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
        width: 100%;
        text-align: center;
    }

    .diff-btn:hover {
        background: rgba(255, 255, 255, 0.7);
    }

    .diff-btn.selected {
        background: linear-gradient(135deg, #333 0%, #111 100%);
        border-color: #333;
        color: white;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        transform: scale(1.02);
    }

    .diff-name {
        font-size: 1.1rem;
        font-weight: 600;
        color: #555;
    }

    .diff-btn.selected .diff-name {
        color: white;
        font-weight: 700;
    }

    .options input {
        display: none;
    }

    /* Actions */
    .start-actions {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.8rem;
        padding-top: 0.5rem;
        flex-shrink: 0; /* Don't shrink buttons */
    }

    .saved-game-prompt {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        flex: 1;
        width: 100%;
        gap: 1rem;
    }

    .prompt-text {
        font-size: 1.1rem;
        font-weight: 600;
        color: #555;
        margin-bottom: 1rem;
    }

    .divider {
        display: flex;
        align-items: center;
        width: 100%;
        margin: 0.5rem 0;
    }
    
    .divider::before, .divider::after {
        content: '';
        flex: 1;
        border-bottom: 1px dashed #ccc;
    }
    
    .divider span {
        padding: 0 0.8rem;
        font-size: 0.8rem;
        color: #999;
        font-weight: 600;
    }

    /* Buttons */
    .btn-primary {
        background: linear-gradient(135deg, #333 0%, #111 100%);
        color: white;
        border: none;
        padding: 1.1rem;
        border-radius: 20px;
        font-weight: 600;
        font-size: 1.1rem;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 8px 20px rgba(0,0,0,0.15);
        width: 100%;
    }

    .btn-primary:active {
        transform: scale(0.98);
        box-shadow: 0 4px 10px rgba(0,0,0,0.1);
    }

    .btn-secondary {
        background: #fff;
        color: #333;
        border: 2px solid #eee;
        padding: 1rem;
        border-radius: 20px;
        font-weight: 600;
        cursor: pointer;
        font-size: 1rem;
        width: 100%;
        transition: all 0.2s;
    }

    .btn-secondary:active, .btn-secondary:hover {
        background: #f8f9fa;
        border-color: #ddd;
    }

    .btn-text {
        background: none;
        border: none;
        color: #888;
        font-size: 0.9rem;
        padding: 0.5rem;
        cursor: pointer;
    }

    /* Scrolling Content */
    .subpage-body {
        overflow-y: auto;
        width: 100%;
        padding-top: 0.5rem;
        display: flex;
        flex-direction: column;
        min-height: 0;
    }

    .ranking-tabs-pill {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1rem;
        padding: 0 0.5rem;
    }

    .ranking-tabs-pill .tab {
        flex: 1;
        padding: 0.5rem;
        background: transparent;
        border: 1px solid rgba(0,0,0,0.1);
        border-radius: 10px;
        font-size: 0.85rem;
        color: #777;
        font-weight: 500;
        cursor: pointer;
    }

    .ranking-tabs-pill .tab.active {
        background: #333;
        color: #fff;
        border-color: #333;
    }

    .hall-of-fame-limit {
        flex: 1;
        overflow-y: auto;
    }

    .glass-list-item {
        background: rgba(255, 255, 255, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.5);
        border-radius: 14px;
        padding: 0.8rem 1rem;
        display: flex;
        align-items: center;
        margin-bottom: 0.8rem;
    }

    .hof-card {
        gap: 0.8rem;
    }

    .hof-body {
        flex: 1;
    }

    .hof-player {
        margin-bottom: 0.3rem;
    }

    .hof-name {
        font-weight: 700;
        font-size: 0.95rem;
    }

    .hof-stats {
        display: flex;
        gap: 0.8rem;
        font-size: 0.8rem;
        color: #666;
    }

    .hof-stat {
        display: flex;
        align-items: center;
        gap: 0.3rem;
    }

    .hof-diff-badge {
        font-size: 0.7rem;
        font-weight: 700;
        padding: 0.3rem 0.5rem;
        border-radius: 6px;
        min-width: 45px;
        text-align: center;
    }
    
    .hof-diff-badge.easy { background: #e8f5e9; color: #2e7d32; }
    .hof-diff-badge.medium { background: #fff3e0; color: #ef6c00; }
    .hof-diff-badge.hard { background: #ffebee; color: #c62828; }
    .hof-diff-badge.expert { background: #e8eaf6; color: #283593; }
    .hof-diff-badge.master { background: #f3e5f5; color: #6a1b9a; }

    .score-desc {
        text-align: center;
        font-size: 0.8rem;
        color: #888;
        margin-bottom: 1rem;
    }

    /* Tutorial List */
    .tutorial-list {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
    }

    .tutorial-list-item {
        justify-content: space-between;
        cursor: pointer;
        text-align: left;
        transition: all 0.2s;
    }

    .tutorial-list-item:active {
        transform: scale(0.98);
        background: rgba(255, 255, 255, 0.6);
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
    }
    
    .t-title {
        font-weight: 500;
        font-size: 0.95rem;
    }

    .t-arrow {
        color: #aaa;
        font-weight: 600;
    }

    .empty-state {
        text-align: center;
        padding: 3rem 1rem;
        color: #999;
    }

    .hof-loading, .hof-empty {
        text-align: center;
        padding: 2rem;
        color: #888;
    }
</style>

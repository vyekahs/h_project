<script lang="ts">
    import { goto } from '$app/navigation';
    import { browser } from '$app/environment';
    import RankingBoard from '$lib/components/gamification/RankingBoard.svelte';
    import { user } from '$lib/stores/user';
    import type { GameConfig } from '$lib/games/gameRegistry';
    import { formatTime } from '$lib/games/utils';

    let { data } = $props();
    const gameConfig: GameConfig = data.gameConfig;

    // Tabs
    let activeTab: 'difficulty' | 'ranking' | 'guide' = $state('difficulty');
    let rankingTab: 'ranking' | 'halloffame' = $state('ranking');

    // Difficulty
    let difficulty = $state(gameConfig.difficulties[1] || gameConfig.difficulties[0]);

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
            }
        } catch {}
    });

    // Load tutorial data
    $effect(() => {
        if (!browser || !gameConfig.hasTutorials) return;

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

<div class="game-container">
    <div class="screen start-screen">
        <!-- Header -->
        <div class="start-header">
            <a href="/minigames" class="back-btn">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </a>
            <h1>{gameConfig.displayTitle}</h1>
            <div class="header-links"></div>
        </div>

        <!-- Tab Navigation -->
        <div class="tab-nav">
            <button
                class="tab-btn"
                class:active={activeTab === 'difficulty'}
                onclick={() => activeTab = 'difficulty'}
            >
                난이도
            </button>
            <button
                class="tab-btn"
                class:active={activeTab === 'ranking'}
                onclick={() => { activeTab = 'ranking'; rankingTab = 'ranking'; }}
            >
                랭킹
            </button>
            {#if gameConfig.hasTutorials && hasUnlockedTutorials}
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
                            <button class="btn-primary huge" onclick={resumeGame}>
                                이어하기
                            </button>
                            <div class="divider">OR</div>
                            <button class="btn-secondary huge" onclick={() => startMode = 'diff_select'}>
                                새 게임 시작
                            </button>
                        </div>
                    {:else}
                        <div class="difficulty-selection-container">
                            <div class="difficulty-select">
                                <div class="options">
                                    {#each gameConfig.difficulties as diff}
                                        <label class:selected={difficulty === diff}>
                                            <input type="radio" name="difficulty" value={diff} bind:group={difficulty}>
                                            {gameConfig.difficultyLabels[diff]}
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
                    <div class="ranking-tabs">
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
                        <RankingBoard gameId={gameConfig.id} />
                    {/if}
                </div>

            <!-- 3. Guide Tab -->
            {:else if activeTab === 'guide'}
                <div class="subpage-body">
                    {#if tutorialData && tutorialOrder.length > 0}
                        <div class="tutorial-list-container">
                            <div class="tutorial-list">
                                {#each tutorialOrder as tid}
                                    {@const t = tutorialData[tid]}
                                    {#if t && unlockedTutorialIDs.has(tid)}
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
                    {:else}
                        <div class="empty-state">
                            <p>아직 해금된 공략이 없습니다.</p>
                        </div>
                    {/if}
                </div>
            {/if}
        </div>
    </div>

    {#if showTutorial && TutorialModalComponent}
        <TutorialModalComponent tutorialId={activeTutorialId} onclose={handleTutorialClose} />
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

    .start-screen {
        padding-top: 3.5rem;
        gap: 0.5rem;
    }

    /* Header */
    .start-header {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        width: 100%;
        padding: 0 1rem;
        padding-bottom: 0.5rem;
    }

    .start-header h1 {
        font-family: 'Outfit', sans-serif;
        font-size: 2.2rem;
        font-weight: 800;
        color: #333;
        margin: 0;
        text-align: center;
        letter-spacing: -1px;
    }

    .back-btn {
        justify-self: start;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: 12px;
        background: #f1f3f5;
        color: #333;
        text-decoration: none;
        transition: background 0.2s;
    }

    .back-btn:hover {
        background: #e9ecef;
    }

    .header-links {
        justify-self: end;
        display: flex;
        gap: 0.5rem;
        width: 40px;
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

    /* Tab Content */
    .tab-content {
        flex: 1;
        width: 100%;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    /* Difficulty Tab */
    .difficulty-tab-content {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        width: 100%;
        padding: 0 1rem 2rem 1rem;
    }

    .difficulty-selection-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        width: 100%;
        align-items: center;
        gap: 2rem;
        padding-top: 2rem;
    }

    .difficulty-select {
        width: 100%;
    }

    .options {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
    }

    .options label {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 0.8rem;
        width: 100%;
        max-width: 500px;
        background: #f5f5f7;
        border-radius: 14px;
        cursor: pointer;
        font-weight: 600;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        border: 2px solid transparent;
        color: #555;
        font-size: 1.05rem;
        box-sizing: border-box;
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

    .divider {
        font-weight: bold;
        color: #bbb;
        margin: 0.5rem 0;
        font-size: 0.9rem;
        letter-spacing: 1px;
    }

    /* Buttons */
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
        max-width: 500px;
        border-radius: 24px;
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

    .btn-secondary.huge {
        width: 100%;
        max-width: 500px;
        justify-content: center;
        padding: 1rem;
        background: #fff;
        border: 2px solid #eee;
        font-size: 1.1rem;
        margin-bottom: 0.5rem;
        border-radius: 24px;
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

    /* Scrollable content */
    .subpage-body {
        overflow-y: auto;
        width: 100%;
        padding: 0;
    }

    .hall-of-fame-limit {
        flex: 1;
        overflow-y: auto;
        padding: 0 1rem;
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

    .hof-body {
        flex: 1;
        min-width: 0;
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

    /* Tutorial List */
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

    @media (max-width: 600px) {
        .start-screen .btn-primary {
            width: 100%;
        }
        .btn-secondary {
            width: 100%;
            justify-content: center;
        }
    }
</style>

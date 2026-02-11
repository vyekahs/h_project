<script lang="ts">
    import { GAME_CONFIG } from '$lib/config';
    import { getRandomLevel, parseLevel } from '$lib/games/unblock-me/levels';
    import type { Block, UnblockLevel } from '$lib/games/unblock-me/levels';
    import Board from './unblock-me/Board.svelte';

    type GameState = 'start' | 'playing' | 'paused' | 'finished';
    type Difficulty = 'easy' | 'medium' | 'hard' | 'expert' | 'master';

    // Game state
    let gameState: GameState = $state('start');
    let difficulty: Difficulty = $state('medium');
    let blocks: Block[] = $state([]);
    let currentLevel: UnblockLevel | null = $state(null);
    let moveCount = $state(0);
    let isWon = $state(false);

    // Timer
    let timerValue = 0;
    let displayTimer = $state(0);
    let timerInterval: any;

    // History for undo
    let history: string[] = $state([]);

    // UI state
    let activeTab: 'difficulty' | 'ranking' = $state('difficulty');
    let hasSavedGame = $state(false);
    let startMode: 'initial' | 'diff_select' = $state('initial');
    let isLoading = $state(false);

    // Modals
    let alertMessage: string | null = $state(null);
    let confirmMessage: string | null = $state(null);
    let confirmCallback: (() => void) | null = null;

    // Score
    let earnedPointsResult = $state(0);
    let calculatedScore = $state(0);

    // Ranking
    let hallOfFameData: any[] = $state([]);
    let hallOfFameLoading = $state(false);

    // Difficulty config
    const difficultyLabels: Record<string, string> = {
        easy: '쉬움', medium: '보통', hard: '어려움', expert: '전문가', master: '마스터'
    };

    const difficultyList: Difficulty[] = ['easy', 'medium', 'hard', 'expert', 'master'];

    const TIME_LIMITS: Record<string, number> = {
        easy: 120, medium: 300, hard: 600, expert: 900, master: 1200
    };

    // Check for saved game on mount
    $effect(() => {
        try {
            const saved = localStorage.getItem('unblockme_save');
            if (saved) {
                hasSavedGame = true;
            }
        } catch {}
    });

    // Formatting
    function formatTime(seconds: number) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    // Modal helpers
    function showAlert(msg: string) { alertMessage = msg; }

    function showConfirm(msg: string, cb: () => void) {
        confirmMessage = msg;
        confirmCallback = cb;
    }

    function handleConfirm(yes: boolean) {
        if (yes && confirmCallback) confirmCallback();
        confirmMessage = null;
        confirmCallback = null;
    }

    // Timer
    function startTimer() {
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            if (gameState === 'playing' && !alertMessage && !confirmMessage) {
                timerValue++;
                displayTimer = timerValue;
                if (timerValue % 5 === 0) {
                    saveGame();
                }
            }
        }, 1000);
    }

    function stopTimer() {
        clearInterval(timerInterval);
    }

    // Save / Load
    function saveGame() {
        if (gameState !== 'playing') return;
        try {
            const data = {
                blocks,
                currentLevel,
                moveCount,
                timer: timerValue,
                difficulty,
                history,
            };
            localStorage.setItem('unblockme_save', JSON.stringify(data));
        } catch {}
    }

    function loadGame() {
        try {
            const raw = localStorage.getItem('unblockme_save');
            if (!raw) { showAlert('저장된 게임이 없습니다.'); return; }

            const data = JSON.parse(raw);
            if (!data.blocks || !Array.isArray(data.blocks) || !data.currentLevel) {
                showAlert('저장 데이터가 손상되었습니다.');
                localStorage.removeItem('unblockme_save');
                hasSavedGame = false;
                return;
            }

            blocks = data.blocks;
            currentLevel = data.currentLevel;
            moveCount = data.moveCount || 0;
            timerValue = data.timer || 0;
            displayTimer = timerValue;
            difficulty = data.difficulty || 'medium';
            history = data.history || [];
            isWon = false;

            gameState = 'paused';
            startTimer();
        } catch {
            showAlert('저장 데이터를 불러올 수 없습니다.');
            localStorage.removeItem('unblockme_save');
            hasSavedGame = false;
        }
    }

    // Game flow
    async function startGame() {
        isLoading = true;
        await new Promise(r => setTimeout(r, 50));

        try {
            localStorage.removeItem('unblockme_save');
            const level = getRandomLevel(difficulty);
            currentLevel = level;
            blocks = parseLevel(level);
            moveCount = 0;
            isWon = false;
            timerValue = 0;
            displayTimer = 0;
            history = [];
            earnedPointsResult = 0;
            calculatedScore = 0;

            gameState = 'playing';
            hasSavedGame = true;
            startMode = 'initial';
            startTimer();
            saveGame();
        } finally {
            isLoading = false;
        }
    }

    function handleBeforeMove() {
        // Save current state before block position changes
        if (history.length >= 50) {
            history = history.slice(1);
        }
        history = [...history, JSON.stringify(blocks.map(b => ({ ...b })))];
    }

    function handleMove() {
        moveCount++;
    }

    function undo() {
        if (history.length === 0) return;
        const prev = history[history.length - 1];
        history = history.slice(0, -1);
        blocks = JSON.parse(prev);
        if (moveCount > 0) moveCount--;
    }

    function handleWin() {
        gameState = 'finished';
        isWon = true;
        stopTimer();
        localStorage.removeItem('unblockme_save');
        hasSavedGame = false;
        submitScore();
    }

    function calculateScoreValue(): number {
        if (!currentLevel) return 0;

        const baseScore = difficulty === 'easy' ? 10
            : difficulty === 'medium' ? 50
            : difficulty === 'hard' ? 120
            : difficulty === 'expert' ? 250 : 400;

        const timeLimit = TIME_LIMITS[difficulty];
        const timeMultiplier = difficulty === 'easy' ? 1
            : difficulty === 'medium' ? 2
            : difficulty === 'hard' ? 3
            : difficulty === 'expert' ? 4 : 5;
        const timeBonus = Math.max(0, (timeLimit - timerValue) * timeMultiplier);

        const moveMultiplier = difficulty === 'easy' ? 2
            : difficulty === 'medium' ? 4
            : difficulty === 'hard' ? 6
            : difficulty === 'expert' ? 8 : 10;
        const moveBonus = Math.max(0, (currentLevel.moves * 3 - moveCount) * moveMultiplier);

        return baseScore + timeBonus + moveBonus;
    }

    async function submitScore() {
        const score = calculateScoreValue();
        calculatedScore = score;

        try {
            const res = await fetch('/api/game/record', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gameId: 'unblock-me',
                    difficulty,
                    clearTime: timerValue,
                    score,
                    mistakes: 0,
                    skipReward: !GAME_CONFIG.ENABLE_REWARDS
                })
            });
            const data = await res.json();
            if (res.ok) {
                earnedPointsResult = data.earnedPoints;
                calculatedScore = data.score;
            }
        } catch (e) {
            console.error('Failed to submit score', e);
        }
    }

    function pauseGame() { gameState = 'paused'; }
    function resumeGame() { gameState = 'playing'; }

    function quitGame() {
        showConfirm('게임을 종료하시겠습니까?', () => {
            stopTimer();
            gameState = 'start';
            localStorage.removeItem('unblockme_save');
            hasSavedGame = false;
            startMode = 'initial';
        });
    }

    function returnToMenu() {
        stopTimer();
        gameState = 'start';
        startMode = 'initial';
    }

    // Ranking


    // Prevent pull-to-refresh during gameplay
    $effect(() => {
        if (gameState !== 'playing' && gameState !== 'paused') return;
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
        <!-- Playing / Paused / Finished -->
        <div class="play-header">
            <div class="play-header-left">
                <span class="diff-badge">{difficultyLabels[difficulty]}</span>
            </div>
            <div class="play-header-center">
                <div class="stat-item">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9l2 2 4-4"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                    <span>{moveCount}</span>
                </div>
                <div class="stat-item">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <span>{formatTime(displayTimer)}</span>
                </div>
            </div>
            <div class="play-header-right">
                <button class="icon-btn" onclick={pauseGame}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                </button>
            </div>
        </div>

        <div class="board-area">
            <Board
                bind:blocks
                isGameOver={gameState === 'finished'}
                onbeforemove={handleBeforeMove}
                onmove={handleMove}
                onwin={handleWin}
            />
        </div>

        <div class="controls-area">
            <button class="undo-btn" onclick={undo} disabled={history.length === 0 || gameState !== 'playing'}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
                <span>되돌리기</span>
            </button>
        </div>

        <!-- Pause Overlay -->
        {#if gameState === 'paused'}
            <div class="overlay" onclick={resumeGame}>
                <div class="modal pause-modal" onclick={(e) => e.stopPropagation()}>
                    <h2>일시정지</h2>
                    <div class="pause-stats">
                        <span>이동: {moveCount}회</span>
                        <span>시간: {formatTime(displayTimer)}</span>
                    </div>
                    <div class="modal-actions">
                        <button class="btn-secondary" onclick={quitGame}>나가기</button>
                        <button class="btn-primary" onclick={resumeGame}>계속하기</button>
                    </div>
                </div>
            </div>
        {/if}

        <!-- Result Overlay -->
        {#if gameState === 'finished'}
            <div class="overlay backdrop-blur">
                <div class="result-card win">
                    <div class="result-icon-container">
                        <div class="result-icon win-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                        </div>
                    </div>
                    <h2>SUCCESS!</h2>

                    <div class="result-stats-grid">
                        <div class="result-stat">
                            <span class="stat-label">난이도</span>
                            <span class="stat-value">{difficultyLabels[difficulty]}</span>
                        </div>
                        <div class="result-stat">
                            <span class="stat-label">시간</span>
                            <span class="stat-value">{formatTime(timerValue)}</span>
                        </div>
                        <div class="result-stat">
                            <span class="stat-label">이동</span>
                            <span class="stat-value">{moveCount}회</span>
                        </div>
                        <div class="result-stat">
                            <span class="stat-label">최적</span>
                            <span class="stat-value">{currentLevel?.moves}회</span>
                        </div>
                    </div>

                    <div class="score-display">
                        <span class="score-label">점수</span>
                        <span class="score-value">{calculatedScore.toLocaleString()}</span>
                    </div>

                    <div class="result-actions">
                        <button class="btn-secondary" onclick={quitGame}>나가기</button>
                        <button class="btn-primary" onclick={startGame}>다시 도전</button>
                    </div>
                </div>
            </div>
        {/if}


    <!-- Alert Modal -->
    {#if alertMessage}
        <div class="overlay" onclick={() => alertMessage = null}>
            <div class="modal alert-modal" onclick={(e) => e.stopPropagation()}>
                <p>{alertMessage}</p>
                <button class="btn-primary" onclick={() => alertMessage = null}>확인</button>
            </div>
        </div>
    {/if}

    <!-- Confirm Modal -->
    {#if confirmMessage}
        <div class="overlay" onclick={() => handleConfirm(false)}>
            <div class="modal alert-modal" onclick={(e) => e.stopPropagation()}>
                <p>{confirmMessage}</p>
                <div class="modal-actions">
                    <button class="btn-secondary" onclick={() => handleConfirm(false)}>취소</button>
                    <button class="btn-primary" onclick={() => handleConfirm(true)}>확인</button>
                </div>
            </div>
        </div>
    {/if}

    {#if isLoading}
        <div class="overlay">
            <div class="spinner"></div>
        </div>
    {/if}
</div>

<style>
    .game-container {
        padding: 1rem;
        max-width: 500px;
        min-height: 100dvh;
        display: flex;
        flex-direction: column;
        overscroll-behavior: none;
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

    /* Play Header */
    .play-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem 0 1rem 0;
    }

    .play-header-left, .play-header-right {
        flex: 0 0 auto;
    }

    .play-header-center {
        display: flex;
        gap: 1.2rem;
        align-items: center;
    }

    .diff-badge {
        background: #ef9a9a;
        color: white;
        padding: 0.3rem 0.8rem;
        border-radius: 8px;
        font-size: 0.8rem;
        font-weight: 700;
    }

    .stat-item {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 0.95rem;
        font-weight: 600;
        color: #555;
    }

    .icon-btn {
        background: none;
        border: none;
        padding: 6px;
        cursor: pointer;
        color: #555;
        border-radius: 8px;
        transition: background 0.2s;
    }

    .icon-btn:active {
        background: #f1f3f5;
        transform: scale(0.9);
    }

    /* Board Area */
    .board-area {
        flex: 1;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 0 2rem;
    }

    /* Controls */
    .controls-area {
        display: flex;
        justify-content: center;
        padding: 1.5rem 0 2rem 0;
    }

    .undo-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        background: #f1f3f5;
        border: none;
        padding: 0.7rem 1.4rem;
        border-radius: 12px;
        font-size: 0.9rem;
        font-weight: 600;
        color: #555;
        cursor: pointer;
        transition: all 0.2s;
    }

    .undo-btn:active:not(:disabled) {
        background: #e9ecef;
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

    .overlay.backdrop-blur {
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        background: rgba(0,0,0,0.2);
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

    .modal h2 {
        margin: 0 0 1rem 0;
        font-size: 1.3rem;
        font-weight: 700;
        color: #333;
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

    .pause-stats {
        display: flex;
        justify-content: center;
        gap: 1.5rem;
        margin-bottom: 1.5rem;
        color: #888;
        font-size: 0.9rem;
    }

    /* Result Card */
    .result-card {
        background: white;
        border-radius: 24px;
        padding: 2rem;
        width: 90%;
        max-width: 340px;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0,0,0,0.15);
        animation: popIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
    }

    .result-icon-container {
        margin-bottom: 1rem;
    }

    .result-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 72px;
        height: 72px;
        border-radius: 50%;
    }

    .win-icon {
        background: #e8f5e9;
        color: #4caf50;
    }

    .result-card h2 {
        margin: 0 0 1.5rem 0;
        font-size: 1.5rem;
        font-weight: 800;
        color: #333;
        letter-spacing: -0.5px;
    }

    .result-stats-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        margin-bottom: 1.5rem;
    }

    .result-stat {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .stat-label {
        font-size: 0.75rem;
        color: #999;
        font-weight: 500;
    }

    .stat-value {
        font-size: 1.1rem;
        font-weight: 700;
        color: #333;
    }

    .score-display {
        background: #f8f9fa;
        border-radius: 14px;
        padding: 1rem;
        margin-bottom: 1.5rem;
    }

    .score-label {
        display: block;
        font-size: 0.75rem;
        color: #999;
        font-weight: 500;
        margin-bottom: 4px;
    }

    .score-value {
        font-size: 1.8rem;
        font-weight: 800;
        color: #333;
    }

    .result-actions {
        display: flex;
        gap: 0.8rem;
    }

    /* Ranking */
    .ranking-content {
        padding: 0 0.5rem;
    }

    .ranking-empty {
        text-align: center;
        color: #adb5bd;
        padding: 3rem 0;
        font-size: 0.9rem;
    }

    .hof-list {
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
    }

    .hof-row {
        display: flex;
        align-items: center;
        padding: 0.7rem 0;
        border-bottom: 1px solid #f1f3f5;
    }

    .hof-rank {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: #f1f3f5;
        color: #868e96;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: 0.9rem;
        margin-right: 0.8rem;
        flex-shrink: 0;
    }

    .hof-rank.rank-1 { background: #ffd43b; color: #fff; }
    .hof-rank.rank-2 { background: #ced4da; color: #fff; }
    .hof-rank.rank-3 { background: #e7f5ff; color: #74c0fc; }

    .hof-info {
        flex: 1;
        display: flex;
        flex-direction: column;
    }

    .hof-name {
        font-weight: 500;
        font-size: 0.95rem;
        color: #333;
    }

    .hof-detail {
        font-size: 0.8rem;
        color: #999;
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .hof-diff {
        color: #adb5bd;
    }

    .hof-score {
        font-weight: 600;
        color: #333;
        font-size: 1rem;
    }

    /* Spinner */
    .spinner {
        width: 36px;
        height: 36px;
        border: 3px solid rgba(255,255,255,0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    @keyframes popIn {
        from { opacity: 0; transform: scale(0.85); }
        to { opacity: 1; transform: scale(1); }
    }

    @media (max-width: 450px) {
        .game-container {
            padding: 0.75rem;
        }
        .board-area {
            padding: 0 1rem;
        }
        .game-header h1 {
            font-size: 1.5rem;
        }
    }
</style>

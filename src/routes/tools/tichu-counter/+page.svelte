<script lang="ts">
    import { onMount } from 'svelte';
    import { createTichuGame, type PlayerData } from './gameLogic.svelte';

    const game = createTichuGame();

    let started = $state(false);

    // URL params for game session integration
    let urlPlayers: { id: number; name: string }[] = $state([]);
    let urlSessionId: number | null = $state(null);
    let hasUrlParams = $derived(urlPlayers.length === 4 && urlSessionId !== null);

    // Team assignment state
    let assignMode: 'random' | 'manual' = $state('random');
    let teamA: { id: number; name: string }[] = $state([]);
    let teamB: { id: number; name: string }[] = $state([]);
    let unassigned: { id: number; name: string }[] = $state([]);
    let teamAssignReady = $derived(teamA.length === 2 && teamB.length === 2);

    // Drag and drop state
    let dragItem: { id: number; name: string } | null = $state(null);
    let dragClone: HTMLElement | null = null;
    let dragSource: 'unassigned' | 'teamA' | 'teamB' | null = null;
    let highlightZone: 'unassigned' | 'teamA' | 'teamB' | null = $state(null);

    function focusOnMount(node: HTMLElement) {
        node.focus();
    }

    onMount(() => {
        // Prevent page scroll
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';

        const params = new URL(window.location.href).searchParams;
        const playersParam = params.get('players');
        const sessionParam = params.get('sessionId');
        const urlSid = sessionParam ? parseInt(sessionParam) : null;

        // Try loading saved game first
        const loaded = game.load();

        if (playersParam && urlSid !== null) {
            // URL params exist — only restore if game is in progress (has rounds, not finished)
            if (loaded && game.rounds.length > 0 && !game.winner && game.sessionId === urlSid) {
                // Same session, game still in progress (no winner yet) — resume
                started = true;
            } else {
                // New session, finished game, or no saved data — reset everything
                game.fullReset();
                try {
                    const parsed = JSON.parse(playersParam);
                    if (Array.isArray(parsed) && parsed.length === 4) {
                        urlPlayers = parsed;
                        urlSessionId = urlSid;
                        randomAssign();
                    }
                } catch {}
            }
        } else if (loaded) {
            // No URL params — restore from localStorage
            started = true;
        }

        return () => {
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
        };
    });

    function randomAssign() {
        const shuffled = [...urlPlayers].sort(() => Math.random() - 0.5);
        teamA = [shuffled[0], shuffled[1]];
        teamB = [shuffled[2], shuffled[3]];
        unassigned = [];
    }

    function resetManual() {
        teamA = [];
        teamB = [];
        unassigned = [...urlPlayers];
    }

    function switchToRandom() {
        assignMode = 'random';
        randomAssign();
    }

    function switchToManual() {
        assignMode = 'manual';
        resetManual();
    }

    function startWithTeams() {
        if (!teamAssignReady) return;
        if (urlSessionId) game.sessionId = urlSessionId;
        game.teamAName = teamA.map(p => p.name).join(', ');
        game.teamBName = teamB.map(p => p.name).join(', ');
        game.playerNames = [teamA[0].name, teamA[1].name, teamB[0].name, teamB[1].name] as [string, string, string, string];
        game.playerData = [
            { id: teamA[0].id, name: teamA[0].name, team: 'A' as const },
            { id: teamA[1].id, name: teamA[1].name, team: 'A' as const },
            { id: teamB[0].id, name: teamB[0].name, team: 'B' as const },
            { id: teamB[1].id, name: teamB[1].name, team: 'B' as const },
        ];
        started = true;
        game.save();
    }

    function startNewGame() {
        started = true;
        game.save();
    }

    function handleNewGame() {
        // Restore team composition from playerData before resetting
        const pData = game.playerData;
        if (pData.length === 4) {
            teamA = pData.filter(p => p.team === 'A').map(p => ({ id: p.id, name: p.name }));
            teamB = pData.filter(p => p.team === 'B').map(p => ({ id: p.id, name: p.name }));
            unassigned = [];
            urlPlayers = pData.map(p => ({ id: p.id, name: p.name }));
            if (!urlSessionId) urlSessionId = -1;
        }
        game.resetGame();
        started = false;
    }

    function handleCardScoreInput(e: Event) {
        const v = parseInt((e.target as HTMLInputElement).value);
        if (!isNaN(v)) game.cardScoreA = v;
    }

    // Inline edit helpers
    let editingTeam: 'A' | 'B' | null = $state(null);

    function startEditTeam(team: 'A' | 'B') { editingTeam = team; }
    function finishEditTeam() { editingTeam = null; game.save(); }

    // Touch drag and drop
    function handleTouchStart(e: TouchEvent, player: { id: number; name: string }, source: 'unassigned' | 'teamA' | 'teamB') {
        e.preventDefault();
        dragItem = player;
        dragSource = source;

        const touch = e.touches[0];
        const target = e.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();

        dragClone = target.cloneNode(true) as HTMLElement;
        dragClone.style.position = 'fixed';
        dragClone.style.left = `${rect.left}px`;
        dragClone.style.top = `${rect.top}px`;
        dragClone.style.width = `${rect.width}px`;
        dragClone.style.zIndex = '999';
        dragClone.style.opacity = '0.85';
        dragClone.style.pointerEvents = 'none';
        dragClone.style.transform = 'scale(1.05)';
        dragClone.style.transition = 'none';
        document.body.appendChild(dragClone);
    }

    function handleTouchMove(e: TouchEvent) {
        if (!dragClone) return;
        e.preventDefault();
        const touch = e.touches[0];
        dragClone.style.left = `${touch.clientX - dragClone.offsetWidth / 2}px`;
        dragClone.style.top = `${touch.clientY - dragClone.offsetHeight / 2}px`;

        // Detect drop zone
        const zones = document.querySelectorAll('[data-dropzone]');
        let found: string | null = null;
        zones.forEach(zone => {
            const rect = zone.getBoundingClientRect();
            if (touch.clientX >= rect.left && touch.clientX <= rect.right &&
                touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
                found = zone.getAttribute('data-dropzone');
            }
        });
        highlightZone = found as typeof highlightZone;
    }

    function handleTouchEnd() {
        if (!dragItem || !dragSource) {
            cleanup();
            return;
        }

        const target = highlightZone;
        if (target && target !== dragSource) {
            // Remove from source
            if (dragSource === 'unassigned') unassigned = unassigned.filter(p => p.id !== dragItem!.id);
            else if (dragSource === 'teamA') teamA = teamA.filter(p => p.id !== dragItem!.id);
            else if (dragSource === 'teamB') teamB = teamB.filter(p => p.id !== dragItem!.id);

            // Add to target (respect max 2 for teams)
            if (target === 'unassigned') {
                unassigned = [...unassigned, dragItem];
            } else if (target === 'teamA' && teamA.length < 2) {
                teamA = [...teamA, dragItem];
            } else if (target === 'teamB' && teamB.length < 2) {
                teamB = [...teamB, dragItem];
            } else {
                // Bounce back to source
                if (dragSource === 'unassigned') unassigned = [...unassigned, dragItem];
                else if (dragSource === 'teamA') teamA = [...teamA, dragItem];
                else if (dragSource === 'teamB') teamB = [...teamB, dragItem];
            }
        }

        cleanup();
    }

    function cleanup() {
        if (dragClone) {
            dragClone.remove();
            dragClone = null;
        }
        dragItem = null;
        dragSource = null;
        highlightZone = null;
    }
</script>

<svelte:window ontouchmove={handleTouchMove} ontouchend={handleTouchEnd} />

<div class="page-bg"></div>

<div class="tichu-container">
    {#if !started}
        <!-- Start Screen -->
        <div class="start-screen">
            <h1 class="start-title">티츄 점수판</h1>

            {#if hasUrlParams}
                <!-- Team Assignment Mode -->
                <div class="start-card">
                    <div class="assign-mode-toggle">
                        <button class="mode-btn" class:active={assignMode === 'random'} onclick={switchToRandom}>랜덤 배정</button>
                        <button class="mode-btn" class:active={assignMode === 'manual'} onclick={switchToManual}>수동 배정</button>
                    </div>

                    {#if assignMode === 'random'}
                        <div class="team-columns">
                            <div class="team-col team-col-a">
                                <span class="team-col-label">Team A</span>
                                {#each teamA as p}
                                    <div class="player-chip chip-a">{p.name}</div>
                                {/each}
                            </div>
                            <div class="team-col team-col-b">
                                <span class="team-col-label">Team B</span>
                                {#each teamB as p}
                                    <div class="player-chip chip-b">{p.name}</div>
                                {/each}
                            </div>
                        </div>
                        <button class="shuffle-btn" onclick={randomAssign}>
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
                            다시 섞기
                        </button>
                    {:else}
                        <!-- Manual: drag and drop -->
                        {#if unassigned.length > 0}
                            <div class="drop-zone" class:highlight={highlightZone === 'unassigned'} data-dropzone="unassigned">
                                <span class="drop-zone-label">미배정</span>
                                <div class="drop-zone-items">
                                    {#each unassigned as p}
                                        <div class="player-chip draggable"
                                            role="button"
                                            tabindex="0"
                                            onkeydown={(e) => e.key === 'Enter' && handleTouchStart(null as any, p, 'unassigned')}
                                            ontouchstart={(e) => handleTouchStart(e, p, 'unassigned')}>{p.name}</div>
                                    {/each}
                                </div>
                            </div>
                        {/if}
                        <div class="team-columns">
                            <div class="team-col team-col-a drop-zone" class:highlight={highlightZone === 'teamA'} data-dropzone="teamA">
                                <span class="team-col-label">Team A</span>
                                <div class="drop-zone-items">
                                    {#each teamA as p}
                                        <div class="player-chip chip-a draggable"
                                            role="button"
                                            tabindex="0"
                                            onkeydown={(e) => e.key === 'Enter' && handleTouchStart(null as any, p, 'teamA')}
                                            ontouchstart={(e) => handleTouchStart(e, p, 'teamA')}>{p.name}</div>
                                    {/each}
                                    {#if teamA.length < 2}
                                        <div class="player-chip-empty">드래그하여 추가</div>
                                    {/if}
                                </div>
                            </div>
                            <div class="team-col team-col-b drop-zone" class:highlight={highlightZone === 'teamB'} data-dropzone="teamB">
                                <span class="team-col-label">Team B</span>
                                <div class="drop-zone-items">
                                    {#each teamB as p}
                                        <div class="player-chip chip-b draggable"
                                            role="button"
                                            tabindex="0"
                                            onkeydown={(e) => e.key === 'Enter' && handleTouchStart(null as any, p, 'teamB')}
                                            ontouchstart={(e) => handleTouchStart(e, p, 'teamB')}>{p.name}</div>
                                    {/each}
                                    {#if teamB.length < 2}
                                        <div class="player-chip-empty">드래그하여 추가</div>
                                    {/if}
                                </div>
                            </div>
                        </div>
                    {/if}

                    <div class="input-label" style="margin-top: 1rem;">목표 점수</div>
                    <div class="target-input-row">
                        {#each [500, 700, 1000] as t}
                            <button class="target-option" class:selected={game.targetScore === t}
                                onclick={() => game.targetScore = t}>{t}</button>
                        {/each}
                    </div>
                    <button class="start-btn" onclick={startWithTeams} disabled={!teamAssignReady}>시작</button>
                </div>
            {:else}
                <!-- Standard start screen (no URL params) -->
                <div class="start-card">
                    <div class="input-label">목표 점수</div>
                    <div class="target-input-row">
                        {#each [500, 700, 1000] as t}
                            <button class="target-option" class:selected={game.targetScore === t}
                                onclick={() => game.targetScore = t}>{t}</button>
                        {/each}
                    </div>
                    <button class="start-btn" onclick={startNewGame}>시작</button>
                </div>
            {/if}
            <button class="back-link" onclick={() => history.back()}>돌아가기</button>
        </div>
    {:else}
        <!-- Game Screen: flex column, full height -->
        <div class="game-screen">
            <!-- Header -->
            <header class="app-header">
                <button class="icon-btn" onclick={() => history.back()} aria-label="뒤로 가기">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
                <h1>티츄 점수판</h1>
                <button class="icon-btn" onclick={() => game.showConfirmReset = true} aria-label="초기화">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                </button>
            </header>

            <!-- Scoreboard -->
            <section class="scoreboard">
                <div class="team team-a">
                    {#if editingTeam === 'A'}
                        <input class="team-name-input" type="text" bind:value={game.teamAName}
                            onblur={finishEditTeam} onkeydown={(e) => e.key === 'Enter' && finishEditTeam()} 
                            use:focusOnMount />
                    {:else}
                        <button class="team-name" onclick={() => startEditTeam('A')}>{game.teamAName}</button>
                    {/if}
                    <div class="team-score">{game.runningTotalA}</div>
                    <div class="progress-bar">
                        <div class="progress-fill team-a-fill" style="width: {Math.min(game.progressA * 100, 100)}%"></div>
                    </div>
                </div>
                <div class="score-divider">
                    <span class="target-label">{game.targetScore}</span>
                </div>
                <div class="team team-b">
                    {#if editingTeam === 'B'}
                        <input class="team-name-input" type="text" bind:value={game.teamBName}
                            onblur={finishEditTeam} onkeydown={(e) => e.key === 'Enter' && finishEditTeam()} 
                            use:focusOnMount />
                    {:else}
                        <button class="team-name" onclick={() => startEditTeam('B')}>{game.teamBName}</button>
                    {/if}
                    <div class="team-score">{game.runningTotalB}</div>
                    <div class="progress-bar">
                        <div class="progress-fill team-b-fill" style="width: {Math.min(game.progressB * 100, 100)}%"></div>
                    </div>
                </div>
            </section>

            <!-- Round History (scrollable middle area) -->
            <section class="history">
                {#if game.rounds.length > 0}
                    <div class="history-header">
                        <h2 class="section-title">라운드 기록</h2>
                    </div>

                    <div class="rounds-list">
                        {#each game.rounds as round}
                            <div class="round-row">
                                <span class="round-num">R{round.roundNumber}</span>
                                <span class="round-scores">
                                    <span class="rs-a">{round.totalScoreA > 0 ? '+' : ''}{round.totalScoreA}</span>
                                    <span class="rs-sep">/</span>
                                    <span class="rs-b">{round.totalScoreB > 0 ? '+' : ''}{round.totalScoreB}</span>
                                </span>
                            </div>
                        {/each}
                    </div>
                {:else}
                    <div class="empty-history">
                        <span class="empty-history-text">라운드를 기록하면 여기에 표시됩니다</span>
                    </div>
                {/if}
            </section>

            <!-- Round Input (fixed bottom) -->
            <section class="round-input">
                <div class="input-header">
                    <!-- Preview -->
                    <div class="inline-preview">
                        <span class="preview-a">{game.previewScore.totalA > 0 ? '+' : ''}{game.previewScore.totalA}{#if game.bonusA !== 0}<span class="preview-detail">({game.bonusA > 0 ? '+' : ''}{game.bonusA})</span>{/if}</span>
                        <span class="preview-sep">/</span>
                        <span class="preview-b">{game.previewScore.totalB > 0 ? '+' : ''}{game.previewScore.totalB}{#if game.bonusB !== 0}<span class="preview-detail">({game.bonusB > 0 ? '+' : ''}{game.bonusB})</span>{/if}</span>
                    </div>
                </div>

                <!-- Card Score -->
                <div class="compact-row">
                    <button class="adj-btn" onclick={() => game.cardScoreA = game.cardScoreA - 5} disabled={game.oneTwoA || game.oneTwoB}>-5</button>
                    <input type="range" class="score-slider" min="-25" max="125" step="5"
                        value={game.cardScoreA} oninput={handleCardScoreInput}
                        disabled={game.oneTwoA || game.oneTwoB} />
                    <button class="adj-btn" onclick={() => game.cardScoreA = game.cardScoreA + 5} disabled={game.oneTwoA || game.oneTwoB}>+5</button>
                </div>

                <!-- One-Two + Bonus row -->
                <div class="controls-grid">
                    <button class="ctrl-btn" class:active={game.oneTwoA} onclick={() => game.setOneTwo('A')}>
                        {game.teamAName} 원투
                    </button>
                    <button class="ctrl-btn team-b-ctrl" class:active={game.oneTwoB} onclick={() => game.setOneTwo('B')}>
                        {game.teamBName} 원투
                    </button>
                </div>

                <div class="controls-grid">
                    <div class="bonus-cell">
                        <div class="bonus-btns">
                            <button class="bonus-btn" onclick={() => game.addBonus('A', 100)}>+100</button>
                            <button class="bonus-btn negative" onclick={() => game.addBonus('A', -100)}>-100</button>
                        </div>
                    </div>
                    <div class="bonus-cell">
                        <div class="bonus-btns">
                            <button class="bonus-btn" onclick={() => game.addBonus('B', 100)}>+100</button>
                            <button class="bonus-btn negative" onclick={() => game.addBonus('B', -100)}>-100</button>
                        </div>
                    </div>
                </div>

                <button class="submit-btn" onclick={() => game.submitRound()} disabled={game.gameOver}>
                    라운드 기록
                </button>
            </section>
        </div>
    {/if}
</div>

<!-- Confirm Reset -->
{#if game.showConfirmReset}
    <div class="modal-overlay">
        <div class="modal-card confirm-card">
            <p>현재 게임을 초기화하고 새 게임을 시작하시겠습니까?</p>
            <div class="confirm-actions">
                <button class="btn-danger" onclick={handleNewGame}>초기화</button>
                <button class="btn-close" onclick={() => game.showConfirmReset = false}>취소</button>
            </div>
        </div>
    </div>
{/if}

<!-- Win Overlay -->
{#if game.gameOver && game.winner}
    <div class="modal-overlay win-overlay">
        <div class="win-card" class:win-a={game.winner === 'A'} class:win-b={game.winner === 'B'}>
            <div class="win-icon-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
                </svg>
            </div>
            <h2>{game.winner === 'A' ? game.teamAName : game.teamBName} 승리!</h2>
            <div class="win-scores">
                <div class="win-score-item">
                    <span>{game.teamAName}</span>
                    <strong>{game.runningTotalA}</strong>
                </div>
                <div class="win-score-item">
                    <span>{game.teamBName}</span>
                    <strong>{game.runningTotalB}</strong>
                </div>
            </div>
            <p class="win-rounds">{game.rounds.length}라운드</p>
            <div class="win-actions">
                <button class="btn-new-game" onclick={handleNewGame}>새 게임</button>
                <button class="btn-dismiss" onclick={() => game.dismissWin()}>기록 보기</button>
            </div>
        </div>
    </div>
{/if}

<style>
    .page-bg {
        position: fixed;
        inset: 0;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
        z-index: -1;
    }

    .tichu-container {
        max-width: 480px;
        margin: 0 auto;
        padding: env(safe-area-inset-top) 1rem env(safe-area-inset-bottom);
        color: #e2e8f0;
        height: 100dvh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    /* Game Screen: flex column, full height */
    .game-screen {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        overflow: hidden;
    }

    /* Header */
    .app-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.6rem 0;
        flex-shrink: 0;
    }
    .app-header h1 {
        font-size: 1.1rem;
        font-weight: 700;
        margin: 0;
    }
    .icon-btn {
        width: 36px;
        height: 36px;
        border: none;
        background: rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        color: #e2e8f0;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 0.2s;
    }
    .icon-btn:active { background: rgba(255, 255, 255, 0.15); }
    .icon-btn svg { width: 18px; height: 18px; }

    /* Scoreboard */
    .scoreboard {
        display: flex;
        align-items: stretch;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 16px;
        padding: 0.8rem;
        border: 1px solid rgba(255, 255, 255, 0.08);
        flex-shrink: 0;
    }
    .team {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.2rem;
    }
    .team-name {
        background: none;
        border: none;
        color: #94a3b8;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
        padding: 0.15rem 0.4rem;
        border-radius: 6px;
        transition: background 0.2s;
    }
    .team-name:active { background: rgba(255, 255, 255, 0.08); }
    .team-name-input {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #e2e8f0;
        font-size: 0.8rem;
        font-weight: 600;
        text-align: center;
        padding: 0.15rem 0.4rem;
        border-radius: 6px;
        width: 80%;
        outline: none;
    }
    .team-score {
        font-size: 2rem;
        font-weight: 800;
        letter-spacing: -1px;
    }
    .team-a .team-score { color: #60a5fa; }
    .team-b .team-score { color: #f87171; }
    .progress-bar {
        width: 100%;
        height: 3px;
        background: rgba(255, 255, 255, 0.08);
        border-radius: 2px;
        overflow: hidden;
    }
    .progress-fill {
        height: 100%;
        border-radius: 2px;
        transition: width 0.4s ease;
    }
    .team-a-fill { background: #60a5fa; }
    .team-b-fill { background: #f87171; }
    .score-divider {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 0.6rem;
    }
    .target-label {
        font-size: 0.65rem;
        color: #64748b;
        writing-mode: vertical-rl;
        letter-spacing: 1px;
    }

    /* Section Titles */
    .section-title {
        font-size: 0.8rem;
        font-weight: 700;
        color: #94a3b8;
        margin: 0;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    /* History - scrollable middle */
    .history {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        margin: 0.6rem 0;
        padding: 0.6rem;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.06);
    }
    .history-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.4rem;
    }
    .empty-history {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        min-height: 40px;
    }
    .empty-history-text {
        font-size: 0.8rem;
        color: #475569;
    }
    .rounds-list {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0 0.4rem;
    }
    .round-row {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.4rem 0.3rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        background: none;
        border-left: none;
        border-right: none;
        border-top: none;
        color: #e2e8f0;
        cursor: pointer;
        text-align: left;
        transition: background 0.15s;
    }
    .round-row:active { background: rgba(255, 255, 255, 0.05); }
    .round-num {
        font-size: 0.7rem;
        font-weight: 700;
        color: #64748b;
        min-width: 24px;
    }
    .round-scores {
        flex: 1;
        font-weight: 700;
        font-size: 0.85rem;
    }
    .rs-a { color: #60a5fa; }
    .rs-sep { color: #475569; margin: 0 0.1rem; }
    .rs-b { color: #f87171; }

    /* Round Input - fixed bottom */
    .round-input {
        flex-shrink: 0;
        background: rgba(255, 255, 255, 0.06);
        border-radius: 16px;
        padding: 0.7rem 0.8rem;
        margin-bottom: 1rem;
        border: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .input-header {
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .inline-preview {
        font-weight: 800;
        font-size: 0.95rem;
    }
    .inline-preview .preview-a { color: #60a5fa; }
    .inline-preview .preview-sep { color: #475569; margin: 0 0.2rem; }
    .inline-preview .preview-b { color: #f87171; }
    .preview-detail {
        font-size: 0.7rem;
        font-weight: 600;
        opacity: 0.7;
        margin-left: 0.15rem;
    }

    /* Card Score - compact */
    .compact-row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.6rem;
    }
    .adj-btn {
        width: 40px;
        height: 32px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(255, 255, 255, 0.06);
        color: #e2e8f0;
        border-radius: 8px;
        font-weight: 700;
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.15s;
    }
    .adj-btn:active:not(:disabled) { background: rgba(255, 255, 255, 0.15); transform: scale(0.95); }
    .adj-btn:disabled { opacity: 0.3; cursor: default; }
    .score-slider {
        flex: 1;
        accent-color: #60a5fa;
        height: 4px;
        margin: 0;
        min-width: 0;
    }
    .score-slider:disabled { opacity: 0.3; }

    /* Controls Grid - One-Two & Bonus */
    .controls-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.4rem;
    }
    .ctrl-btn {
        padding: 0.45rem;
        border: 1px solid rgba(96, 165, 250, 0.2);
        background: rgba(96, 165, 250, 0.06);
        color: #94a3b8;
        border-radius: 10px;
        font-weight: 600;
        font-size: 0.8rem;
        cursor: pointer;
        transition: all 0.2s;
        text-align: center;
    }
    .ctrl-btn.active {
        background: rgba(96, 165, 250, 0.2);
        border-color: #60a5fa;
        color: #60a5fa;
    }
    .ctrl-btn.team-b-ctrl {
        border-color: rgba(248, 113, 113, 0.2);
        background: rgba(248, 113, 113, 0.06);
    }
    .ctrl-btn.team-b-ctrl.active {
        background: rgba(248, 113, 113, 0.2);
        border-color: #f87171;
        color: #f87171;
    }

    /* Bonus */
    .bonus-cell {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
    }
    .bonus-btns {
        display: flex;
        gap: 0.3rem;
    }
    .bonus-btn {
        padding: 0.5rem 0.9rem;
        border: 1px solid rgba(34, 197, 94, 0.3);
        background: rgba(34, 197, 94, 0.1);
        color: #22c55e;
        border-radius: 8px;
        font-weight: 700;
        font-size: 0.9rem;
        cursor: pointer;
        transition: all 0.15s;
    }
    .bonus-btn:active { transform: scale(0.95); }
    .bonus-btn.negative {
        border-color: rgba(239, 68, 68, 0.3);
        background: rgba(239, 68, 68, 0.1);
        color: #ef4444;
    }

    /* Submit */
    .submit-btn {
        width: 100%;
        padding: 0.7rem;
        background: linear-gradient(135deg, #3b82f6, #2563eb);
        color: white;
        border: none;
        border-radius: 12px;
        font-size: 0.95rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    }
    .submit-btn:active:not(:disabled) { transform: scale(0.98); }
    .submit-btn:disabled { opacity: 0.4; cursor: default; }

    /* Start Screen */
    .start-screen {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        flex: 1;
        gap: 1.5rem;
    }
    .start-title {
        font-size: 1.8rem;
        font-weight: 800;
        margin: 0;
    }
    .start-card {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 20px;
        padding: 1.5rem;
        width: 100%;
        max-width: 360px;
    }
    .input-label {
        display: block;
        font-size: 0.8rem;
        color: #94a3b8;
        font-weight: 600;
        margin-bottom: 0.5rem;
    }
    .target-input-row {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.4rem;
        margin-bottom: 1.2rem;
    }
    .target-option {
        padding: 0.5rem;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.05);
        color: #94a3b8;
        border-radius: 10px;
        font-weight: 600;
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.15s;
    }
    .target-option.selected {
        background: rgba(59, 130, 246, 0.2);
        border-color: #3b82f6;
        color: #60a5fa;
    }
    .start-btn {
        width: 100%;
        padding: 0.9rem;
        background: linear-gradient(135deg, #3b82f6, #2563eb);
        color: white;
        border: none;
        border-radius: 14px;
        font-size: 1rem;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
        transition: all 0.2s;
    }
    .start-btn:active:not(:disabled) { transform: scale(0.98); }
    .start-btn:disabled { opacity: 0.4; cursor: default; }

    /* Team Assignment */
    .assign-mode-toggle {
        display: flex;
        gap: 0.4rem;
        margin-bottom: 1rem;
    }
    .mode-btn {
        flex: 1;
        padding: 0.5rem;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.05);
        color: #94a3b8;
        border-radius: 10px;
        font-weight: 600;
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.15s;
    }
    .mode-btn.active {
        background: rgba(59, 130, 246, 0.2);
        border-color: #3b82f6;
        color: #60a5fa;
    }
    .team-columns {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        margin-bottom: 0.8rem;
    }
    .team-col {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.4rem;
        padding: 0.6rem 0.3rem;
        border-radius: 12px;
        min-height: 90px;
    }
    .team-col-label {
        font-size: 0.7rem;
        font-weight: 700;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 0.2rem;
    }
    .player-chip {
        padding: 0.45rem 0.8rem;
        border-radius: 10px;
        font-weight: 600;
        font-size: 0.85rem;
        background: rgba(255, 255, 255, 0.08);
        color: #e2e8f0;
        border: 1px solid rgba(255, 255, 255, 0.1);
        text-align: center;
        width: 100%;
        box-sizing: border-box;
    }
    .player-chip.chip-a {
        background: rgba(96, 165, 250, 0.12);
        border-color: rgba(96, 165, 250, 0.25);
        color: #93bbfc;
    }
    .player-chip.chip-b {
        background: rgba(248, 113, 113, 0.12);
        border-color: rgba(248, 113, 113, 0.25);
        color: #fca5a5;
    }
    .player-chip.draggable {
        cursor: grab;
        touch-action: none;
        user-select: none;
    }
    .player-chip-empty {
        padding: 0.45rem 0.8rem;
        border-radius: 10px;
        font-size: 0.75rem;
        color: #475569;
        border: 1px dashed rgba(255, 255, 255, 0.1);
        text-align: center;
        width: 100%;
        box-sizing: border-box;
    }
    .shuffle-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.3rem;
        padding: 0.5rem;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #94a3b8;
        border-radius: 10px;
        font-weight: 600;
        font-size: 0.85rem;
        cursor: pointer;
        margin-bottom: 0.8rem;
        width: 100%;
    }
    .shuffle-btn:active { background: rgba(255, 255, 255, 0.12); }
    .drop-zone {
        border: 2px solid transparent;
        border-radius: 14px;
        transition: border-color 0.15s, background 0.15s;
    }
    .drop-zone.highlight {
        border-color: rgba(59, 130, 246, 0.5);
        background: rgba(59, 130, 246, 0.05);
    }
    .drop-zone-label {
        display: block;
        font-size: 0.7rem;
        font-weight: 700;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 0.3rem;
        text-align: center;
    }
    .drop-zone-items {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        justify-content: center;
        padding: 0.3rem;
    }
    .drop-zone > .drop-zone-label {
        margin-top: 0.3rem;
    }
    .back-link {
        background: none;
        border: none;
        color: #64748b;
        font-size: 0.9rem;
        cursor: pointer;
    }

    /* Modals */
    .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 50;
        padding: 1rem;
    }
    .modal-card {
        background: #1e293b;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 24px;
        padding: 1.5rem;
        width: 100%;
        max-width: 400px;
        color: #e2e8f0;
    }
    .confirm-card {
        text-align: center;
    }
    .confirm-card p {
        margin: 0 0 1.2rem;
        line-height: 1.5;
    }
    .confirm-actions {
        display: flex;
        gap: 0.6rem;
    }
    .btn-danger {
        flex: 1;
        padding: 0.7rem;
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.3);
        color: #f87171;
        border-radius: 12px;
        font-weight: 600;
        cursor: pointer;
    }
    .btn-danger:active { background: rgba(239, 68, 68, 0.25); }
    .btn-close {
        flex: 1;
        padding: 0.7rem;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #94a3b8;
        border-radius: 12px;
        font-weight: 600;
        cursor: pointer;
    }

    /* Win Overlay */
    .win-overlay { z-index: 100; }
    .win-card {
        background: #1e293b;
        border-radius: 28px;
        padding: 2rem 1.5rem;
        text-align: center;
        width: 90%;
        max-width: 360px;
        animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        border: 2px solid rgba(96, 165, 250, 0.3);
    }
    .win-card.win-b { border-color: rgba(248, 113, 113, 0.3); }
    .win-icon-wrap {
        width: 72px;
        height: 72px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 1rem;
        color: white;
    }
    .win-a .win-icon-wrap {
        background: linear-gradient(135deg, #3b82f6, #60a5fa);
        box-shadow: 0 8px 24px rgba(59, 130, 246, 0.4);
    }
    .win-b .win-icon-wrap {
        background: linear-gradient(135deg, #ef4444, #f87171);
        box-shadow: 0 8px 24px rgba(239, 68, 68, 0.4);
    }
    .win-icon-wrap svg { width: 36px; height: 36px; }
    .win-card h2 {
        font-size: 1.6rem;
        font-weight: 800;
        margin: 0 0 1rem;
        color: #e2e8f0;
    }
    .win-scores {
        display: flex;
        justify-content: center;
        gap: 2rem;
        margin-bottom: 0.5rem;
    }
    .win-score-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.2rem;
    }
    .win-score-item span { font-size: 0.8rem; color: #94a3b8; }
    .win-score-item strong { font-size: 1.5rem; font-weight: 800; color: #e2e8f0; }
    .win-rounds {
        font-size: 0.8rem;
        color: #64748b;
        margin: 0.5rem 0 1.2rem;
    }
    .win-actions {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
    }
    .btn-new-game {
        padding: 0.8rem;
        background: linear-gradient(135deg, #3b82f6, #2563eb);
        color: white;
        border: none;
        border-radius: 14px;
        font-size: 1rem;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
    }
    .btn-new-game:active { transform: scale(0.98); }
    .btn-dismiss {
        padding: 0.5rem;
        background: none;
        border: none;
        color: #64748b;
        font-size: 0.9rem;
        cursor: pointer;
    }

    @keyframes popIn {
        from { transform: scale(0.8); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
    }
</style>

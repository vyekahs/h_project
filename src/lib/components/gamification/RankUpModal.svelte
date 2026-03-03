<script lang="ts">
    import { rankUpStore } from '$lib/stores/rankUpStore.svelte';
    import { flip } from 'svelte/animate';
    import { quintOut } from 'svelte/easing';

    let isVisible = $derived(rankUpStore.isVisible);
    let previousRank = $derived(rankUpStore.previousRank);
    let currentRank = $derived(rankUpStore.currentRank);
    let gameId = $derived(rankUpStore.gameId);
    let calculatedScore = $derived(rankUpStore.calculatedScore);

    const GAME_THEMES: Record<string, { title: string, color: string }> = {
        'sudoku': { title: '스도쿠', color: '#60a5fa' },
        'killer-sudoku': { title: '킬러 스도쿠', color: '#facc15' },
        'unblock-me': { title: '언블록 미', color: '#f87171' },
        'tichu': { title: '티츄', color: '#22c55e' },
        'energy': { title: '에너지 연결', color: '#f59e0b' },
        'water-sort': { title: '워터 소트 퍼즐', color: '#6366f1' }
    };

    let gameTitle = $derived(GAME_THEMES[gameId]?.title || '미니게임');
    let themeColor = $derived(GAME_THEMES[gameId]?.color || '#6366f1');

    // Visual animation states
    let showModal = $state(false);
    let startAnimation = $state(false);
    let loading = $state(false);
    let animationComplete = $state(false);

    let displayRows = $state<any[]>([]);
    let viewStart = $state(1);

    // Dynamic scroll tracking for the animated list
    let rowHeight = 58; // approx row height + gap
    let listContainerHeight = 220;
    let userIndex = $derived(displayRows.findIndex(x => x.isUser));
    let totalHeight = $derived(displayRows.length * rowHeight + 20); // padding
    let maxScroll = $derived(Math.max(0, totalHeight - listContainerHeight));
    let rawOffset = $derived((userIndex * rowHeight) - (listContainerHeight / 2) + (rowHeight / 2) + 10);
    let yOffset = $derived(Math.max(0, Math.min(rawOffset, maxScroll)));

    let intervalId: any = null;

    $effect(() => {
        if (isVisible) {
            setupAnimation();
        } else {
            showModal = false;
            startAnimation = false;
            animationComplete = false;
            displayRows = [];
            if (intervalId) clearInterval(intervalId);
        }
    });

    async function setupAnimation() {
        if (!previousRank || !currentRank || previousRank <= currentRank) {
            // Unlikely to happen, but fallback
            showModal = true;
            return;
        }

        showModal = true;
        loading = true;
        
        let rankings: any[] = [];
        try {
            const res = await fetch(`/api/ranking/${gameId}`);
            if (res.ok) {
                rankings = await res.json();
            }
        } catch(e) {}
        
        loading = false;
        setTimeout(() => { startAnimation = true; }, 50);

        // We want to show relative ranks
        // Expand the viewing area by extra 2 slots top and bottom if available
        viewStart = Math.max(1, currentRank - 2);
        const viewEnd = previousRank + 1;
        
        let finalOrder = [];
        for (let r = viewStart; r <= viewEnd; r++) {
            const rowData = rankings.find(x => Number(x.rank) === r);
            const isUser = r === currentRank;
            finalOrder.push({
                id: isUser ? 'user-row' : `row-${r}-${rowData?.nickname || 'empty'}`,
                isUser,
                nickname: rowData ? rowData.nickname : '---',
                score: rowData ? rowData.score : 0,
                gapToNext: 0,
            });
        }
        
        // Calculate point gap to the person above them
        for (let i = 1; i < finalOrder.length; i++) {
            if (finalOrder[i].score > 0 && finalOrder[i-1].score > 0) {
                finalOrder[i].gapToNext = finalOrder[i-1].score - finalOrder[i].score;
            } else {
                finalOrder[i].gapToNext = 0;
            }
        }

        // To create initial state, move User to previousRank position
        let initialOrder = [...finalOrder];
        const uiIndex = initialOrder.findIndex(x => x.isUser);
        if (uiIndex !== -1) {
            const userItem = initialOrder.splice(uiIndex, 1)[0];
            const targetIndex = previousRank - viewStart;
            // Pad if necessary so the index is valid
            while(initialOrder.length < targetIndex) {
                 initialOrder.push({ id: `pad-${initialOrder.length}`, isUser: false, nickname: '---', score: 0, gapToNext: 0 });
            }
            initialOrder.splice(targetIndex, 0, userItem);
        }

        displayRows = initialOrder;

        // Sequence animation: Swap User row up one by one
        setTimeout(() => {
            let currentStep = previousRank;
            
            const gap = previousRank - currentRank;
            // Constant smooth climbing speed
            const intervalTime = Math.max(200, Math.min(450, 1000 / (gap || 1)));

            intervalId = setInterval(() => {
                if (currentStep > currentRank) {
                    const idx = displayRows.findIndex(x => x.isUser);
                    if (idx > 0) {
                        displayRows = [...displayRows];
                        const temp = displayRows[idx];
                        displayRows[idx] = displayRows[idx - 1];
                        displayRows[idx - 1] = temp;
                    }
                    currentStep--;
                } else {
                    clearInterval(intervalId);
                    setTimeout(() => {
                        animationComplete = true;
                    }, 400); // Wait for the final flip to settle
                }
            }, intervalTime);
        }, 1200); // 1.2s delay before climbing
    }

    function close() {
        rankUpStore.close();
        if (intervalId) clearInterval(intervalId);
    }
</script>

{#if showModal}
    <div class="rankup-overlay" class:active={startAnimation} on:click={close} style="--theme-color: {themeColor};">
        <div class="rankup-modal focus-zone" on:click|stopPropagation>
            <div class="header">
                <h2>RANK UP!</h2>
                <div class="game-name">{gameTitle}</div>
            </div>

            <div class="list-container">
                {#if loading}
                    <div class="loading">순위표 불러오는 중...</div>
                {:else}
                    <ul class="ranking-list" style="transform: translateY(-{yOffset}px);">
                        {#each displayRows as row, index (row.id)}
                            <li 
                                animate:flip={{ duration: 400, easing: quintOut }} 
                                class="list-row"
                                class:is-user={row.isUser} 
                                class:celebrate={row.isUser && animationComplete}
                            >
                                <div class="rank-badge">
                                    <span class="rank-num">{viewStart + index}</span>
                                </div>
                                <div class="row-info">
                                    <div class="row-text">
                                        <div class="name-line">
                                            <span class="nickname">{row.isUser ? '나' : (row.nickname || '익명')}</span>
                                            {#if row.isUser}
                                                <span class="user-badge">ME</span>
                                            {/if}
                                        </div>
                                        {#if row.gapToNext > 0 && (!row.isUser || animationComplete)}
                                            <div class="gap-text">앞 순위까지 {row.gapToNext}P</div>
                                        {/if}
                                    </div>
                                </div>
                                <span class="score">{row.score > 0 ? `${row.score}P` : '-'}</span>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </div>

            <div class="score-row">
                <span class="score-label">획득 점수</span>
                <span class="score-val">+{calculatedScore}점</span>
            </div>

            <button class="btn-awesome" on:click={close}>계속하기</button>
        </div>
    </div>
{/if}

<style>
    .rankup-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(255, 255, 255, 0.4);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.4s ease;
    }

    .rankup-overlay.active {
        opacity: 1;
    }

    .rankup-modal {
        background: rgba(255, 255, 255, 0.85);
        backdrop-filter: blur(30px);
        -webkit-backdrop-filter: blur(30px);
        border: 1px solid rgba(255, 255, 255, 0.9);
        box-shadow: 0 24px 48px rgba(0,0,0,0.08), inset 0 0 0 1px rgba(255,255,255,0.6);
        width: 90%;
        max-width: 400px;
        border-radius: 28px;
        padding: 40px 24px 30px;
        display: flex;
        flex-direction: column;
        align-items: center;
        transform: translateY(60px) scale(0.95);
        opacity: 0;
        position: relative;
    }

    .rankup-overlay.active .rankup-modal {
        transform: translateY(0) scale(1);
        opacity: 1;
        transition: transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease;
    }



    .header {
        text-align: center;
        margin-bottom: 24px;
    }

    .header h2 {
        margin: 0;
        font-size: 2.2rem;
        font-weight: 900;
        color: var(--theme-color);
        text-transform: uppercase;
        letter-spacing: 1px;
        text-shadow: 0 2px 4px rgba(255,255,255,0.8), 0 4px 12px color-mix(in srgb, var(--theme-color) 30%, transparent);
    }

    .game-name {
        font-size: 1rem;
        color: #475569;
        margin-top: 4px;
        font-weight: 700;
    }

    /* NEW ANIMATED LIST CSS */
    .list-container {
        width: 100%;
        height: 220px;
        overflow: hidden;
        position: relative;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.6);
        box-shadow: inset 0 2px 10px rgba(0,0,0,0.02);
        margin-bottom: 24px;
        mask-image: linear-gradient(to bottom, transparent, black 10%, black 90%, transparent);
        -webkit-mask-image: linear-gradient(to bottom, transparent, black 10%, black 90%, transparent);
    }
    .loading {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100%;
        color: #64748b;
        font-weight: 700;
    }
    .ranking-list {
        list-style: none;
        margin: 0;
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        transition: transform 500ms cubic-bezier(0.25, 1, 0.5, 1);
        will-change: transform;
    }
    .list-row {
        display: flex;
        align-items: center;
        background: rgba(255, 255, 255, 0.9);
        backdrop-filter: blur(10px);
        padding: 10px 16px;
        border-radius: 12px;
        box-shadow: 0 4px 10px rgba(0,0,0,0.02);
        border: 1px solid rgba(255, 255, 255, 1);
        height: 50px;
        box-sizing: border-box;
    }
    .list-row.is-user {
        background: rgba(255, 255, 255, 1);
        border: 2px solid var(--theme-color);
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1), inset 0 0 0 1px rgba(255,255,255,1);
        z-index: 10;
        position: relative;
        transform: scale(1.03);
    }
    
    /* TADA CELEBRATION ANIMATION */
    .list-row.celebrate {
        animation: tadaEffect 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    }

    @keyframes tadaEffect {
        0% { transform: scale(1.03) rotate(0deg); }
        20% { transform: scale(1.1) rotate(-3deg); box-shadow: 0 12px 30px rgba(0, 0, 0, 0.15); }
        40% { transform: scale(1.1) rotate(3deg); }
        60% { transform: scale(1.1) rotate(-3deg); }
        80% { transform: scale(1.1) rotate(3deg); }
        100% { transform: scale(1.05) rotate(0deg); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1); }
    }

    .list-row .rank-num {
        font-weight: 800;
        color: #64748b;
        width: 34px;
        display: inline-block;
        font-size: 1.1rem;
    }
    .list-row.is-user .rank-num {
        color: var(--theme-color);
    }
    .row-info {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 10px;
        margin-left: 8px;
        overflow: hidden;
    }
    
    .row-text {
        display: flex;
        flex-direction: column;
        justify-content: center;
    }
    
    .name-line {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    
    .gap-text {
        font-size: 0.75rem;
        color: #ef4444; /* red-500 */
        margin-top: 1px;
        font-weight: 600;
    }
    
    .list-row .nickname {
        font-weight: 600;
        color: #334155;
        font-size: 0.95rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 130px;
    }
    .list-row.is-user .nickname {
        color: var(--theme-color);
        font-weight: 800;
    }
    .user-badge {
        background: var(--theme-color);
        color: white;
        font-size: 0.6rem;
        font-weight: 800;
        padding: 2px 6px;
        border-radius: 4px;
        letter-spacing: 0.5px;
    }
    .list-row .score {
        font-weight: 700;
        color: #64748b;
        font-size: 0.9rem;
    }
    .list-row.is-user .score {
        color: var(--theme-color);
    }

    .score-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        padding: 14px 20px;
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid rgba(255,255,255,1);
        border-radius: 16px;
        margin-bottom: 24px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.02);
    }

    .score-label {
        font-weight: 800;
        color: #475569;
    }

    .score-val {
        font-weight: 900;
        color: var(--theme-color);
        font-size: 1.3rem;
        text-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .btn-awesome {
        width: 100%;
        padding: 18px;
        background: var(--theme-color);
        color: white;
        border: 1px solid rgba(255,255,255,0.4);
        border-radius: 20px;
        font-size: 1.1rem;
        font-weight: 900;
        text-transform: uppercase;
        cursor: pointer;
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15), inset 0 2px 4px rgba(255,255,255,0.3);
        transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.15s ease;
        text-shadow: 0 1px 2px rgba(0,0,0,0.1);
    }

    .btn-awesome:active {
        transform: translateY(4px);
        box-shadow: 0 0 0 rgba(0, 0, 0, 0.1), inset 0 2px 8px rgba(0,0,0,0.2);
    }
</style>

<script lang="ts">
    import { trapFocus } from '$lib/actions/modal';
    import { enhance } from '$app/forms';

    let { data } = $props();

    const playedCount = $derived(Object.keys(data.playedByGameId).length);
    const totalCount = $derived(data.games.length);

    // 많이 해본 게임이 먼저 보이게 정렬하고(안 해본 건 0회로 취급해 뒤로 밀림),
    // 같은 횟수면 이름순으로 묶는다.
    const sortedGames = $derived(
        [...data.games].sort((a, b) => {
            const playsA = data.playedByGameId[a.id]?.length ?? 0;
            const playsB = data.playedByGameId[b.id]?.length ?? 0;
            if (playsA !== playsB) return playsB - playsA;
            return a.name.localeCompare(b.name, 'ko');
        })
    );

    // 혼놀 보유 여부와 무관하게, 본인이 직접 소장 중이라고 체크한 게임.
    const ownedGameIds = $derived(new Set<number>(data.ownedGameIds));
    function isOwned(gameId: number) {
        return ownedGameIds.has(gameId);
    }

    let searchQuery = $state('');
    let showOwnedOnly = $state(false);
    const filteredGames = $derived(
        sortedGames.filter((g) => {
            if (showOwnedOnly && !isOwned(g.id)) return false;
            if (searchQuery.trim() && !g.name.toLowerCase().includes(searchQuery.trim().toLowerCase())) return false;
            return true;
        })
    );

    function formatDate(iso: string) {
        return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    }

    // 최애 게임 3순위 — 이미 플레이 횟수순으로 정렬된 sortedGames에서
    // 플레이한 것만 앞에서 3개 뽑으면 된다(별도 집계 불필요).
    const topGames3 = $derived(
        sortedGames.filter((g) => (data.playedByGameId[g.id]?.length ?? 0) > 0).slice(0, 3)
    );

    // 자주 만난 친구 3순위 — 판 수가 아니라 "함께한 날짜 수"로 센다.
    // 하루에 같은 사람과 여러 판 해도 1회로 — 짧은 게임 여러 판이 긴 게임 한 판을
    // 과대평가하지 않게 하기 위함이다.
    const topFriends3 = $derived(
        (() => {
            const daysByName: Record<string, Set<string>> = {};
            for (const play of data.allPlays) {
                if (!play.opponents || !play.endTime) continue;
                const date = new Date(play.endTime);
                if (Number.isNaN(date.getTime())) continue;
                const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                for (const opp of play.opponents) {
                    (daysByName[opp.name] ??= new Set<string>()).add(dayKey);
                }
            }
            return Object.entries(daysByName)
                .map(([name, days]) => [name, days.size] as [string, number])
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3);
        })()
    );

    // 카드를 누르면 페이지 이동 대신 모달로 바로 보여준다 — 장식장을
    // 훑어보다가 매번 마이페이지로 튕기면 훑어보는 흐름이 끊긴다.
    // id만 들고 있다가 game/plays를 매번 data에서 파생시켜야, 모달 안에서
    // 기록을 수정한 뒤(update()로 data가 새로고침된 뒤) 그 결과가 바로 반영된다.
    let selectedGameId: number | null = $state(null);
    const selectedGame = $derived(selectedGameId ? data.games.find((g: any) => g.id === selectedGameId) : null);
    const selectedGamePlays = $derived(selectedGameId ? (data.playedByGameId[selectedGameId] ?? []) : []);

    // 같은 게임을 오래 반복해서 플레이했으면 기록이 길어지므로 여러 기준으로 좁혀볼 수 있게 한다.
    let playYearFilter = $state('all');
    let playMonthFilter = $state('all');
    let playDayFilter = $state('all');
    let playOpponentQuery = $state('');
    let playWinOnly = $state(false);
    const playYears = $derived(
        [...new Set(selectedGamePlays.map((p: any) => new Date(p.endTime).getFullYear()))].sort((a: any, b: any) => b - a)
    );
    const filteredPlays = $derived(
        selectedGamePlays.filter((p: any) => {
            const d = new Date(p.endTime);
            if (playYearFilter !== 'all' && d.getFullYear().toString() !== playYearFilter) return false;
            if (playMonthFilter !== 'all' && (d.getMonth() + 1).toString() !== playMonthFilter) return false;
            if (playDayFilter !== 'all' && d.getDate().toString() !== playDayFilter) return false;
            if (playWinOnly && !p.isWinner) return false;
            if (playOpponentQuery.trim()) {
                const q = playOpponentQuery.trim().toLowerCase();
                if (!(p.opponents || []).some((o: any) => o.name.toLowerCase().includes(q))) return false;
            }
            return true;
        })
    );

    // 게임별 모달 필터는 컨트롤이 5개라 항상 펼쳐두면 정작 기록보다 필터가
    // 더 눈에 띈다. 기본은 접어두고, 몇 개가 걸려있는지만 버튼에 보여준다.
    let showModalFilters = $state(false);
    const modalActiveFilterCount = $derived(
        (playYearFilter !== 'all' ? 1 : 0) +
        (playMonthFilter !== 'all' ? 1 : 0) +
        (playDayFilter !== 'all' ? 1 : 0) +
        (playOpponentQuery.trim() ? 1 : 0) +
        (playWinOnly ? 1 : 0)
    );

    function openGameModal(game: any) {
        selectedGameId = game.id;
        playYearFilter = 'all';
        playMonthFilter = 'all';
        playDayFilter = 'all';
        playOpponentQuery = '';
        playWinOnly = false;
        showModalFilters = false;
    }
    function closeGameModal() {
        selectedGameId = null;
        // 진행 중이던 인라인 수정 상태가 안 지워지면, 이 세션이 "전체 기록"이나
        // 같은 게임을 다시 열었을 때 수정 폼이 그대로 열린 채로 재등장한다.
        editingSessionId = null;
        historyEditError = '';
        ownershipError = '';
    }

    // 게임 종료 시 승자/점수를 잘못 입력했을 때 이 모달 안에서 바로 고칠 수 있게 한다
    // (마이페이지로 보내지 않는다). 일주일이 지나면 수정 버튼을 숨기고,
    // 서버(editHistory 액션)에서도 같은 기준으로 다시 막는다.
    const HISTORY_EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
    function canEditPlay(play: any) {
        return Date.now() - new Date(play.endTime).getTime() <= HISTORY_EDIT_WINDOW_MS;
    }
    let editingSessionId: number | null = $state(null);
    let historyEditError = $state('');
    let ownershipError = $state('');
    function openPlayEdit(play: any) {
        historyEditError = '';
        editingSessionId = play.sessionId;
    }
    function closePlayEdit() {
        editingSessionId = null;
    }

    // 저장이 조용히 끝나버리면 "정말 반영됐나" 싶어진다 — 저장한 행에
    // 잠깐 확인 표시를 띄운다.
    let justSavedSessionId: number | null = $state(null);
    function flashSaved(sessionId: number) {
        justSavedSessionId = sessionId;
        setTimeout(() => {
            if (justSavedSessionId === sessionId) justSavedSessionId = null;
        }, 2000);
    }

    // "전체 기록" 보기 — 어떤 게임인지 기억 안 날 때 게임과 무관하게 시간순으로
    // 훑어야 하는 용도(마이페이지 활동기록 탭을 대체). 필터는 게임별 모달과
    // 별개로 둔다 — 두 화면이 동시에 열리진 않지만 상태가 섞이면 헷갈린다.
    let viewMode: 'byGame' | 'all' = $state('byGame');
    function switchView(mode: 'byGame' | 'all') {
        viewMode = mode;
        // editingSessionId는 두 화면이 playRow 스니펫을 공유해서 생기는 상태다 —
        // 전환할 때 안 지우면 다른 화면에서 편집 폼이 열린 채로 튀어나온다.
        editingSessionId = null;
        historyEditError = '';
    }
    let allYearFilter = $state('all');
    let allMonthFilter = $state('all');
    let allDayFilter = $state('all');
    let allOpponentQuery = $state('');
    let allGameQuery = $state('');
    let allWinOnly = $state(false);
    const allYears = $derived(
        [...new Set(data.allPlays.map((p: any) => new Date(p.endTime).getFullYear()))].sort((a: any, b: any) => b - a)
    );
    const filteredAllPlays = $derived(
        data.allPlays.filter((p: any) => {
            const d = new Date(p.endTime);
            if (allYearFilter !== 'all' && d.getFullYear().toString() !== allYearFilter) return false;
            if (allMonthFilter !== 'all' && (d.getMonth() + 1).toString() !== allMonthFilter) return false;
            if (allDayFilter !== 'all' && d.getDate().toString() !== allDayFilter) return false;
            if (allWinOnly && !p.isWinner) return false;
            if (allGameQuery.trim() && !p.gameName.toLowerCase().includes(allGameQuery.trim().toLowerCase())) return false;
            if (allOpponentQuery.trim()) {
                const q = allOpponentQuery.trim().toLowerCase();
                if (!(p.opponents || []).some((o: any) => o.name.toLowerCase().includes(q))) return false;
            }
            return true;
        })
    );

    let showAllFilters = $state(false);
    const allActiveFilterCount = $derived(
        (allYearFilter !== 'all' ? 1 : 0) +
        (allMonthFilter !== 'all' ? 1 : 0) +
        (allDayFilter !== 'all' ? 1 : 0) +
        (allGameQuery.trim() ? 1 : 0) +
        (allOpponentQuery.trim() ? 1 : 0) +
        (allWinOnly ? 1 : 0)
    );
</script>

<svelte:head>
    <title>보드게임 장식장 - 혼놀 라운지</title>
</svelte:head>

<!-- 게임별 모달과 전체 기록 목록이 같은 행 UI(표시/수정 폼)를 쓰므로 스니펫으로 공유한다 -->
{#snippet playRow(play: any, showGameName: boolean)}
    {#if editingSessionId === play.sessionId}
        {@const initialWinnerCount = (play.isWinner ? 1 : 0) + (play.opponents || []).filter((o: any) => o.is_winner).length}
        <div class="modal-play-row editing">
            {#if historyEditError}
                <p class="inline-error">{historyEditError}</p>
            {/if}
            <form
                method="POST"
                action="?/editHistory"
                oninput={(e) => {
                    const form = e.currentTarget as HTMLFormElement;
                    const count = new FormData(form).getAll('winnerIds').length;
                    const el = form.querySelector('.edit-winner-count');
                    if (el) el.textContent = `${count}명 선택됨`;
                }}
                use:enhance={() => {
                historyEditError = '';
                return async ({ result, update }) => {
                    if (result.type === 'success') {
                        editingSessionId = null;
                        await update();
                        flashSaved(play.sessionId);
                    } else if (result.type === 'failure') {
                        historyEditError = (result.data as any)?.error || '수정에 실패했습니다.';
                    }
                };
            }}>
                <input type="hidden" name="sessionId" value={play.sessionId} />
                {#if showGameName}
                    <p class="edit-game-name">{play.gameName}</p>
                {/if}
                <div class="edit-player-row">
                    <label class="checkbox-label">
                        <input type="checkbox" name="winnerIds" value={data.userId} checked={play.isWinner}>
                        <span class="p-name">{data.userName} (나)</span>
                    </label>
                    <label class="visually-hidden" for="score_{data.userId}_{play.sessionId}">{data.userName} 점수</label>
                    <input type="number" id="score_{data.userId}_{play.sessionId}" name="score_{data.userId}" placeholder="점수" class="score-input" value={play.myScore ?? ''}>
                </div>
                {#each play.opponents || [] as opp}
                    <div class="edit-player-row">
                        <label class="checkbox-label">
                            <input type="checkbox" name="winnerIds" value={opp.attendee_id} checked={opp.is_winner}>
                            <span class="p-name">{opp.name}</span>
                        </label>
                        <label class="visually-hidden" for="score_{opp.attendee_id}_{play.sessionId}">{opp.name} 점수</label>
                        <input type="number" id="score_{opp.attendee_id}_{play.sessionId}" name="score_{opp.attendee_id}" placeholder="점수" class="score-input" value={opp.score ?? ''}>
                    </div>
                {/each}
                <p class="edit-winner-count" aria-live="polite">{initialWinnerCount}명 선택됨</p>
                <div class="edit-play-actions">
                    <button type="button" class="btn-cancel-inline" onclick={closePlayEdit}>취소</button>
                    <button type="submit" class="btn-save-inline">저장</button>
                </div>
            </form>
        </div>
    {:else}
        <div class="modal-play-row" class:win={play.isWinner}>
            <div class="play-row-main">
                {#if showGameName}
                    <div class="play-row-cover">
                        {#if play.gameImageUrl}
                            <img src={play.gameImageUrl} alt="" loading="lazy" />
                        {:else}
                            <div class="play-row-cover-placeholder" aria-hidden="true">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                            </div>
                        {/if}
                    </div>
                {/if}
                <div class="play-row-text">
                    {#if showGameName}<p class="play-game-name">{play.gameName}</p>{/if}
                    <div class="play-row-top">
                        <span class="play-date">{formatDate(play.endTime)}</span>
                        <span class="play-result">
                            {#if play.isWinner}<span class="result-badge">승리</span>{/if}
                            {#if play.myScore !== null && play.myScore !== undefined}<span class="play-score">{play.myScore}점</span>{/if}
                        </span>
                    </div>
                    {#if play.opponents && play.opponents.length > 0}
                        <p class="play-opponents">
                            함께: {play.opponents.map((o: any) => o.name + (o.score ? `(${o.score})` : '')).join(', ')}
                        </p>
                    {/if}
                </div>
            </div>
            {#if justSavedSessionId === play.sessionId}
                <span class="save-flash" aria-live="polite">✓ 저장됨</span>
            {:else if canEditPlay(play)}
                <button type="button" class="btn-edit-play" onclick={() => openPlayEdit(play)}>수정</button>
            {:else}
                <span class="edit-window-closed" title="플레이 후 7일이 지나면 기록을 수정할 수 없어요">수정 기간 지남</span>
            {/if}
        </div>
    {/if}
{/snippet}

<div class="collection-container">
    <header class="collection-header">
        <div class="header-top">
            <h1>보드게임 장식장</h1>
            <a href="/games" class="btn-catalog">전체 게임 보기</a>
        </div>
        <p class="collection-progress">
            <strong>{playedCount}</strong> / {totalCount}종 수집
            <span class="progress-track">
                <span class="progress-fill" style="transform: scaleX({totalCount > 0 ? playedCount / totalCount : 0})"></span>
            </span>
        </p>
        <div class="view-toggle" role="group" aria-label="보기 방식">
            <button type="button" class:active={viewMode === 'byGame'} aria-pressed={viewMode === 'byGame'} onclick={() => switchView('byGame')}>게임별</button>
            <button type="button" class:active={viewMode === 'all'} aria-pressed={viewMode === 'all'} onclick={() => switchView('all')}>전체 기록</button>
        </div>
        {#if viewMode === 'byGame'}
            <div class="search-input-wrap">
                <input type="text" placeholder="게임 검색..." bind:value={searchQuery} class="search-input" aria-label="게임 검색" />
                {#if searchQuery}
                    <button type="button" class="search-clear" onclick={() => searchQuery = ''} aria-label="검색어 지우기">✕</button>
                {/if}
            </div>
            <label class="owned-only-toggle">
                <input type="checkbox" bind:checked={showOwnedOnly} />
                내가 보유한 것만 보기
            </label>
        {:else}
            <!-- 게임별 보기의 검색창과 같은 자리에 둬서, 뷰를 전환해도 손가락이 다시
                 찾아야 하는 위치가 바뀌지 않게 한다 -->
            <button
                type="button"
                class="filter-disclosure-toggle"
                aria-expanded={showAllFilters}
                onclick={() => showAllFilters = !showAllFilters}
            >
                <svg class="filter-chevron" class:open={showAllFilters} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                필터{allActiveFilterCount > 0 ? ` (${allActiveFilterCount})` : ''}
            </button>
        {/if}
    </header>

    {#if viewMode === 'all' && showAllFilters}
        <!-- 토글 버튼이 헤더에 있으니(뷰 전환 시 위치 일관성 위해), 패널도
             그 바로 아래 둬야 "눌렀는데 저 밑에서 펼쳐진다"는 혼란이 없다. -->
        <div class="play-filters">
            <span class="filter-group-label">언제</span>
            <div class="play-filters-dates">
                <select class="play-date-select" bind:value={allYearFilter} aria-label="연도 필터">
                    <option value="all">전체 연도</option>
                    {#each allYears as year}
                        <option value={year.toString()}>{year}년</option>
                    {/each}
                </select>
                <select class="play-date-select" bind:value={allMonthFilter} aria-label="월 필터">
                    <option value="all">전체 월</option>
                    {#each Array(12) as _, i}
                        <option value={(i + 1).toString()}>{i + 1}월</option>
                    {/each}
                </select>
                <select class="play-date-select" bind:value={allDayFilter} aria-label="일 필터">
                    <option value="all">전체 일</option>
                    {#each Array(31) as _, i}
                        <option value={(i + 1).toString()}>{i + 1}일</option>
                    {/each}
                </select>
            </div>
            <span class="filter-group-label">무엇을 · 누구와</span>
            <input type="text" class="play-game-input" placeholder="게임 이름 검색..." bind:value={allGameQuery} aria-label="게임 이름 검색" />
            <div class="play-filters-row">
                <input
                    type="text"
                    class="play-opponent-input"
                    placeholder="같이 한 사람 검색..."
                    bind:value={allOpponentQuery}
                    aria-label="같이 한 사람 검색"
                />
                <label class="win-only-toggle">
                    <input type="checkbox" bind:checked={allWinOnly} />
                    승리한 게임만
                </label>
            </div>
        </div>
    {/if}

    {#if playedCount > 0}
        <section class="summary-row">
            <div class="summary-card">
                <h2>자주 만난 친구</h2>
                <ul>
                    {#each topFriends3 as [name, count]}
                        <li>
                            <span class="summary-name">{name}</span>
                            <span class="summary-count">{count}회</span>
                        </li>
                    {:else}
                        <li class="summary-empty">-</li>
                    {/each}
                </ul>
            </div>
            <div class="summary-card">
                <h2>가장 많이 플레이한 게임</h2>
                <ul>
                    {#each topGames3 as game}
                        <li>
                            <span class="summary-name">{game.name}</span>
                            <span class="summary-count">{data.playedByGameId[game.id].length}회</span>
                        </li>
                    {:else}
                        <li class="summary-empty">-</li>
                    {/each}
                </ul>
            </div>
        </section>
    {/if}

    {#if viewMode === 'byGame'}
        {#if totalCount === 0}
            <div class="empty-state">
                <p>등록된 게임이 아직 없어요.</p>
            </div>
        {:else if filteredGames.length === 0}
            <div class="empty-state">
                {#if searchQuery.trim()}
                    <p>"{searchQuery}"에 맞는 게임이 없어요.</p>
                {:else if showOwnedOnly}
                    <p>내가 보유한 것으로 표시한 게임이 없어요.</p>
                {:else}
                    <p>조건에 맞는 게임이 없어요.</p>
                {/if}
            </div>
        {:else}
            <p class="shelf-legend">
                <span class="legend-item">
                    <svg class="legend-star" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>
                    내 소장
                </span>
                <span class="legend-item"><span class="legend-swatch unplayed" aria-hidden="true"></span>아직 플레이 안 함</span>
            </p>
            <section class="shelf-grid">
                {#each filteredGames as game}
                    {@const played = data.playedByGameId[game.id]}
                    {@const owned = isOwned(game.id)}
                    <button
                        type="button"
                        class="shelf-item"
                        class:played={!!played}
                        class:locked={!played}
                        onclick={() => openGameModal(game)}
                        aria-label="{game.name}{played ? ` — ${played.length}회 플레이` : ' — 아직 플레이하지 않음'}{owned ? ', 내 소장 게임' : ''}"
                    >
                        <div class="cover">
                            {#if game.image_url}
                                <img src={game.image_url} alt={game.name} loading="lazy" />
                            {:else}
                                <div class="cover-placeholder">
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                </div>
                            {/if}
                            {#if owned}
                                <span class="owned-badge" title="내 소장 게임" aria-hidden="true">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>
                                </span>
                            {/if}
                            {#if played}
                                <span class="play-badge" title="{formatDate(played[played.length - 1].endTime)}에 처음 플레이">×{played.length}</span>
                            {/if}
                        </div>
                        <span class="shelf-label">{game.name}</span>
                    </button>
                {/each}
            </section>
        {/if}
    {:else}
        {#if data.allPlays.length === 0}
            <div class="empty-state">
                <p>아직 플레이 기록이 없어요.</p>
            </div>
        {:else if filteredAllPlays.length === 0}
            <p class="no-play-results">조건에 맞는 기록이 없어요.</p>
        {:else}
            <div class="all-plays-list">
                {#each filteredAllPlays as play (play.sessionId)}
                    {@render playRow(play, true)}
                {/each}
            </div>
        {/if}
    {/if}
</div>

{#if selectedGame}
    <div
        class="modal-backdrop"
        onclick={closeGameModal}
        onkeydown={(e) => e.key === 'Escape' && closeGameModal()}
        role="presentation"
    >
        <div
            class="modal-content"
            use:trapFocus={closeGameModal}
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="game-modal-title"
            tabindex="-1"
        >
            <button type="button" class="modal-close-btn-icon" onclick={closeGameModal} aria-label="닫기">✕</button>
            <div class="modal-game-header">
                <div class="modal-cover">
                    {#if selectedGame.image_url}
                        <img src={selectedGame.image_url} alt="" />
                    {:else}
                        <div class="cover-placeholder">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                        </div>
                    {/if}
                </div>
                <div>
                    <h3 id="game-modal-title">{selectedGame.name}</h3>
                    <p class="modal-stats">{selectedGamePlays.length}회 플레이 · {selectedGamePlays.filter((p: any) => p.isWinner).length}승</p>
                </div>
            </div>

            {#if ownershipError}
                <p class="inline-error">{ownershipError}</p>
            {/if}
            <form
                method="POST"
                action="?/toggleOwnership"
                use:enhance={() => {
                    ownershipError = '';
                    return async ({ result, update }) => {
                        if (result.type === 'success') {
                            await update();
                        } else if (result.type === 'failure') {
                            ownershipError = (result.data as any)?.error || '처리에 실패했습니다.';
                        }
                    };
                }}
            >
                <input type="hidden" name="gameId" value={selectedGame.id} />
                <input type="hidden" name="owned" value={(!isOwned(selectedGame.id)).toString()} />
                <button type="submit" class="btn-ownership-toggle" class:active={isOwned(selectedGame.id)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill={isOwned(selectedGame.id) ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                    {isOwned(selectedGame.id) ? '내가 소장 중' : '내 소장 게임으로 표시'}
                </button>
            </form>

            {#if selectedGamePlays.length === 0}
                <p class="no-play-results">아직 플레이 기록이 없어요.</p>
            {:else}
                <button
                    type="button"
                    class="filter-disclosure-toggle"
                    aria-expanded={showModalFilters}
                    onclick={() => showModalFilters = !showModalFilters}
                >
                    <svg class="filter-chevron" class:open={showModalFilters} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                    필터{modalActiveFilterCount > 0 ? ` (${modalActiveFilterCount})` : ''}
                </button>
                {#if showModalFilters}
                    <div class="play-filters">
                        <span class="filter-group-label">언제</span>
                        <div class="play-filters-dates">
                            <select class="play-date-select" bind:value={playYearFilter} aria-label="연도 필터">
                                <option value="all">전체 연도</option>
                                {#each playYears as year}
                                    <option value={year.toString()}>{year}년</option>
                                {/each}
                            </select>
                            <select class="play-date-select" bind:value={playMonthFilter} aria-label="월 필터">
                                <option value="all">전체 월</option>
                                {#each Array(12) as _, i}
                                    <option value={(i + 1).toString()}>{i + 1}월</option>
                                {/each}
                            </select>
                            <select class="play-date-select" bind:value={playDayFilter} aria-label="일 필터">
                                <option value="all">전체 일</option>
                                {#each Array(31) as _, i}
                                    <option value={(i + 1).toString()}>{i + 1}일</option>
                                {/each}
                            </select>
                        </div>
                        <span class="filter-group-label">누구와</span>
                        <div class="play-filters-row">
                            <input
                                type="text"
                                class="play-opponent-input"
                                placeholder="같이 한 사람 검색..."
                                bind:value={playOpponentQuery}
                                aria-label="같이 한 사람 검색"
                            />
                            <label class="win-only-toggle">
                                <input type="checkbox" bind:checked={playWinOnly} />
                                승리한 게임만
                            </label>
                        </div>
                    </div>
                {/if}

                {#if filteredPlays.length === 0}
                    <p class="no-play-results">조건에 맞는 기록이 없어요.</p>
                {/if}

                <div class="modal-play-list">
                    {#each filteredPlays as play (play.sessionId)}
                        {@render playRow(play, false)}
                    {/each}
                </div>
            {/if}
        </div>
    </div>
{/if}

<style>
    .collection-container {
        max-width: 600px;
        margin: 0 auto;
        padding: 1.5rem;
        padding-bottom: 6rem;
        min-height: 100vh;
        box-sizing: border-box;
        background: var(--bg-secondary);
    }

    .collection-header {
        /* 오락실 페이지와 같은 이유로: 전역 알림벨이 화면 우상단에
           고정되어 있어(top:12px, right:12px, 지름 약 40px) 헤더가 그
           영역과 겹치지 않도록 위쪽 여백을 확보한다 */
        padding-top: 1.5rem;
        margin-bottom: 1.5rem;
    }
    .header-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.6rem;
    }
    .collection-header h1 {
        font-size: 1.4rem;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0;
        letter-spacing: -0.02em;
    }
    .summary-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem;
        margin-bottom: 1.5rem;
    }
    .summary-card {
        /* 그리드 아이템은 기본 min-width: auto라 내용(긴 이름)의 고유 너비보다
           트랙이 줄어들지 못해, 좁은 화면에서 카드가 화면 밖으로 밀려난다.
           .summary-name의 ellipsis가 실제로 작동하려면 이 min-width: 0이 필요하다. */
        min-width: 0;
        background: var(--bg-primary);
        border-radius: 12px;
        padding: 0.9rem;
        box-shadow: 0 2px 8px var(--shadow-sm);
    }
    .summary-card h2 {
        margin: 0 0 0.6rem 0;
        font-size: 0.82rem;
        color: var(--text-secondary);
        border-bottom: 1px solid var(--border-light);
        padding-bottom: 0.45rem;
    }
    .summary-card ul {
        list-style: none;
        margin: 0;
        padding: 0;
    }
    .summary-card li {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.4rem;
        margin-bottom: 0.35rem;
        font-size: 0.85rem;
    }
    .summary-card li:last-child {
        margin-bottom: 0;
    }
    .summary-name {
        color: var(--text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
    }
    .summary-count {
        flex-shrink: 0;
        font-weight: bold;
        color: var(--text-tertiary);
        font-size: 0.82rem;
    }
    .summary-empty {
        color: var(--border-medium);
        text-align: center;
        justify-content: center;
    }
    .btn-catalog {
        flex-shrink: 0;
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--text-secondary);
        background: var(--bg-primary);
        border: 1px solid var(--border-default);
        padding: 0.4rem 0.75rem;
        border-radius: 100px;
        text-decoration: none;
        white-space: nowrap;
    }
    .collection-progress {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        font-size: 0.85rem;
        color: var(--text-secondary);
        margin: 0;
    }
    .collection-progress strong {
        color: var(--color-blue);
        font-size: 1rem;
    }
    .progress-track {
        flex: 1;
        height: 6px;
        background: var(--bg-elevated);
        border-radius: 100px;
        overflow: hidden;
    }
    .progress-fill {
        display: block;
        width: 100%;
        height: 100%;
        background: var(--color-blue);
        border-radius: 100px;
        transform-origin: left;
        transition: transform 0.3s ease;
    }

    .shelf-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 0.9rem;
        margin: 0 0 0.9rem;
        font-size: 0.75rem;
        color: var(--text-secondary);
    }
    .legend-item {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
    }
    .legend-swatch {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
    }
    .legend-star {
        flex-shrink: 0;
        color: var(--color-amber);
    }
    .legend-swatch.unplayed {
        background: var(--text-tertiary);
        opacity: 0.5;
    }

    .shelf-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1.1rem 0.75rem;
    }
    @media (min-width: 480px) {
        .shelf-grid {
            grid-template-columns: repeat(4, 1fr);
        }
    }
    @media (min-width: 1024px) {
        .collection-container {
            max-width: 960px;
        }
        .shelf-grid {
            /* 보유 게임이 적으면 고정 6열 중 상당수가 빈 회색 여백으로 남아
               미완성처럼 보였다 — auto-fill은 콘텐츠와 무관하게 트랙을 채워
               같은 문제가 재발하므로, 빈 트랙을 접어 남은 아이템이 채우는
               auto-fit을 쓴다 */
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        }
    }

    .shelf-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.4rem;
        text-decoration: none;
        cursor: pointer;
        background: none;
        border: none;
        padding: 0;
        font: inherit;
        color: inherit;
        width: 100%;
    }

    .cover {
        position: relative;
        width: 100%;
        aspect-ratio: 1 / 1;
        border-radius: 10px;
        overflow: hidden;
        background: var(--bg-primary);
        box-shadow: 0 2px 8px var(--shadow-sm);
    }
    .cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }
    .cover-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-tertiary);
    }

    .shelf-item.locked .cover img,
    .shelf-item.locked .cover-placeholder {
        filter: grayscale(1);
        opacity: 0.35;
    }

    .cover {
        transition: transform 0.15s ease;
    }
    .shelf-item:active .cover {
        transform: scale(0.96);
    }

    .play-badge {
        position: absolute;
        bottom: 4px;
        right: 4px;
        background: var(--color-blue);
        color: #fff;
        font-size: 0.7rem;
        font-weight: 800;
        padding: 0.1rem 0.4rem;
        border-radius: 100px;
        line-height: 1.4;
    }
    /* --color-blue는 다크 모드에서 밝은 하늘색(#4dabf7)이 되어 흰 글자와 2.51:1로
       WCAG AA(4.5:1) 미달 — 다크 모드에서만 어두운 배경색을 글자색으로 써서 6.9:1 확보 */
    :global([data-theme='dark']) .play-badge {
        color: var(--bg-primary);
    }
    .owned-badge {
        position: absolute;
        top: 4px;
        left: 4px;
        background: var(--color-amber);
        color: #451a03;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 1px 3px var(--shadow-sm);
    }

    .shelf-label {
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--text-primary);
        text-align: center;
        line-height: 1.3;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
    .shelf-item.locked .shelf-label {
        color: var(--text-tertiary);
    }

    .empty-state {
        text-align: center;
        padding: 3rem 1rem;
        color: var(--text-tertiary);
    }

    .search-input-wrap {
        position: relative;
        width: 100%;
        margin-top: 0.9rem;
    }
    .search-input {
        padding: 0.65rem 0.75rem;
        padding-right: 2.25rem;
        border: 1px solid var(--border-default);
        border-radius: 8px;
        background: var(--bg-primary);
        color: var(--text-primary);
        width: 100%;
        font-size: 0.9rem;
        box-sizing: border-box;
    }
    .search-clear {
        position: absolute;
        top: 50%;
        right: 0.1rem;
        transform: translateY(-50%);
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 44px;
        min-height: 44px;
        border: none;
        background: none;
        color: var(--text-secondary);
        font-size: 0.9rem;
        line-height: 1;
        cursor: pointer;
        border-radius: 50%;
    }
    .search-clear:hover {
        color: var(--text-primary);
        background: var(--bg-secondary);
    }
    .owned-only-toggle {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        margin-top: 0.6rem;
        font-size: 0.82rem;
        color: var(--text-secondary);
        cursor: pointer;
        width: fit-content;
    }

    .view-toggle {
        display: flex;
        gap: 0.4rem;
        margin-top: 0.9rem;
    }
    .view-toggle button {
        flex: 1;
        background: var(--bg-primary);
        border: 1px solid var(--border-default);
        color: var(--text-secondary);
        font-size: 0.85rem;
        font-weight: 600;
        padding: 0.5rem;
        border-radius: 8px;
        cursor: pointer;
    }
    .view-toggle button.active {
        background: var(--color-blue);
        border-color: var(--color-blue);
        color: #fff;
    }
    :global([data-theme='dark']) .view-toggle button.active {
        color: var(--bg-primary);
    }

    .all-plays-list {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
    }
    .play-game-name {
        margin: 0 0 0.25rem;
        font-weight: 700;
        color: var(--text-primary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
    }
    .edit-game-name {
        font-weight: 700;
        font-size: 0.85rem;
        color: var(--text-primary);
        margin: 0 0 0.5rem 0;
    }
    .play-game-input {
        width: 100%;
        box-sizing: border-box;
        padding: 0.35rem 0.6rem;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        background: var(--bg-primary);
        color: var(--text-primary);
        font-size: 0.8rem;
    }

    /* Game Detail Modal */
    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: var(--overlay-heavy);
        z-index: 999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        box-sizing: border-box;
    }
    .modal-content {
        background: var(--bg-primary);
        padding: 1.75rem;
        border-radius: 16px;
        max-width: 420px;
        width: 100%;
        max-height: 85vh;
        box-shadow: 0 4px 20px var(--overlay-medium);
        position: relative;
        /* 기록이 많아져도 헤더/닫기 버튼은 고정하고 목록만 스크롤되게
           세로 flex로 짜고, 목록 쪽에서만 overflow를 허용한다. */
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }
    .modal-close-btn-icon {
        position: absolute;
        top: 0.4rem;
        right: 0.4rem;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 44px;
        min-height: 44px;
        background: none;
        border: none;
        color: var(--text-secondary);
        font-size: 1rem;
        cursor: pointer;
        line-height: 1;
    }
    .modal-game-header {
        display: flex;
        align-items: center;
        gap: 0.9rem;
        margin-bottom: 1.25rem;
        padding-right: 1.5rem;
        flex-shrink: 0;
    }
    .modal-cover {
        flex-shrink: 0;
        width: 64px;
        height: 64px;
        border-radius: 8px;
        overflow: hidden;
        background: var(--bg-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .modal-cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
    .modal-game-header h3 {
        margin: 0 0 0.25rem 0;
        font-size: 1.05rem;
        color: var(--text-primary);
    }
    .modal-stats {
        margin: 0;
        font-size: 0.82rem;
        color: var(--text-secondary);
    }
    .btn-ownership-toggle {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        width: 100%;
        margin-bottom: 1rem;
        padding: 0.55rem;
        border: 1px solid var(--border-default);
        border-radius: 8px;
        background: var(--bg-secondary);
        color: var(--text-secondary);
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
    }
    .btn-ownership-toggle.active {
        background: var(--color-warning-bg);
        border-color: var(--color-amber);
        color: var(--color-achievement-text);
    }
    /* 필터가 항상 펼쳐져 있으면 컨트롤 5~6개가 정작 기록 몇 건보다 눈에 띈다 —
       기본은 접어두고 몇 개 걸려있는지만 보여준다 */
    .filter-disclosure-toggle {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 0.3rem;
        min-height: 44px;
        margin-bottom: 0.6rem;
        padding: 0.3rem 0;
        background: none;
        border: none;
        color: var(--text-secondary);
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
    }
    .filter-chevron {
        transition: transform 0.15s ease;
    }
    .filter-chevron.open {
        transform: rotate(90deg);
    }
    .save-flash {
        flex-shrink: 0;
        font-size: 0.75rem;
        font-weight: 700;
        color: var(--color-green, #22c55e);
        white-space: nowrap;
    }
    .play-filters {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        margin-bottom: 0.75rem;
    }
    .filter-group-label {
        display: block;
        font-size: 0.68rem;
        font-weight: 600;
        color: var(--text-tertiary);
        margin-top: 0.3rem;
    }
    .filter-group-label:first-child {
        margin-top: 0;
    }
    .play-filters-dates {
        display: flex;
        gap: 0.4rem;
    }
    .play-date-select {
        flex: 1;
        min-width: 0;
        padding: 0.35rem 0.4rem;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        background: var(--bg-primary);
        color: var(--text-primary);
        font-size: 0.78rem;
    }
    .play-filters-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .play-opponent-input {
        flex: 1;
        min-width: 0;
        padding: 0.35rem 0.6rem;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        background: var(--bg-primary);
        color: var(--text-primary);
        font-size: 0.8rem;
    }
    .win-only-toggle {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        font-size: 0.78rem;
        color: var(--text-secondary);
        white-space: nowrap;
        cursor: pointer;
    }
    .no-play-results {
        text-align: center;
        font-size: 0.82rem;
        color: var(--text-tertiary);
        padding: 1rem 0;
    }
    .modal-play-list {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        overflow-y: auto;
        min-height: 0;
    }
    .modal-play-row {
        background: var(--bg-secondary);
        border-radius: 10px;
        padding: 0.6rem 0.75rem;
    }
    .modal-play-row.win {
        border-left: 3px solid var(--color-amber);
    }
    /* 수정 버튼을 오른쪽에 두기 위한 가로 배치 — 수정 폼(.editing)은
       에러 문구 + 폼이 세로로 쌓여야 하므로 이 레이아웃에서 제외한다. */
    .modal-play-row:not(.editing) {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .play-row-main {
        display: flex;
        gap: 0.6rem;
        flex: 1;
        min-width: 0;
    }
    .play-row-cover {
        flex-shrink: 0;
        width: 40px;
        height: 40px;
        border-radius: 6px;
        overflow: hidden;
    }
    .play-row-cover img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
    }
    .play-row-cover-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--bg-secondary);
        color: var(--text-tertiary);
    }
    .play-row-text {
        flex: 1;
        min-width: 0;
    }
    .play-row-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
    }
    .play-date {
        font-size: 0.78rem;
        color: var(--text-tertiary);
    }
    .play-result {
        display: flex;
        flex-shrink: 0;
        align-items: center;
        gap: 0.4rem;
    }
    .result-badge {
        font-size: 0.72rem;
        font-weight: bold;
        padding: 0.1rem 0.45rem;
        border-radius: 4px;
        /* --color-warning-bg/--color-achievement-text 조합(.btn-ownership-toggle.active와
           동일)은 처음엔 다크 모드에서 1.29:1이라 판단해 피했으나, 이는 rgba()의 알파
           채널을 무시하고 측정한 검증 스크립트 쪽 버그였다 — 실제로 --bg-primary 위에
           알파 합성하면 약 6.2:1로 통과한다(3차 크리틱에서 정정). 그래도 --color-amber
           (#fbbf24)는 라이트/다크 값이 동일해 알파 합성을 따질 필요 자체가 없고,
           .owned-badge와 같은 패턴이라 8.4:1로 더 단순하고 확실하게 통과하므로 유지한다. */
        background: var(--color-amber);
        color: #451a03;
    }
    .play-score {
        font-size: 0.82rem;
        font-weight: bold;
        color: var(--text-primary);
    }
    .play-opponents {
        margin: 0.35rem 0 0 0;
        font-size: 0.78rem;
        color: var(--text-secondary);
    }
    .btn-edit-play {
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        background: none;
        border: 1px solid var(--border-default);
        color: var(--text-secondary);
        font-size: 0.75rem;
        padding: 0.25rem 0.6rem;
        border-radius: 6px;
        cursor: pointer;
    }
    .btn-edit-play:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
    }
    .edit-window-closed {
        flex-shrink: 0;
        font-size: 0.75rem;
        color: var(--text-tertiary);
        cursor: default;
    }

    /* 인라인 수정 폼 — 홈 화면 "게임 종료" 모달과 같은 승자/점수 입력 UI */
    .modal-play-row.editing {
        padding: 0.75rem;
    }
    .inline-error {
        color: var(--color-red-dark, #d32f2f);
        font-size: 0.78rem;
        margin: 0 0 0.5rem 0;
    }
    .edit-player-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
        padding: 0.35rem 0;
        border-bottom: 1px solid var(--border-light);
    }
    .edit-player-row:last-of-type {
        border-bottom: none;
    }
    .checkbox-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
        flex: 1;
        min-width: 0;
    }
    .p-name {
        font-size: 0.85rem;
        color: var(--text-primary);
    }
    .score-input {
        width: 64px;
        padding: 0.3rem;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        background: var(--bg-primary);
        color: var(--text-primary);
        font-size: 0.85rem;
        text-align: center;
    }
    .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
    }
    .edit-winner-count {
        font-size: 0.72rem;
        color: var(--text-tertiary);
        margin: 0.2rem 0 0;
    }
    .edit-play-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.75rem;
        margin-top: 0.6rem;
    }
    .btn-cancel-inline {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        background: none;
        border: 1px solid var(--border-default);
        color: var(--text-secondary);
        font-size: 0.8rem;
        padding: 0.35rem 0.8rem;
        border-radius: 6px;
        cursor: pointer;
    }
    .btn-save-inline {
        display: inline-flex;
        align-items: center;
        min-height: 44px;
        background: var(--color-blue);
        border: none;
        color: #fff;
        font-size: 0.8rem;
        font-weight: 600;
        padding: 0.35rem 0.8rem;
        border-radius: 6px;
        cursor: pointer;
    }
    /* .play-badge/.view-toggle button.active와 같은 버그: --color-blue가 다크
       모드에서 밝아져(#4dabf7) 흰 글자와 2.47:1로 미달 — 같은 패턴으로 수정 */
    :global([data-theme='dark']) .btn-save-inline {
        color: var(--bg-primary);
    }
</style>

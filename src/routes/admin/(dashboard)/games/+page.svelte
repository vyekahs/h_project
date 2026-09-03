<script lang="ts">
    import { enhance } from '$app/forms';
    import type { PageData } from './$types';
    import { trapFocus } from '$lib/actions/modal';
    import { showToast, showAlert, reportResult } from '$lib/stores/adminFeedback';

    let { data, form }: { data: PageData; form: any } = $props();

    /** 목록 표시 방식 — 기본은 표. 200종에서 카드 그리드는 스캔이 불가능하다. */
    let viewMode: 'table' | 'card' = $state('table');
    let sortKey: 'name' | 'players' | 'playtime' | 'complexity' = $state('name');
    let sortAsc = $state(true);
    /** 'all' | 'active' | 'inactive' | 'noimage' */
    let filterKey: 'all' | 'active' | 'inactive' | 'noimage' = $state('all');

    const VIEW_STORAGE_KEY = 'admin-games-view';
    if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(VIEW_STORAGE_KEY);
        if (saved === 'card' || saved === 'table') viewMode = saved;
    }
    function setView(next: 'table' | 'card') {
        viewMode = next;
        try {
            localStorage.setItem(VIEW_STORAGE_KEY, next);
        } catch {
            // 사파리 프라이빗 모드 등 — 저장 실패해도 화면은 동작해야 한다
        }
    }
    function toggleSort(key: typeof sortKey) {
        if (sortKey === key) sortAsc = !sortAsc;
        else {
            sortKey = key;
            sortAsc = true;
        }
    }

    /**
     * 파괴적 동작 확인. 「비활성화」와 「완전 삭제」는 결과가 다르므로 문구도 다르다.
     * 이전에는 버튼 하나가 기록 유무에 따라 둘 중 하나로 갈렸고,
     * 네이티브 confirm()이 "기록이 있으면 비활성화됩니다"라고만 말한 뒤
     * 무엇이 일어났는지는 끝내 알려주지 않았다.
     */
    let confirmAction: { kind: 'deactivate' | 'delete'; game: any } | null = $state(null);
    let confirmForm: HTMLFormElement | null = $state(null);

    function runConfirm() {
        confirmForm?.requestSubmit();
    }

    /** 링크가 죽은 커버 — "이미지 없음"과 구분해서 표시하기 위해 id를 모은다 */
    let brokenImages: Set<number> = $state(new Set());
    function markBroken(id: number) {
        // $state 는 Set 을 프록시하지 않는다. 같은 참조를 다시 대입해도 갱신되지 않으므로
        // 새 Set 을 만들어 대입한다(Svelte 4의 `x = x` 관용구가 통하지 않는 지점).
        brokenImages = new Set(brokenImages).add(id);
    }

    /** 빈 값을 화면에서 일관되게 — 지금까지 null분 / 분~분 / - 세 가지로 갈렸다 */
    const EMPTY = '미입력';
    const fmtPlaytime = (g: any) =>
        g.playtime_min === 0 ? '무제한' : g.playtime_min == null ? EMPTY : `${g.playtime_min}분`;
    const fmtRange = (g: any) => {
        if (g.playtime_min === 0) return '무제한';
        if (g.playtime_min == null) return EMPTY;
        return g.max_playtime && g.max_playtime !== g.playtime_min
            ? `${g.playtime_min}~${g.max_playtime}분`
            : `${g.playtime_min}분`;
    };
    const fmtPlayers = (g: any) =>
        g.min_players == null && g.max_players == null
            ? EMPTY
            : `${g.min_players ?? '?'}-${g.max_players ?? '?'}인`;

    let showModal = $state(false);
    let showBggModal = $state(false);
    let isEditing = $state(false);
    let selectedGame: any = $state(null);
    let isUnlimitedTime = $state(false);
    let previewFailed = $state(false);
    let bggInput: HTMLInputElement | null = $state(null);

    // BGG State
    let bggQuery = $state('');
    let bggResults: any[] = $state([]);
    let isSearching = $state(false);
    let isImporting = $state(false);

    function openAddModal() {
        isEditing = false;
        selectedGame = {
            name: '',
            min_players: 2,
            max_players: 4,
            playtime_min: 30,
            complexity: 2.5,
            description: '',
            image_url: '',
            included_dlcs: ''
        };
        isUnlimitedTime = false;
        previewFailed = false;
        showModal = true;
    }

    function openEditModal(game: any) {
        isEditing = true;
        selectedGame = { ...game };
        isUnlimitedTime = selectedGame.playtime_min === 0;
        previewFailed = false;
        showModal = true;
    }

    function closeModal() {
        showModal = false;
        selectedGame = null;
    }

    function closeBggModal() {
        showBggModal = false;
        bggResults = [];
        bggQuery = '';
        importedIds = new Set();
        lastImportedId = null;
    }

    // Game Search & Pagination
    let gameSearch = $state('');
    let visibleCount = $state(24);

    // 이름만으로는 "카탄"을 catan으로 못 찾는다. 설명·확장·BGG ID까지 넓힌다.
    const searchedGames = $derived(gameSearch.trim()
        ? data.games.filter((g: any) => {
              const q = gameSearch.trim().toLowerCase();
              return [g.name, g.description, g.included_dlcs, g.bgg_id]
                  .filter(Boolean)
                  .some((v: any) => String(v).toLowerCase().includes(q));
          })
        : data.games);

    const filteredGames = $derived(searchedGames.filter((g: any) => {
        if (filterKey === 'active') return g.is_active;
        if (filterKey === 'inactive') return !g.is_active;
        if (filterKey === 'noimage') return !g.image_url || brokenImages.has(g.id);
        return true;
    }));

    const sortedGames = $derived([...filteredGames].sort((a: any, b: any) => {
        const dir = sortAsc ? 1 : -1;
        if (sortKey === 'players') return ((a.min_players ?? 0) - (b.min_players ?? 0)) * dir;
        if (sortKey === 'playtime') return ((a.playtime_min ?? 0) - (b.playtime_min ?? 0)) * dir;
        if (sortKey === 'complexity') return ((a.complexity ?? 0) - (b.complexity ?? 0)) * dir;
        return a.name.localeCompare(b.name, 'ko') * dir;
    }));

    const visibleGames = $derived(sortedGames.slice(0, visibleCount));
    const hasMore = $derived(visibleCount < sortedGames.length);
    const noImageCount = $derived(
        data.games.filter((g: any) => !g.image_url || brokenImages.has(g.id)).length
    );

    // 검색어·필터·정렬이 바뀌면 페이지네이션을 처음으로
    $effect(() => {
        void gameSearch;
        void filterKey;
        void sortKey;
        visibleCount = 24;
    });

    let showDetailModal = $state(false);
    let selectedDetailGame: any = $state(null);

    function openDetailModal(game: any) {
        selectedDetailGame = game;
        showDetailModal = true;
    }

    function closeDetailModal() {
        showDetailModal = false;
        selectedDetailGame = null;
    }

    // BGG import 성공 추적
    let lastImportedId: string | null = $state(null);
    let importedIds: Set<string> = $state(new Set());

    $effect(() => {
        if (!form?.success) return;
        const f = form as any;
        if (f.needsConfirm) {
            // 이미 등록된 게임 — 무엇이 바뀌는지 보여주고 고르게 한다
            bggDiff = { bggId: f.bggId, name: f.existingName, changes: f.changes ?? [] };
            // 기본값: 갱신하기를 눌렀으니 대부분 덮어쓰되, 손으로 다듬는 필드인
            // 설명만 현재 값을 지킨다. 전부 "유지"로 두면 확정을 눌러도 아무 일도
            // 일어나지 않아 운영자가 무엇을 잘못했는지 알 수 없다.
            const PROTECTED = ['description'];
            keepKeys = new Set<string>(
                (f.changes ?? []).map((c: any) => c.key).filter((k: string) => PROTECTED.includes(k))
            );
            isImporting = false;
        } else if (f.imported) {
            if (lastImportedId) {
                importedIds = new Set(importedIds).add(lastImportedId);
            }
            lastImportedId = null;
            bggDiff = null;
            isImporting = false;
            showToast(f.wasUpdate ? `${f.importedName} 정보를 갱신했습니다.` : `${f.importedName}을(를) 도감에 추가했습니다.`);
        } else if (f.bggGames) {
            bggResults = f.bggGames || [];
            bggVisible = 20;
            isSearching = false;
        } else if (f.deactivatedName) {
            confirmAction = null;
            showToast(`${f.deactivatedName}을(를) 비활성화했습니다. 목록에서 내려갔지만 기록은 남아 있습니다.`);
        } else if (f.deletedName) {
            confirmAction = null;
            showToast(`${f.deletedName}을(를) 완전히 삭제했습니다.`);
        } else if (f.savedName !== undefined) {
            closeModal();
            showToast(`${f.savedName}을(를) 저장했습니다.`);
        } else {
            closeModal();
        }
    });

    // 서버가 돌려준 실패를 화면에 노출한다. 지금까지 form.error를 읽는 코드가 없었다.
    let lastErrorSeen: string | null = null;
    $effect(() => {
        const err = (form as any)?.error;
        if (err && err !== lastErrorSeen) {
            lastErrorSeen = err;
            isSearching = false;
            isImporting = false;
            showAlert(err);
        } else if (!err) {
            lastErrorSeen = null;
        }
    });

    /** BGG 덮어쓰기 미리보기 */
    let bggDiff: { bggId: string; name: string; changes: any[] } | null = $state(null);
    let keepKeys: Set<string> = $state(new Set());
    let bggVisible = $state(20);
    const registeredBggIds = $derived(
        new Set(data.games.map((g: any) => String(g.bgg_id)).filter(Boolean))
    );

    function toggleKeep(key: string) {
        const next = new Set(keepKeys);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        keepKeys = next;
    }

    const short = (v: any) => {
        const t = v == null || v === '' ? '(없음)' : String(v);
        return t.length > 60 ? t.slice(0, 60) + '…' : t;
    };
</script>

<div class="games-page">
    <div class="header">
        <h1>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:10px; vertical-align:text-bottom;"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
            게임 도감
        </h1>
        <div class="header-actions">
            <button class="btn-secondary" onclick={() => showBggModal = true}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                BGG에서 가져오기
            </button>
            <button class="btn-primary" onclick={openAddModal}>+ 게임 추가</button>
        </div>
    </div>

    <div class="search-bar">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" placeholder="이름 · 설명 · 확장 · BGG ID 검색" aria-label="게임 검색" bind:value={gameSearch} />
        {#if gameSearch}
            <button class="btn-clear-search" onclick={() => gameSearch = ''} aria-label="검색어 지우기">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        {/if}
        <span class="search-count">{sortedGames.length}개</span>
    </div>

    <!-- 도구 모음 — 운영 과업은 "틀린 데이터 찾기"라 필터와 정렬이 검색보다 중요하다 -->
    <div class="toolbar">
        <div class="filters" role="group" aria-label="목록 필터">
            <button class="chip" class:on={filterKey === 'all'} onclick={() => (filterKey = 'all')}>
                전체 {data.games.length}
            </button>
            <button class="chip" class:on={filterKey === 'active'} onclick={() => (filterKey = 'active')}>
                활성 {data.games.filter((g) => g.is_active).length}
            </button>
            <button class="chip" class:on={filterKey === 'inactive'} onclick={() => (filterKey = 'inactive')}>
                비활성 {data.games.filter((g) => !g.is_active).length}
            </button>
            <button
                class="chip"
                class:on={filterKey === 'noimage'}
                class:chip-warn={noImageCount > 0}
                onclick={() => (filterKey = 'noimage')}
            >
                이미지 없음 · 끊김 {noImageCount}
            </button>
        </div>
        <div class="view-toggle" role="group" aria-label="목록 표시 방식">
            <button class="chip" class:on={viewMode === 'table'} onclick={() => setView('table')} aria-pressed={viewMode === 'table'}>
                표
            </button>
            <button class="chip" class:on={viewMode === 'card'} onclick={() => setView('card')} aria-pressed={viewMode === 'card'}>
                카드
            </button>
        </div>
    </div>

{#if viewMode === 'table'}
    <div class="table-wrap">
        <table class="games-table">
            <thead>
                <tr>
                    <th class="col-thumb"><span class="sr-only">커버</span></th>
                    <th>
                        <button class="sort-btn" onclick={() => toggleSort('name')} aria-label="이름으로 정렬">
                            이름{#if sortKey === 'name'}<span aria-hidden="true">{sortAsc ? ' ↑' : ' ↓'}</span>{/if}
                        </button>
                    </th>
                    <th class="col-num">
                        <button class="sort-btn" onclick={() => toggleSort('players')} aria-label="인원으로 정렬">
                            인원{#if sortKey === 'players'}<span aria-hidden="true">{sortAsc ? ' ↑' : ' ↓'}</span>{/if}
                        </button>
                    </th>
                    <th class="col-num">
                        <button class="sort-btn" onclick={() => toggleSort('playtime')} aria-label="시간으로 정렬">
                            시간{#if sortKey === 'playtime'}<span aria-hidden="true">{sortAsc ? ' ↑' : ' ↓'}</span>{/if}
                        </button>
                    </th>
                    <th class="col-num">
                        <button class="sort-btn" onclick={() => toggleSort('complexity')} aria-label="난이도로 정렬">
                            난이도{#if sortKey === 'complexity'}<span aria-hidden="true">{sortAsc ? ' ↑' : ' ↓'}</span>{/if}
                        </button>
                    </th>
                    <th>확장</th>
                    <th class="col-actions"><span class="sr-only">동작</span></th>
                </tr>
            </thead>
            <tbody>
                {#each visibleGames as game (game.id)}
                    <tr class:row-inactive={!game.is_active}>
                        <td class="col-thumb">
                            {#if game.image_url && !brokenImages.has(game.id)}
                                <img class="thumb" src={game.image_url} alt="" loading="lazy" onerror={() => markBroken(game.id)} />
                            {:else}
                                <span class="thumb thumb-empty" class:thumb-broken={brokenImages.has(game.id)} title={brokenImages.has(game.id) ? '이미지 링크가 끊어졌습니다' : '이미지 없음'}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                                </span>
                            {/if}
                        </td>
                        <td>
                            <button class="name-link" onclick={() => openDetailModal(game)}>{game.name}</button>
                            {#if !game.is_active}<span class="badge-inactive">비활성</span>{/if}
                            {#if brokenImages.has(game.id)}<span class="badge-broken">이미지 끊김</span>{/if}
                        </td>
                        <td class="col-num">{fmtPlayers(game)}</td>
                        <td class="col-num">{fmtPlaytime(game)}</td>
                        <td class="col-num">{game.complexity ?? EMPTY}</td>
                        <td class="col-dlc">{game.included_dlcs || '—'}</td>
                        <td class="col-actions">
                            <button class="btn-edit" onclick={() => openEditModal(game)}>수정</button>
                            {#if game.is_active}
                                <button class="btn-quiet" onclick={() => (confirmAction = { kind: 'deactivate', game })}>비활성화</button>
                            {:else}
                                <form method="POST" action="?/reactivate" use:enhance={() => async ({ result, update }) => {
                                    reportResult(result, `${game.name}을(를) 복구했습니다.`);
                                    await update();
                                }}>
                                    <input type="hidden" name="id" value={game.id} />
                                    <button type="submit" class="btn-quiet">복구</button>
                                </form>
                            {/if}
                            {#if !game.has_history}
                                <button class="btn-danger-quiet" onclick={() => (confirmAction = { kind: 'delete', game })}>완전 삭제</button>
                            {/if}
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
        {#if sortedGames.length === 0}
            <p class="empty-state">{gameSearch ? '검색 결과가 없습니다. 다른 이름이나 BGG ID로 찾아보세요.' : '등록된 게임이 없습니다. 「+ 게임 추가」나 「BGG에서 가져오기」로 시작하세요.'}</p>
        {/if}
    </div>
{:else}
    <div class="games-grid">
        {#each visibleGames as game}
            <div 
                class="game-card" 
                class:inactive={!game.is_active} 
                onclick={() => openDetailModal(game)}
                onkeydown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openDetailModal(game);
                    }
                }}
                role="button"
                tabindex="0"
                aria-label="{game.name} 상세 정보 보기"
            >
                <div class="game-image">
                    {#if game.image_url && !brokenImages.has(game.id)}
                        <img src={game.image_url} alt={game.name} onerror={() => markBroken(game.id)} />
                    {:else}
                        <div class="placeholder">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#adb5bd;"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                        </div>
                    {/if}
                    {#if brokenImages.has(game.id)}
                        <div class="image-broken-note">이미지 링크 끊김</div>
                    {/if}
                </div>
                <div class="game-info">
                    <div class="title-row">
                        <h3>{game.name}</h3>
                        {#if !game.is_active}
                            <span class="badge-inactive">비활성화됨</span>
                        {/if}
                    </div>
                    <div class="meta">
                        <span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align:text-top;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                            {fmtPlayers(game)}
                        </span>
                        <span>{fmtPlaytime(game)}</span>
                        <span class="complexity-badge">난이도 {game.complexity ?? EMPTY}</span>
                    </div>
                    {#if game.included_dlcs}
                        <p class="dlc-info">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; vertical-align:text-top;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            포함된 확장: {game.included_dlcs}
                        </p>
                    {/if}
                    {#if game.description}
                        <p class="desc">{game.description}</p>
                    {/if}
                    <div class="actions">
                        <button class="btn-edit" onclick={(e) => { e.stopPropagation(); openEditModal(game); }}>수정</button>
                        {#if game.is_active}
                            <button class="btn-quiet" onclick={(e) => { e.stopPropagation(); confirmAction = { kind: 'deactivate', game }; }}>
                                비활성화
                            </button>
                        {:else}
                            <form method="POST" action="?/reactivate" use:enhance={() => async ({ result, update }) => {
                                reportResult(result, `${game.name}을(를) 복구했습니다.`);
                                await update();
                            }}>
                                <input type="hidden" name="id" value={game.id} />
                                <button type="submit" class="btn-quiet" onclick={(e) => e.stopPropagation()}>복구</button>
                            </form>
                        {/if}
                    </div>
                </div>
            </div>
        {/each}
        {#if sortedGames.length === 0}
            <div class="empty-state">{gameSearch ? '검색 결과가 없습니다. 다른 이름이나 BGG ID로 찾아보세요.' : '등록된 게임이 없습니다. 「+ 게임 추가」나 「BGG에서 가져오기」로 시작하세요.'}</div>
        {/if}
    </div>
{/if}
    {#if hasMore}
        <button class="btn-load-more" onclick={() => (visibleCount += 24)}>
            더 보기 ({visibleGames.length}/{sortedGames.length})
        </button>
    {/if}
</div>

{#if confirmAction}
    <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 Escape(trapFocus)와 취소 버튼이 담당한다. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal-backdrop confirm-layer" onclick={() => (confirmAction = null)} role="presentation">
        <div
            class="modal confirm-modal"
            use:trapFocus={() => (confirmAction = null)}
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            tabindex="-1"
        >
            {#if confirmAction.kind === 'deactivate'}
                <h2>비활성화</h2>
                <p>
                    "{confirmAction.game.name}"을(를) 목록에서 내립니다.
                    플레이 기록과 통계는 그대로 남고, 언제든 복구할 수 있습니다.
                </p>
            {:else}
                <h2>완전 삭제</h2>
                <p>
                    "{confirmAction.game.name}"을(를) 도감에서 완전히 지웁니다.
                    이 게임은 플레이 기록이 없어 삭제할 수 있으며, 되돌릴 수 없습니다.
                </p>
            {/if}
            <div class="modal-actions">
                <button type="button" class="btn-quiet" data-autofocus onclick={() => (confirmAction = null)}>돌아가기</button>
                <form
                    method="POST"
                    action={confirmAction.kind === 'deactivate' ? '?/deactivate' : '?/delete'}
                    bind:this={confirmForm}
                    use:enhance={() => async ({ result, update }) => {
                        if (reportResult(result)) confirmAction = null;
                        await update();
                    }}
                >
                    <input type="hidden" name="id" value={confirmAction.game.id} />
                    <button type="submit" class={confirmAction.kind === 'delete' ? 'btn-destructive' : 'btn-primary'} onclick={runConfirm}>
                        {confirmAction.kind === 'delete' ? '완전 삭제' : '비활성화'}
                    </button>
                </form>
            </div>
        </div>
    </div>
{/if}

{#if bggDiff}
    <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 Escape(trapFocus)와 취소 버튼이 담당한다. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal-backdrop confirm-layer" onclick={() => (bggDiff = null)} role="presentation">
        <div
            class="modal diff-modal"
            use:trapFocus={() => (bggDiff = null)}
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            tabindex="-1"
        >
            <h2>이미 등록된 게임입니다</h2>
            <p class="diff-lead">
                "{bggDiff.name}"의 정보를 BGG 값으로 바꿉니다.
                <strong>체크한 항목만 바뀝니다.</strong> 설명은 직접 다듬는 경우가 많아 기본으로 지켜둡니다.
            </p>

            {#if bggDiff.changes.length === 0}
                <p class="diff-none">바뀌는 항목이 없습니다.</p>
            {:else}
                <ul class="diff-list">
                    {#each bggDiff.changes as c (c.key)}
                        <li class="diff-row">
                            <label>
                                <input type="checkbox" checked={!keepKeys.has(c.key)} onchange={() => toggleKeep(c.key)} />
                                <span class="diff-label">{c.label}</span>
                            </label>
                            <div class="diff-values">
                                <span class="diff-before">{short(c.before)}</span>
                                <span class="diff-arrow" aria-hidden="true">→</span>
                                <span class="diff-after" class:muted={keepKeys.has(c.key)}>{short(c.after)}</span>
                            </div>
                        </li>
                    {/each}
                </ul>
            {/if}

            <div class="modal-actions">
                <button type="button" class="btn-quiet" data-autofocus onclick={() => (bggDiff = null)}>취소</button>
                <form
                    method="POST"
                    action="?/importBgg"
                    use:enhance={() => {
                        isImporting = true;
                        return async ({ result, update }) => {
                            if (reportResult(result)) isImporting = false;
                            await update();
                        };
                    }}
                >
                    <input type="hidden" name="bggId" value={bggDiff.bggId} />
                    <input type="hidden" name="confirmed" value="true" />
                    {#each [...keepKeys] as k (k)}
                        <input type="hidden" name="keep" value={k} />
                    {/each}
                    <button type="submit" class="btn-primary" disabled={isImporting}>
                        {isImporting ? '적용 중…' : '선택한 항목 덮어쓰기'}
                    </button>
                </form>
            </div>
        </div>
    </div>
{/if}

{#if showDetailModal && selectedDetailGame}
    <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 모달의 Escape(trapFocus)와 닫기 버튼이 담당한다. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div 
        class="modal-backdrop" 
        onclick={closeDetailModal} role="presentation">
        <div class="modal detail-modal" use:trapFocus={closeDetailModal} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
            <div class="detail-header">
                <h2>{selectedDetailGame.name}</h2>
                <button class="btn-close" onclick={closeDetailModal} aria-label="닫기">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            
            <div class="detail-content">
                <div class="detail-image">
                    {#if selectedDetailGame.image_url}
                        <img src={selectedDetailGame.image_url} alt={selectedDetailGame.name} />
                    {:else}
                        <div class="placeholder">
                            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#adb5bd;"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
                        </div>
                    {/if}
                </div>
                
                <div class="detail-info">
                    <div class="info-grid">
                        <div class="info-item">
                            <span class="label">인원</span>
                            <span class="value">{selectedDetailGame.min_players}-{selectedDetailGame.max_players}명</span>
                        </div>
                        <div class="info-item">
                            <span class="label">시간</span>
                            <span class="value">
                                {#if selectedDetailGame.playtime_min === 0}
                                    무제한
                                {:else}
                                    {fmtRange(selectedDetailGame)}
                                {/if}
                            </span>
                        </div>
                        <div class="info-item">
                            <span class="label">연령</span>
                            <span class="value">{selectedDetailGame.min_age ? selectedDetailGame.min_age + '세 이상' : '-'}</span>
                        </div>
                        <div class="info-item">
                            <span class="label">난이도</span>
                            <span class="value complexity-badge">{selectedDetailGame.complexity ?? EMPTY}</span>
                        </div>
                    </div>

                    {#if selectedDetailGame.best_players}
                        <div class="best-players">
                            <span class="label">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; vertical-align:middle;"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
                                베스트 인원:
                            </span>
                            <span class="value">{selectedDetailGame.best_players}명</span>
                        </div>
                    {/if}

                    {#if selectedDetailGame.included_dlcs}
                        <div class="dlc-section">
                            <h4>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; vertical-align:text-bottom;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                포함된 확장
                            </h4>
                            <p>{selectedDetailGame.included_dlcs}</p>
                        </div>
                    {/if}

                    <div class="description-section">
                        <h4>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px; vertical-align:text-bottom;"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
                            게임 설명
                        </h4>
                        <p>{selectedDetailGame.description || '설명이 없습니다.'}</p>
                    </div>
                </div>
            </div>

            <div class="modal-actions">
                <button class="btn-edit" onclick={() => { openEditModal(selectedDetailGame); closeDetailModal(); }}>수정</button>
                <button class="btn-primary" onclick={closeDetailModal}>닫기</button>
            </div>
        </div>
    </div>
{/if}

{#if showModal}
    <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 모달의 Escape(trapFocus)와 닫기 버튼이 담당한다. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div 
        class="modal-backdrop" 
        onclick={closeModal} role="presentation">
        <div class="modal" use:trapFocus={closeModal} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
            <h2>{isEditing ? '게임 수정' : '새 게임 등록'}</h2>
            <form method="POST" action={isEditing ? '?/update' : '?/create'} use:enhance>
                {#if isEditing}
                    <input type="hidden" name="id" value={selectedGame.id} />
                {/if}
                
                <div class="form-group">
                    <label for="gameName">게임 이름</label>
                    <input type="text" id="gameName" name="name" bind:value={selectedGame.name} required placeholder="예: 스플렌더" />
                </div>

                <div class="row">
                    <div class="form-group">
                        <label for="minPlayers">최소 인원</label>
                        <input type="number" id="minPlayers" name="min_players" bind:value={selectedGame.min_players} min="1" />
                    </div>
                    <div class="form-group">
                        <label for="maxPlayers">최대 인원</label>
                        <input type="number" id="maxPlayers" name="max_players" bind:value={selectedGame.max_players} min="1" />
                    </div>
                </div>

                <div class="row">
                    <div class="form-group">
                        <label for="playtime">플레이 시간 (분)</label>
                        <div class="playtime-input-group">
                            <input type="number" id="playtime" name="playtime_min" 
                                value={isUnlimitedTime ? 0 : selectedGame.playtime_min} 
                                oninput={(e) => selectedGame.playtime_min = parseInt(e.currentTarget.value)}
                                step="5" 
                                disabled={isUnlimitedTime} 
                            />
                            <label class="checkbox-label" for="unlimitedTime">
                                <input type="checkbox" id="unlimitedTime" bind:checked={isUnlimitedTime} onchange={() => {
                                    if (isUnlimitedTime) selectedGame.playtime_min = 0;
                                    else selectedGame.playtime_min = 30;
                                }} />
                                제한 시간 없음
                            </label>
                        </div>
                        <p class="field-hint">상자에 적힌 범위가 있으면 아래 「최대 시간」도 채워주세요.</p>
                    </div>

                    <!-- 지금까지 상세 화면에만 표시되고 입력란이 없어
                         손으로 넣은 게임은 영구히 "미입력"이던 세 필드 -->
                    <div class="form-row">
                        <div class="form-group">
                            <label for="maxPlaytime">최대 시간 (분)</label>
                            <input type="number" id="maxPlaytime" name="max_playtime" min="0" step="5"
                                bind:value={selectedGame.max_playtime} placeholder="선택" />
                        </div>
                        <div class="form-group">
                            <label for="minAge">권장 연령</label>
                            <input type="number" id="minAge" name="min_age" min="0" max="99"
                                bind:value={selectedGame.min_age} placeholder="선택" />
                        </div>
                        <div class="form-group">
                            <label for="bestPlayers">베스트 인원</label>
                            <input type="text" id="bestPlayers" name="best_players"
                                bind:value={selectedGame.best_players} placeholder="예: 4" />
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="complexity">난이도</label>
                        <input type="number" id="complexity" name="complexity" bind:value={selectedGame.complexity} step="0.01" min="1" max="5" />
                        <p class="field-hint">BGG의 Weight 값(1 = 아주 가벼움, 5 = 아주 무거움). 모르면 비워두세요.</p>
                    </div>
                </div>

                <div class="form-group">
                    <label for="includedDlcs">포함된 확장 (DLC)</label>
                    <input type="text" id="includedDlcs" name="included_dlcs" bind:value={selectedGame.included_dlcs} placeholder="예: 도시와 기사, 항해사 (쉼표로 구분)" />
                </div>

                <div class="form-group">
                    <label for="imageUrl">이미지 URL</label>
                    <input type="text" id="imageUrl" name="image_url" bind:value={selectedGame.image_url} placeholder="https://..." />
                        {#if selectedGame.image_url}
                            <div class="image-preview">
                                <img src={selectedGame.image_url} alt="" onload={() => (previewFailed = false)} onerror={() => (previewFailed = true)} />
                                <span class="preview-note" class:preview-fail={previewFailed}>
                                    {previewFailed ? '이 주소에서 이미지를 불러오지 못했습니다.' : '미리보기'}
                                </span>
                            </div>
                        {/if}
                </div>

                <div class="form-group">
                    <label for="gameDescription">설명</label>
                    <textarea id="gameDescription" name="description" bind:value={selectedGame.description} rows="3"></textarea>
                </div>

                <div class="modal-actions">
                    <button type="button" class="btn-cancel" onclick={closeModal}>취소</button>
                    <button type="submit" class="btn-submit">{isEditing ? '수정' : '등록'}</button>
                </div>
            </form>
        </div>
    </div>
{/if}

{#if showBggModal}
    <!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 모달의 Escape(trapFocus)와 닫기 버튼이 담당한다. -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="modal-backdrop" onclick={closeBggModal} role="presentation">
        <div class="modal bgg-modal" use:trapFocus={closeBggModal} onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
            <h2>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:text-bottom;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                BGG 게임 검색
            </h2>
            <form method="POST" action="?/searchBgg" use:enhance={() => {
                isSearching = true;
                return async ({ update }) => {
                    // reset:false — 검색어가 남아 있어야 무엇을 물었는지 보인다
                    await update({ reset: false });
                    isSearching = false;
                    bggInput?.focus();
                };
            }} class="search-form">
                <div class="search-row">
                    <input type="text" name="query" bind:value={bggQuery} bind:this={bggInput} placeholder="게임 이름 (영어)" aria-label="BGG 검색어 (영어 게임 이름)" required />
                    <button type="submit" class="btn-primary" disabled={isSearching}>
                        {isSearching ? '검색 중...' : '검색'}
                    </button>
                </div>
            </form>

            <div class="search-results">
                {#if bggResults.length > 0}
                    <p class="result-summary">
                        {bggResults.length}건 중 {Math.min(bggVisible, bggResults.length)}건 표시 —
                        검색어와 가까운 순입니다.
                    </p>
                    <ul>
                        {#each bggResults.slice(0, bggVisible) as game (game.id)}
                            {@const already = registeredBggIds.has(String(game.id))}
                            <li>
                                <div class="result-info">
                                    <span class="name">{game.name}</span>
                                    {#if game.year}<span class="year">({game.year})</span>{/if}
                                    <a class="bgg-link" href="https://boardgamegeek.com/boardgame/{game.id}" target="_blank" rel="noopener noreferrer">
                                        BGG #{game.id}
                                    </a>
                                    {#if already}<span class="already-badge">이미 등록됨</span>{/if}
                                </div>
                                {#if importedIds.has(game.id)}
                                    <span class="imported-badge">추가됨 ✓</span>
                                {:else}
                                    <form method="POST" action="?/importBgg" use:enhance={() => {
                                        isImporting = true;
                                        lastImportedId = game.id;
                                        return async ({ update }) => {
                                            await update();
                                            isImporting = false;
                                        };
                                    }}>
                                        <input type="hidden" name="bggId" value={game.id} />
                                        <input type="hidden" name="searchName" value={game.name} />
                                        <button type="submit" class="btn-secondary" disabled={isImporting}>
                                            {isImporting ? '가져오는 중…' : already ? '갱신하기' : '가져오기'}
                                        </button>
                                    </form>
                                {/if}
                            </li>
                        {/each}
                    </ul>
                    {#if bggVisible < bggResults.length}
                        <button type="button" class="btn-load-more" onclick={() => (bggVisible += 20)}>
                            더 보기 ({Math.min(bggVisible, bggResults.length)}/{bggResults.length})
                        </button>
                    {/if}
                {:else if !isSearching && bggQuery}
                    <p class="no-results">검색 결과가 없습니다.</p>
                {/if}
            </div>

            <div class="modal-actions">
                <button type="button" class="btn-cancel" onclick={closeBggModal}>닫기</button>
            </div>
        </div>
    </div>
{/if}

<style>
    /* ── 새 구조: 도구 모음 / 표 뷰 / 확인·diff 모달 ── */
    .sr-only {
        position: absolute;
        width: 1px; height: 1px;
        padding: 0; margin: -1px;
        overflow: hidden; clip: rect(0 0 0 0);
        white-space: nowrap; border: 0;
    }
    .toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        margin-bottom: var(--space-4);
    }
    .filters, .view-toggle {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
    }
    .chip {
        min-height: 44px;
        padding: 0 var(--space-3);
        border: 1px solid var(--border-medium);
        border-radius: var(--radius-control);
        background: var(--bg-primary);
        color: var(--text-primary);
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
        cursor: pointer;
        font-variant-numeric: var(--numeric);
    }
    .chip.on {
        background: var(--color-blue-bright);
        border-color: var(--color-blue-bright);
        color: var(--bg-primary);
    }
    .chip-warn:not(.on) {
        border-color: var(--border-warning);
        background: var(--color-warning-bg);
        color: var(--text-darker);
    }

    .table-wrap {
        background: var(--bg-primary);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-card);
        overflow-x: auto;
    }
    .games-table {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--text-sm);
    }
    .games-table th,
    .games-table td {
        padding: var(--space-2) var(--space-3);
        text-align: left;
        border-bottom: 1px solid var(--border-light);
        vertical-align: middle;
    }
    .games-table thead th {
        background: var(--bg-secondary);
        font-size: var(--text-xs);
        font-weight: var(--weight-medium);
        color: var(--text-secondary);
        white-space: nowrap;
    }
    .games-table tbody tr:last-child td { border-bottom: none; }
    .games-table tbody tr:hover { background: var(--bg-secondary); }
    .row-inactive { color: var(--text-secondary); }
    .col-num {
        text-align: right;
        white-space: nowrap;
        font-variant-numeric: var(--numeric);
    }
    .col-thumb { width: 48px; }
    .col-dlc {
        max-width: 18rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--text-secondary);
    }
    .col-actions {
        text-align: right;
        white-space: nowrap;
    }
    .col-actions form { display: inline; }
    .thumb {
        width: 40px;
        height: 40px;
        object-fit: cover;
        border-radius: var(--radius-control);
        display: block;
    }
    .thumb-empty {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--bg-hover);
        color: var(--text-muted);
    }
    .thumb-broken {
        background: var(--color-warning-bg);
        color: var(--color-orange-dark);
    }
    .sort-btn {
        display: inline-flex;
        align-items: center;
        background: none;
        border: none;
        padding: 0;
        font: inherit;
        color: inherit;
        cursor: pointer;
        min-height: 24px;
    }
    .name-link {
        display: inline-flex;
        align-items: center;
        background: none;
        border: none;
        padding: 0;
        font: inherit;
        font-weight: var(--weight-medium);
        color: var(--text-primary);
        text-align: left;
        cursor: pointer;
        min-height: 24px;
    }
    .name-link:hover { text-decoration: underline; }
    .badge-broken {
        margin-left: var(--space-2);
        font-size: var(--text-xs);
        padding: 0.1rem 0.4rem;
        border-radius: var(--radius-control);
        background: var(--color-warning-bg);
        color: var(--text-darker);
        border: 1px solid var(--border-warning);
    }
    .image-broken-note {
        position: absolute;
        left: 0; right: 0; bottom: 0;
        background: var(--color-warning-bg);
        color: var(--text-darker);
        font-size: var(--text-xs);
        text-align: center;
        padding: 0.15rem 0;
    }
    .btn-quiet {
        background: none;
        border: 1px solid var(--border-medium);
        border-radius: var(--radius-control);
        color: var(--text-primary);
        padding: 0 var(--space-2);
        min-height: 44px;
        font-size: var(--text-sm);
        cursor: pointer;
    }
    .btn-danger-quiet {
        background: var(--danger-outline-bg);
        border: 1px solid var(--danger-outline-fg);
        border-radius: var(--radius-control);
        color: var(--danger-outline-fg);
        padding: 0 var(--space-2);
        min-height: 44px;
        font-size: var(--text-sm);
        cursor: pointer;
    }
    /* 도감에서 지워도 기록은 남고 다시 등록할 수 있다 — 2단(테두리 빨강).
       목록의 「완전 삭제」(.btn-danger-quiet)와 같은 옷을 입어야 확인창이
       자기를 부른 버튼보다 무겁게 읽히지 않는다. */
    .btn-destructive {
        background: var(--danger-outline-bg);
        color: var(--danger-outline-fg);
        border: 1px solid var(--danger-outline-fg);
        border-radius: var(--radius-control);
        padding: 0 var(--space-4);
        min-height: 44px;
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
        cursor: pointer;
    }
    .btn-destructive:hover {
        background: var(--danger-outline-bg-hover);
    }
    .modal-backdrop.confirm-layer { z-index: 1100; }
    .confirm-modal, .diff-modal { max-width: 30rem; }
    .diff-modal { max-width: 34rem; }
    .diff-lead {
        font-size: var(--text-sm);
        color: var(--text-secondary);
        margin: 0 0 var(--space-3);
        line-height: 1.6;
    }
    .diff-none, .field-hint {
        font-size: var(--text-xs);
        color: var(--text-secondary);
        margin: var(--space-1) 0 0;
    }
    .diff-list {
        list-style: none;
        margin: 0 0 var(--space-4);
        padding: 0;
        max-height: 22rem;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
    }
    .diff-row {
        border: 1px solid var(--border-light);
        border-radius: var(--radius-control);
        padding: var(--space-2) var(--space-3);
    }
    .diff-row label {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        cursor: pointer;
    }
    .diff-label { font-weight: var(--weight-medium); font-size: var(--text-sm); }
    .diff-values {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: var(--space-2);
        margin-top: var(--space-1);
        font-size: var(--text-xs);
    }
    .diff-before { color: var(--text-secondary); text-decoration: line-through; }
    .diff-arrow { color: var(--text-muted); }
    .diff-after { color: var(--text-primary); font-weight: var(--weight-medium); }
    .diff-after.muted { color: var(--text-muted); text-decoration: line-through; font-weight: var(--weight-normal); }
    .result-summary {
        font-size: var(--text-xs);
        color: var(--text-secondary);
        margin: 0 0 var(--space-2);
    }
    .bgg-link {
        font-size: var(--text-xs);
        color: var(--color-blue-bright);
        margin-left: var(--space-2);
    }
    .already-badge {
        margin-left: var(--space-2);
        font-size: var(--text-xs);
        padding: 0.1rem 0.4rem;
        border-radius: var(--radius-control);
        background: var(--color-info-bg);
        color: var(--color-indigo);
    }
    .image-preview {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        margin-top: var(--space-2);
    }
    .image-preview img {
        width: 96px;
        height: 96px;
        object-fit: contain;
        background: var(--bg-hover);
        border-radius: var(--radius-control);
    }
    .preview-note { font-size: var(--text-xs); color: var(--text-secondary); }
    .preview-note.preview-fail { color: var(--color-red-dark); font-weight: var(--weight-medium); }
    .empty-state {
        padding: var(--space-6);
        text-align: center;
        color: var(--text-secondary);
        font-size: var(--text-sm);
        line-height: 1.7;
    }
    @media (max-width: 768px) {
        .col-dlc, .col-thumb { display: none; }
        .games-table th, .games-table td { padding: var(--space-2); }
        .col-actions { white-space: normal; }
    }

    .header {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-6);
    }
    .games-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: var(--space-5);
    }
    .game-card {
        background: white;
        border-radius: var(--radius-card);
        overflow: hidden;
        border: 1px solid var(--border-light);
        display: flex;
        flex-direction: column;
        cursor: pointer;
        transition: transform 0.2s, box-shadow 0.2s;
    }
    .game-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 4px 12px var(--shadow-md);
    }
    .game-image {
        height: 160px;
        background: var(--bg-surface);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
    }
    .game-image img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
    .game-image .placeholder {
        font-size: 3rem;
    }
    .game-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: var(--space-4);
        flex: 1;
        display: flex;
        flex-direction: column;
    }
    .game-info h3 {
        margin: 0 0 var(--space-2) 0;
        font-size: var(--text-lg);
    }
    .meta {
        font-variant-numeric: var(--numeric);
        display: flex;
        gap: var(--space-2);
        font-size: var(--text-sm);
        color: var(--text-secondary);
        margin-bottom: var(--space-2);
    }
    .complexity-badge {
        padding: 0 6px;
        border-radius: var(--radius-control);
        font-weight: var(--weight-bold);
    }

    .dlc-info {
        font-size: var(--text-sm);
        color: var(--color-green-dark);
        margin: 0 0 var(--space-2) 0;
        font-weight: var(--weight-medium);
    }
    /* flex:1 이 박스를 카드 높이만큼 늘려 line-clamp 을 무력화하고 있었다.
       긴 설명이 3~4줄로 늘어난 뒤 말줄임 없이 글자 중간에서 잘렸다.
       늘어나는 역할은 .desc 위의 여백이 맡고, 여기는 클램프만 한다. */
    .desc {
        font-size: var(--text-sm);
        color: var(--text-darker);
        margin: 0 0 var(--space-4) 0;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
    .actions {
        margin-top: auto;
        display: flex;
        gap: var(--space-2);
        justify-content: flex-end;
    }
    button {
        cursor: pointer;
        border: none;
        border-radius: var(--radius-control);
        padding: var(--space-2) var(--space-4);
        font-size: var(--text-sm);
    }
    .btn-primary { background: var(--color-blue-bright); color: white; font-weight: var(--weight-bold); }
    .btn-edit { background: var(--bg-elevated); color: var(--text-primary); }  /* var(--color-red-dark) 는 이 배경에서 4.36:1 */

    .game-card.inactive {
        /* opacity 합성은 안의 텍스트 대비까지 함께 무너뜨린다 — 배경으로만 구분 */
        background: var(--bg-secondary);
    }
    .game-image {
        position: relative;
    }
    .title-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: var(--space-2);
    }
    .title-row h3 { margin: 0; }
    .badge-inactive {
        font-size: var(--text-xs);
        background: var(--text-secondary);
        color: white;
        padding: 2px 6px;
        border-radius: var(--radius-control);
    }
    
    /* Modal */
    .modal-backdrop {
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: var(--overlay-heavy);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }
    .modal {
        background: white;
        padding: var(--space-6);
        border-radius: var(--radius-card);
        width: 90%;
        max-width: 500px;
        max-height: 90vh;
        overflow-y: auto;
    }
    
    /* Detail Modal Styles */
    .detail-modal {
        max-width: 700px;
    }
    .detail-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-5);
    }
    .detail-header h2 { margin: 0; }
    .btn-close {
        background: none;
        border: none;
        font-size: var(--text-xl);
        cursor: pointer;
        padding: 0;
        color: var(--text-secondary);
    }
    .detail-content {
        display: flex;
        gap: var(--space-6);
        margin-bottom: var(--space-6);
    }
    .detail-image {
        flex: 0 0 250px;
        height: 250px;
        border-radius: var(--radius-control);
        overflow: hidden;
        background: var(--bg-surface);
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .detail-image img {
        width: 100%;
        height: 100%;
        object-fit: contain;
    }
    .detail-image .placeholder { font-size: 4rem; }
    .detail-info { flex: 1; }
    .info-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--space-4);
        margin-bottom: var(--space-5);
        background: var(--bg-secondary);
        padding: var(--space-4);
        border-radius: var(--radius-control);
    }
    .info-item {
        display: flex;
        flex-direction: column;
    }
    .info-item .label {
        font-size: var(--text-sm);
        color: var(--text-secondary);
        margin-bottom: var(--space-1);
    }
    .info-item .value {
        font-weight: var(--weight-bold);
        font-size: var(--text-lg);
    }
    .best-players {
        margin-bottom: var(--space-5);
        padding: var(--space-3);
        background: var(--color-info-bg);
        border-radius: var(--radius-control);
        color: var(--color-indigo);
    }
    .dlc-section, .description-section {
        margin-bottom: var(--space-5);
    }
    .dlc-section h4, .description-section h4 {
        margin: 0 0 var(--space-2) 0;
        font-size: var(--text-base);
        color: var(--text-primary);
    }
    .dlc-section p, .description-section p {
        margin: 0;
        color: var(--text-darker);
        line-height: 1.6;
    }
    
    @media (max-width: 600px) {
        .detail-content {
            flex-direction: column;
        }
        .detail-image {
            width: 100%;
            height: 200px;
            flex: none;
        }
    }

    .form-group { margin-bottom: var(--space-4); }
    .row { display: flex; gap: var(--space-4); }
    .row .form-group { flex: 1; }
    label { display: block; margin-bottom: var(--space-2); font-weight: var(--weight-bold); font-size: var(--text-sm); }
    input, textarea {
        width: 100%;
        padding: var(--space-3);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-control);
        font-size: var(--text-base);
        box-sizing: border-box;
    }
    .playtime-input-group {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-3);
        align-items: center;
    }
    /* 체크박스 라벨이 nowrap이라 좁은 화면에서 숫자 입력이 26px까지 찌그러졌다 */
    .playtime-input-group input[type='number'] {
        flex: 1 1 8rem;
        min-width: 6rem;
    }
    .checkbox-label {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        white-space: nowrap;
        font-weight: normal;
        margin: 0;
        cursor: pointer;
    }
    .checkbox-label input {
        width: auto;
        margin: 0;
    }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-2);
        margin-top: var(--space-6);
    }
    .btn-cancel { background: var(--border-light); color: var(--text-primary); }
    .btn-submit { background: var(--color-blue-bright); color: white; font-weight: var(--weight-bold); }
    .btn-secondary { background: var(--text-dark); color: white; }

    /* BGG Modal Styles */
    .bgg-modal {
        max-width: 600px;
        height: 80vh;
        display: flex;
        flex-direction: column;
    }
    .search-form {
        margin-bottom: var(--space-4);
    }
    .search-row {
        display: flex;
        gap: var(--space-2);
    }
    .search-row input {
        flex: 1;
    }
    .search-results {
        flex: 1;
        overflow-y: auto;
        border: 1px solid var(--border-light);
        border-radius: var(--radius-control);
        padding: var(--space-2);
    }
    .search-results ul {
        list-style: none;
        padding: 0;
        margin: 0;
    }
    .search-results li {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-3);
        border-bottom: 1px solid var(--border-light);
    }
    .search-results li:last-child {
        border-bottom: none;
    }
    .result-info {
        display: flex;
        flex-direction: column;
    }
    .result-info .name {
        font-weight: var(--weight-bold);
    }
    .result-info .year {
        font-size: var(--text-sm);
        color: var(--text-secondary);
    }
    .no-results {
        text-align: center;
        color: var(--text-secondary);
        margin-top: var(--space-6);
    }
    .header-actions {
        display: flex;
        gap: var(--space-2);
    }

    /* Search Bar */
    .search-bar {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        margin-bottom: var(--space-5);
        background: white;
        border: 1px solid var(--border-default);
        border-radius: var(--radius-control);
        padding: var(--space-2) var(--space-3);
    }
    .search-bar svg {
        color: var(--text-hint);
        flex-shrink: 0;
    }
    .search-bar input {
        flex: 1;
        border: none;
        outline: none;
        font-size: var(--text-sm);
        padding: var(--space-1) 0;
        background: transparent;
    }
    .btn-clear-search {
        background: none;
        border: none;
        padding: 2px;
        cursor: pointer;
        color: var(--text-hint);
        display: flex;
        align-items: center;
    }
    .btn-clear-search:hover {
        color: var(--text-secondary);
    }
    .search-count {
        font-size: var(--text-sm);
        color: var(--text-secondary);
        white-space: nowrap;
    }

    /* Load More */
    .btn-load-more {
        display: block;
        width: 100%;
        padding: var(--space-3);
        margin-top: var(--space-5);
        background: white;
        border: 1px solid var(--border-default);
        border-radius: var(--radius-control);
        font-size: var(--text-sm);
        color: var(--text-darker);
        cursor: pointer;
        transition: background 0.2s;
    }
    .btn-load-more:hover {
        background: var(--bg-secondary);
    }

    /* Imported Badge */
    .imported-badge {
        color: var(--color-green-dark);
        font-size: var(--text-sm);
        font-weight: var(--weight-medium);
        padding: 0.4rem var(--space-3);
        background: var(--color-success-bg);
        border-radius: var(--radius-control);
        white-space: nowrap;
    }

    /* 폰은 서서 한 손으로 쓰는 주 사용 장면 — 탭 타깃을 44px 아래로 줄이지 않는다 */
    @media (max-width: 768px) {
        button,
        input:not([type='hidden']):not([type='checkbox']) {
            min-height: 44px;
        }
    }
</style>

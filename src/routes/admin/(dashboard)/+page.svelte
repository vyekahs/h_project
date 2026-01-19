<script lang="ts">
    import type { PageData } from './$types';
    import { enhance } from '$app/forms';

    export let data: PageData;
    if (!data) throw new Error('Data is required');

    let showModal = false;
    let selectedGameName = '';
    let selectedDuration = '';

    let selectedGameId = '';

    // Alert Modal State
    let alertVisible = false;
    let alertMessage = '';

    function showAlert(msg: string) {
        alertMessage = msg;
        alertVisible = true;
    }

    // Remove Confirm Modal State
    let removeModalVisible = false;
    let removeTarget: Attendee | null = null;

    function handleRemove(attendee: Attendee) {
        if (attendee.is_playing) {
            removeTarget = attendee;
            removeModalVisible = true;
        } else {
            // Instant remove for non-playing users
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '?/removeAttendee';
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'id';
            input.value = String(attendee.id);
            form.appendChild(input);
            document.body.appendChild(form);
            form.submit();
        }
    }

    // End Game Modal State
    let endGameModalVisible = false;
    let selectedEndGame: GameSession | null = null;

    function openEndGameModal(game: GameSession) {
        selectedEndGame = game;
        endGameModalVisible = true;
    }

    // Scheduled Game Modal State
    let showScheduledGameModal = false;
    let scheduledGameName = '';
    let scheduledAt = '';
    let minPlayers = 2;
    let maxPlayers = 4;

    function openScheduledGameModal() {
        showScheduledGameModal = true;
        scheduledGameName = '';
        dropdownOpen = false;
        
        // Set default time to 30 minutes from now, rounded to 10 minutes
        const now = new Date();
        now.setMinutes(Math.ceil((now.getMinutes() + 30) / 10) * 10);
        
        // Format to YYYY-MM-DDTHH:mm in local time
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        scheduledAt = `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    $: filteredScheduledGames = (data.allGames as any[])?.filter((g: any) => 
        g.name.toLowerCase().includes(scheduledGameName.toLowerCase())
    ) || [];

    function selectScheduledGame(game: any) {
        scheduledGameName = game.name;
        minPlayers = game.min_players;
        maxPlayers = game.max_players;
        dropdownOpen = false;
    }

    // Custom Dropdown State
    let dropdownOpen = false;
    let searchInput: HTMLInputElement;

    function toggleDropdown() {
        dropdownOpen = !dropdownOpen;
        if (dropdownOpen && searchInput) {
            setTimeout(() => searchInput.focus(), 0);
        }
    }

    function selectGame(game: { name: string, id: number, playtime_min: number }) {
        selectedGameName = game.name;
        selectedGameId = String(game.id);
        selectedDuration = String(game.playtime_min);
        dropdownOpen = false;
    }

    function handleInputClick() {
        dropdownOpen = true;
    }

    function handleModalClick(event: MouseEvent) {
        event.stopPropagation();
        const target = event.target as HTMLElement;
        if (!target.closest('.custom-dropdown')) {
            dropdownOpen = false;
        }
    }

    $: filteredGames = (data.allGames as any[])?.filter((g: any) => 
        g.name.toLowerCase().includes(selectedGameName.toLowerCase())
    ) || [];

    $: {
        const libraryGame = (data.allGames as any[])?.find((g: any) => g.name === selectedGameName);
        const historyGame = (data.savedGameNames as any[]).find((g: any) => g.game_name === selectedGameName);
        
        if (libraryGame) {
            selectedGameId = String(libraryGame.id);
            selectedDuration = String(libraryGame.playtime_min);
        } else if (historyGame && !libraryGame) { // Only fallback if not in library
            selectedGameId = '';
            selectedDuration = String(historyGame.duration);
        } else if (!libraryGame) {
            selectedGameId = '';
        }
    }

    function getTimeRemaining(endTime: string) {
        const end = new Date(endTime).getTime();
        const now = new Date().getTime();
        const diff = end - now;
        if (diff <= 0) return '종료됨';
        const mins = Math.floor(diff / 60000);
        return `${mins}분 남음`;
    }

    function formatTime(dateString: string) {
        return new Date(dateString).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    }

    interface Attendee {
        id: number;
        name: string;
        arrival_time: string;
        status: string;
        penalty_points: number;
        is_blacklisted: boolean;
        game_id: number | null;
        game_name: string | null;
        is_playing: boolean;
        can_manage_games: boolean;
    }

    interface GameSession {
        id: number;
        game_name: string;
        game_id: number | null;
        start_time: string;
        end_time: string;
        status: string;
        image_url: string | null;
        min_players: number;
        max_players: number;
        participants: { id: number; name: string }[];
        players: { id: number; name: string }[];
        scheduled_at: string;
    }

    interface Reservation {
        id: number;
        attendee_id: number;
        session_id: number;
        status: string;
        created_at: string;
        attendee_name: string;
        game_name: string;
    }

    interface SavedMember {
        id: number;
        name: string;
        penalty_points: number;
        is_blacklisted: boolean;
    }

    interface Table {
        id: number;
        name: string;
    }

    let attendees: Attendee[];
    let games: GameSession[];
    let scheduledGames: GameSession[];
    let reservations: Reservation[];
    let savedMembers: SavedMember[];
    let tables: Table[];

    $: attendees = data.attendees as Attendee[];
    $: games = data.games as GameSession[];
    $: scheduledGames = data.scheduledGames as GameSession[];
    $: reservations = data.reservations as Reservation[];
    $: savedMembers = data.savedMembers as SavedMember[];
</script>


<section>
    <h2>📢 공지사항 관리</h2>
    <div class="notice-manager">
        {#if data.notice}
            <div class="current-notice">
                <strong>현재 공지:</strong> {data.notice}
                <form method="POST" action="?/clearNotice" use:enhance style="display:inline; margin-left: 1rem;">
                    <button type="submit" class="btn-delete">숨기기</button>
                </form>
            </div>
        {/if}
        <form method="POST" action="?/updateNotice" use:enhance class="notice-form">
            <input type="text" name="content" placeholder="새 공지사항 입력" required />
            <button type="submit">등록</button>
        </form>
    </div>
</section>

<section>
    <h2>현재 참여 인원</h2>
    <ul class="attendee-list">
        {#each (attendees || []) as attendee (attendee.id)}
            {@const a = attendee as Attendee}
            <li>
                <div class="attendee-info">
                    <div class="name-row">
                        <a href="/admin/attendees/{a.id}" class="attendee-link">{a.name}</a>
                        {#if a.is_blacklisted}
                            <span class="badge blacklist">🚫 블랙</span>
                        {/if}
                        {#if a.penalty_points > 0}
                            <span class="badge penalty">⚠️ {a.penalty_points}</span>
                        {/if}
                    </div>
                    <span class="arrival-time">{formatTime(a.arrival_time)} 입장</span>
                </div>
                <div class="attendee-actions">
                    <form method="POST" action="?/applyPenaltyAdmin" use:enhance style="display:inline;">
                        <input type="hidden" name="attendeeId" value={a.id} />
                        <input type="hidden" name="points" value="1" />
                        <button type="submit" class="btn-penalty" title="페널티 +1">+1</button>
                    </form>
                    <form method="POST" action="?/toggleBlacklist" use:enhance style="display:inline;">
                        <input type="hidden" name="attendeeId" value={a.id} />
                        <button type="submit" class="btn-blacklist" title="블랙리스트 토글">
                            {a.is_blacklisted ? '해제' : '블랙'}
                        </button>
                    </form>
                    <form method="POST" action="?/toggleManager" use:enhance style="display:inline;">
                        <input type="hidden" name="attendeeId" value={a.id} />
                        <button type="submit" class="btn-manager-toggle {a.can_manage_games ? 'active' : ''}" title="게임 관리 권한 토글">
                            {a.can_manage_games ? '👑 매니저' : '👤 유저'}
                        </button>
                    </form>
                    <form method="POST" action="?/removeAttendee" use:enhance={({ cancel }) => {
                        if (a.is_playing) {
                            cancel(); // Stop default submission
                            handleRemove(a); // Open modal
                        }
                    }} style="display:inline;">
                        <input type="hidden" name="id" value={a.id} />
                        <button type="submit" class="btn-delete">퇴장</button>
                    </form>
                </div>
            </li>
        {/each}
    </ul>

    <form method="POST" action="?/addAttendee" use:enhance class="add-form">
        <input type="text" name="name" placeholder="이름 입력" required />
        <button type="submit">인원 추가</button>
    </form>

    {#if (data.savedMembers || []).length > 0}
        <div class="quick-add">
            <h3>저장된 멤버 (클릭하여 추가)</h3>
            <div class="member-chips">
                {#each (savedMembers || []) as member (member.id)}
                    <div class="chip-container {member.is_blacklisted ? 'blacklisted' : ''}">
                        <a href="/admin/attendees/{member.id}" class="chip-link">
                            {member.name}
                            {#if member.penalty_points > 0}
                                <span class="penalty-dot">({member.penalty_points})</span>
                            {/if}
                        </a>
                        <form method="POST" action="?/addAttendee" use:enhance style="display:inline;">
                            <input type="hidden" name="name" value={member.name} />
                            <button type="submit" class="chip-add" title="입장" disabled={member.is_blacklisted}>+</button>
                        </form>
                    </div>
                {/each}
            </div>
        </div>
    {/if}
</section>

<section>
    <div class="section-header">
        <h2>📅 시작 예정 게임 ({(scheduledGames || []).length})</h2>
        <button class="btn-create-game" on:click={openScheduledGameModal}>+ 게임 생성</button>
    </div>
    <div class="scheduled-grid">
        {#each (scheduledGames || []) as game (game.id)}
            {@const g = game as GameSession}
            <div class="scheduled-card">
                <div class="game-header-row">
                    {#if g.image_url}
                        <img src={g.image_url} alt={g.game_name} class="game-thumb" />
                    {:else}
                        <div class="game-thumb placeholder">🎲</div>
                    {/if}
                    <div class="game-details">
                        <h3>{g.game_name}</h3>
                        <p class="start-time">예정: {formatTime(g.scheduled_at)}</p>
                        <p class="participants-list">인원: (최소 {g.min_players} / 최대 {g.max_players})</p>
                        <p class="participants-list">참여자 ({(g.participants || []).length}): {(g.participants || []).map(p => p.name).join(', ')}</p>
                    </div>
                </div>
                <div class="game-actions">
                    <form method="POST" action="/?/joinScheduledGame" use:enhance class="inline-add-form">
                        <input type="hidden" name="sessionId" value={g.id} />
                        <select name="attendeeId" required class="attendee-select-mini">
                            <option value="">참여자 추가</option>
                            {#each (attendees || []) as attendee}
                                <option value={attendee.id}>{attendee.name}</option>
                            {/each}
                        </select>
                        <button type="submit" class="btn-mini">추가</button>
                    </form>
                    <form method="POST" action="?/startScheduledGame" use:enhance>
                        <input type="hidden" name="sessionId" value={g.id} />
                        <input type="number" name="duration" value="60" class="duration-input" />
                        <button type="submit" class="btn-primary">게임 시작</button>
                    </form>
                    <form method="POST" action="?/dissolveScheduledGame" use:enhance>
                        <input type="hidden" name="sessionId" value={g.id} />
                        <button type="submit" class="btn-delete">폭파</button>
                    </form>
                </div>
            </div>
        {/each}
        {#if (data.scheduledGames || []).length === 0}
            <p class="empty-state">예정된 게임이 없습니다.</p>
        {/if}
    </div>
</section>

<section>
    <div class="section-header">
        <h2>🎟️ 예약 및 대기열 ({(reservations || []).length})</h2>
        <form method="POST" action="/?/reserveGame" use:enhance class="inline-add-form">
            <select name="attendeeId" required class="attendee-select-mini">
                <option value="">예약자 추가</option>
                {#each (attendees || []) as attendee}
                    <option value={attendee.id}>{attendee.name}</option>
                {/each}
            </select>
            <select name="sessionId" required class="session-select-mini">
                <option value="">게임 선택</option>
                {#each (games || []) as game}
                    <option value={game.id}>{game.game_name}</option>
                {/each}
            </select>
            <button type="submit" class="btn-mini">추가</button>
        </form>
    </div>
    <div class="reservations-list">
        {#each (reservations || []) as res (res.id)}
            <div class="reservation-item {res.status}">
                <div class="res-info">
                    <span class="res-name"><strong>{res.attendee_name}</strong></span>
                    <span class="res-game">{res.game_name}</span>
                    <span class="res-status-badge {res.status}">
                        {res.status === 'pending' ? '대기' : res.status === 'waitlisted' ? '대기열' : '확정'}
                    </span>
                </div>
                <div class="res-actions">
                    {#if res.status === 'pending'}
                        <form method="POST" action="?/confirmReservation" use:enhance>
                            <input type="hidden" name="reservationId" value={res.id} />
                            <button type="submit" class="btn-confirm">확정</button>
                        </form>
                    {/if}
                    <form method="POST" action="?/cancelReservationAdmin" use:enhance>
                        <input type="hidden" name="reservationId" value={res.id} />
                        <button type="submit" class="btn-delete">취소</button>
                    </form>
                </div>
            </div>
        {/each}
        {#if (data.reservations || []).length === 0}
            <p class="empty-state">현재 예약 내역이 없습니다.</p>
        {/if}
    </div>
</section>

<section>
    <div class="section-header">
        <h2>진행 중인 게임</h2>
        <button class="btn-primary" on:click={() => {
            showModal = true;
            selectedGameName = '';
            selectedDuration = '';
            selectedGameId = '';
            dropdownOpen = false;
        }}>+ 새 게임 시작</button>
    </div>
    <div class="games-grid">
        {#each (games || []) as game (game.id)}
            <div class="game-card">
                <div class="game-header-row">
                    {#if game.image_url}
                        <img src={game.image_url} alt={game.game_name} class="game-thumb" />
                    {:else}
                        <div class="game-thumb placeholder">🎲</div>
                    {/if}
                    <div class="game-details">
                        <h3>{game.game_name}</h3>
                        <p class="players-list">참여자: {game.players.map(p => p.name).join(', ')}</p>
                        <p class="end-time">종료 예정: {new Date(game.end_time).toLocaleTimeString()} <span class="time-remaining">({getTimeRemaining(game.end_time)})</span></p>
                    </div>
                </div>
                <div class="game-actions">
                    <form method="POST" action="/?/joinScheduledGame" use:enhance class="inline-add-form">
                        <input type="hidden" name="sessionId" value={game.id} />
                        <select name="attendeeId" required class="attendee-select-mini">
                            <option value="">참여자 추가</option>
                            {#each (attendees || []) as attendee}
                                <option value={attendee.id}>{attendee.name}</option>
                            {/each}
                        </select>
                        <button type="submit" class="btn-mini">추가</button>
                    </form>
                    <form method="POST" action="?/extendGame" use:enhance>
                        <input type="hidden" name="id" value={game.id} />
                        <input type="hidden" name="minutes" value="10" />
                        <button type="submit" class="btn-extend">+10분</button>
                    </form>
                    <form method="POST" action="?/extendGame" use:enhance>
                        <input type="hidden" name="id" value={game.id} />
                        <input type="hidden" name="minutes" value="30" />
                        <button type="submit" class="btn-extend">+30분</button>
                    </form>
                    <button class="btn-delete" on:click={() => openEndGameModal(game)}>게임 종료</button>
                </div>
            </div>
        {/each}
        {#if (data.games || []).length === 0}
            <p class="empty-state">진행 중인 게임이 없습니다.</p>
        {/if}
    </div>
</section>

{#if showModal}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div class="modal-backdrop" on:click={() => showModal = false} role="presentation">
        <div class="modal-content" on:click={handleModalClick} role="dialog">
            <h2>새 게임 시작</h2>
            <form method="POST" action="?/createGame" use:enhance={() => {
                return async ({ result, update }: { result: any, update: (options?: { reset?: boolean }) => Promise<void> }) => {
                    if (result.type === 'failure') {
                        const data = result.data as { error?: string, missing?: boolean };
                        if (data?.missing) {
                            showAlert('필수 입력 항목을 입력해주세요.');
                        } else {
                            showAlert(data?.error || '오류가 발생했습니다.');
                        }
                    } else {
                        showModal = false;
                    }
                    await update();
                };
            }} class="game-form">
                <input type="hidden" name="gameId" value={selectedGameId} />
                <div class="input-group custom-dropdown">
                    <input 
                        type="text" 
                        name="gameName" 
                        placeholder="게임 이름 (직접 입력 또는 선택)" 
                        bind:value={selectedGameName} 
                        bind:this={searchInput}
                        on:click={handleInputClick}
                        on:focus={handleInputClick}
                        required 
                        autocomplete="off" 
                    />
                    
                    {#if dropdownOpen && filteredGames.length > 0}
                        <ul class="dropdown-menu">
                            {#each filteredGames as game}
                                <li>
                                    <button type="button" on:click={() => selectGame(game)}>
                                        {#if game.image_url}
                                            <img src={game.image_url} alt="" class="mini-thumb" />
                                        {/if}
                                        <div class="game-option-info">
                                            <span class="name">{game.name}</span>
                                            <span class="meta">👥 {game.min_players}-{game.max_players}인 | ⏱ {game.playtime_min}분</span>
                                        </div>
                                    </button>
                                </li>
                            {/each}
                        </ul>
                    {/if}
                </div>

                <div class="input-group">
                    <label for="duration">예상 플레이 시간 (분)</label>
                    <input 
                        type="number" 
                        id="duration"
                        name="duration" 
                        bind:value={selectedDuration} 
                        placeholder="분 단위 입력" 
                        required 
                        min="1" 
                        class="duration-input"
                    />
                </div>

                <div class="player-select">
                    <p>참여자 선택:</p>
                    {#each (attendees || []) as attendee (attendee.id)}
                        <label class:disabled={attendee.is_playing}>
                            <input type="checkbox" name="players" value={attendee.id} disabled={attendee.is_playing} />
                            {attendee.name}
                            {#if attendee.is_playing}
                                <span class="status-text">(게임 중)</span>
                            {/if}
                        </label>
                    {/each}
                </div>
                
                <div class="modal-actions">
                    <button type="button" on:click={() => showModal = false} class="btn-cancel">취소</button>
                    <button type="submit" class="btn-primary">게임 시작</button>
                </div>
            </form>
        </div>
    </div>
{/if}

<!-- End Game Modal -->
{#if endGameModalVisible && selectedEndGame}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div class="modal-backdrop" on:click={() => endGameModalVisible = false} role="presentation">
        <div class="modal-content" on:click|stopPropagation role="dialog">
            <h2>🏆 게임 종료 및 승자 선택</h2>
            <p><strong>{selectedEndGame.game_name}</strong> 게임을 종료합니다.</p>
            <p>승리한 플레이어를 선택해주세요 (복수 선택 가능):</p>
            
            <form method="POST" action="?/endGame" use:enhance={() => {
                return async ({ result, update }: { result: any, update: (options?: { reset?: boolean }) => Promise<void> }) => {
                    if (result.type === 'failure') {
                        const data = result.data as { error?: string, missing?: boolean };
                        if (data?.missing) {
                            showAlert('필수 입력 항목을 입력해주세요.');
                        } else {
                            showAlert(data?.error || '오류가 발생했습니다.');
                        }
                    } else {
                        endGameModalVisible = false;
                        showAlert('게임이 종료되고 승자가 기록되었습니다! 🏆');
                    }
                    await update();
                };
            }}>
                <input type="hidden" name="id" value={selectedEndGame.id} />
                
                <div class="player-select">
                    {#each (selectedEndGame?.players || []) as player}
                        <div class="winner-row">
                            <label class="winner-option">
                                <input type="checkbox" name="winnerIds" value={player.id} />
                                <span class="player-name">{player.name}</span>
                                <span class="medal">🏅</span>
                            </label>
                            <input type="number" name="score_{player.id}" placeholder="점수" class="score-input" />
                        </div>
                    {/each}
                </div>

                <div class="modal-actions">
                    <button type="button" on:click={() => endGameModalVisible = false} class="btn-cancel">취소</button>
                    <button type="submit" class="btn-primary">종료 및 저장</button>
                </div>
            </form>
        </div>
    </div>
{/if}

<!-- Alert Modal -->
{#if alertVisible}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div class="modal-backdrop" on:click={() => alertVisible = false} role="presentation">
        <div class="modal-content alert-modal" on:click|stopPropagation role="alertdialog">
            <h3>알림</h3>
            <p>{alertMessage}</p>
            <div class="modal-actions">
                <button class="btn-primary" on:click={() => alertVisible = false}>확인</button>
            </div>
        </div>
    </div>
{/if}

<!-- Remove Confirm Modal -->
{#if removeModalVisible && removeTarget}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div class="modal-backdrop" on:click={() => removeModalVisible = false} role="presentation">
        <div class="modal-content confirm-modal" on:click|stopPropagation role="dialog">
            <h3>참가자 퇴장 확인</h3>
            <p><strong>{removeTarget.name}</strong>님은 현재 <strong>{removeTarget.game_name}</strong> 게임에 참여 중입니다.</p>
            <p>어떻게 처리하시겠습니까?</p>
            
            <div class="modal-actions column-actions">
                <form method="POST" action="?/removeAttendee" use:enhance={() => {
                    return async ({ update }) => {
                        removeModalVisible = false;
                        await update();
                    };
                }}>
                    <input type="hidden" name="id" value={removeTarget.id} />
                    <input type="hidden" name="endGame" value="true" />
                    <input type="hidden" name="gameId" value={removeTarget.game_id} />
                    <button type="submit" class="btn-delete full-width">게임 종료 및 퇴장</button>
                </form>

                <form method="POST" action="?/removeAttendee" use:enhance={() => {
                    return async ({ update }) => {
                        removeModalVisible = false;
                        await update();
                    };
                }}>
                    <input type="hidden" name="id" value={removeTarget.id} />
                    <button type="submit" class="btn-warning full-width">참가자만 퇴장</button>
                </form>

                <button class="btn-cancel full-width" on:click={() => removeModalVisible = false}>취소</button>
            </div>
        </div>
    </div>
{/if}

{#if showScheduledGameModal}
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div class="modal-backdrop" on:click={() => showScheduledGameModal = false} role="presentation">
        <div class="modal-content" on:click={handleModalClick} role="dialog">
            <h2>📅 시작 예정 게임 생성</h2>
            <form method="POST" action="/?/createScheduledGame" use:enhance={() => {
                return async ({ result, update }: { result: any, update: (options?: { reset?: boolean }) => Promise<void> }) => {
                    if (result.type === 'failure') {
                        const data = result.data as { error?: string };
                        showAlert(data?.error || '오류가 발생했습니다.');
                    } else {
                        showScheduledGameModal = false;
                        showAlert('예약 게임이 생성되었습니다.');
                    }
                    await update();
                };
            }} class="game-form">
                
                <div class="input-group custom-dropdown">
                    <label for="scheduledGameName">게임 이름</label>
                    <input 
                        type="text" 
                        id="scheduledGameName"
                        name="gameName" 
                        placeholder="게임 이름 (직접 입력 또는 선택)" 
                        bind:value={scheduledGameName} 
                        bind:this={searchInput}
                        on:click={handleInputClick}
                        on:focus={handleInputClick}
                        required 
                        autocomplete="off" 
                    />
                    
                    {#if dropdownOpen && filteredScheduledGames.length > 0}
                        <ul class="dropdown-menu">
                            {#each filteredScheduledGames as game}
                                <li>
                                    <button type="button" on:click={() => selectScheduledGame(game)}>
                                        {#if game.image_url}
                                            <img src={game.image_url} alt="" class="mini-thumb" />
                                        {/if}
                                        <div class="game-option-info">
                                            <span class="name">{game.name}</span>
                                            <span class="meta">👥 {game.min_players}-{game.max_players}인 | ⏱ {game.playtime_min}분</span>
                                        </div>
                                    </button>
                                </li>
                            {/each}
                        </ul>
                    {/if}
                </div>

                <div class="input-group">
                    <label for="scheduledAt">시작 예정 시간</label>
                    <input type="datetime-local" id="scheduledAt" name="scheduledAt" bind:value={scheduledAt} required class="full-width-input">
                    <p class="hint">※ 시작 10분 전까지 최소 인원이 모이지 않으면 자동 폭파됩니다.</p>
                </div>

                <div class="player-limits">
                    <div class="input-group">
                        <label for="minPlayers">최소 인원</label>
                        <input type="number" id="minPlayers" name="minPlayers" min="1" bind:value={minPlayers} required class="number-input">
                    </div>
                    <div class="input-group">
                        <label for="maxPlayers">최대 인원</label>
                        <input type="number" id="maxPlayers" name="maxPlayers" min="1" bind:value={maxPlayers} required class="number-input">
                    </div>
                </div>
                
                <div class="modal-actions">
                    <button type="button" on:click={() => showScheduledGameModal = false} class="btn-cancel">취소</button>
                    <button type="submit" class="btn-primary">예약 생성</button>
                </div>
            </form>
        </div>
    </div>
{/if}

<style>
    section {
        margin-bottom: 3rem;
        padding: 1.5rem;
        border: 1px solid #eee;
        border-radius: 8px;
        background: #f9f9f9;
    }
    .attendee-list {
        list-style: none;
        padding: 0;
    }
    .attendee-list li {
        display: flex;
        justify-content: space-between;
        padding: 0.5rem;
        border-bottom: 1px solid #ddd;
    }
    .attendee-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .attendee-link {
        text-decoration: none;
        color: #333;
        font-weight: 500;
        display: flex;
        align-items: center;
    }
    .attendee-link:hover {
        color: #007bff;
        text-decoration: underline;
    }
    .arrival-time {
        font-size: 0.8rem;
        color: #666;
        background: #eee;
        padding: 0.1rem 0.4rem;
        border-radius: 4px;
    }
    .add-form, .game-form {
        margin-top: 1rem;
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
    }
    .quick-add {
        margin-top: 1.5rem;
        padding-top: 1rem;
        border-top: 1px dashed #ddd;
    }
    .quick-add h3 {
        font-size: 0.9rem;
        color: #666;
        margin-bottom: 0.5rem;
    }
    .member-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    }
    .chip-container {
        display: flex;
        align-items: center;
        background: #e0e0e0;
        border-radius: 16px;
        padding-left: 0.75rem;
        overflow: hidden;
    }
    .chip-link {
        text-decoration: none;
        color: #333;
        font-size: 0.85rem;
        margin-right: 0.5rem;
    }
    .chip-link:hover {
        text-decoration: underline;
        color: #007bff;
    }
    .chip-add {
        background: #bdbdbd;
        color: #333;
        border: none;
        padding: 0.25rem 0.6rem;
        font-size: 0.85rem;
        cursor: pointer;
        transition: background 0.2s;
        border-left: 1px solid #ccc;
    }
    .chip-add:hover {
        background: #a0a0a0;
    }
    .game-card {
        background: white;
        padding: 1rem;
        border-radius: 4px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        margin-bottom: 1rem;
    }
    .btn-delete {
        background: #ff4444;
        color: white;
        border: none;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        cursor: pointer;
    }
    .btn-warning {
        background: #ff9800;
        color: white;
        border: none;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        cursor: pointer;
    }
    button, .btn-secondary {
        padding: 0.5rem 1rem;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        text-decoration: none;
        display: inline-block;
    }
    .btn-secondary {
        background: #6c757d;
    }
    .player-select {
        width: 100%;
        display: flex;
        gap: 1rem;
        flex-wrap: wrap;
        margin: 1rem 0;
    }
    .time-remaining {
        font-weight: bold;
        color: #ef6c00;
        margin-left: 0.5rem;
    }
    .player-select label.disabled {
        color: #999;
        cursor: not-allowed;
    }
    .status-text {
        font-size: 0.8rem;
        color: #ff9800;
        margin-left: 0.25rem;
    }
    .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
        border-bottom: 2px solid #e0e0e0;
        padding-bottom: 0.5rem;
    }
    .section-header h2 {
        margin: 0;
        border: none;
        padding: 0;
    }
    .btn-primary {
        background: #007bff;
        color: white;
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
    }
    .btn-cancel {
        background: #ccc;
        color: #333;
    }
    .btn-create-game {
        background: #4caf50;
        color: white;
        padding: 0.5rem 1rem;
        border-radius: 8px;
        text-decoration: none;
        font-weight: bold;
        font-size: 0.9rem;
        transition: background 0.2s;
    }
    .btn-create-game:hover {
        background: #43a047;
    }
    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }
    .modal-content {
        background: white;
        padding: 2rem;
        border-radius: 8px;
        width: 90%;
        max-width: 500px;
        max-height: 90vh;
        overflow-y: auto;
    }
    .alert-modal {
        max-width: 400px;
        text-align: center;
    }
    .confirm-modal {
        max-width: 400px;
    }
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 1rem;
        margin-top: 1.5rem;
    }
    .column-actions {
        flex-direction: column;
        gap: 0.5rem;
    }
    .full-width {
        width: 100%;
        padding: 0.75rem;
        font-size: 1rem;
    }
    .empty-state {
        color: #999;
        text-align: center;
        padding: 2rem;
        background: rgba(255,255,255,0.5);
        border-radius: 8px;
        grid-column: 1 / -1;
    }
    .notice-manager {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .current-notice {
        background: #fff3e0;
        padding: 1rem;
        border-radius: 4px;
        border-left: 4px solid #ff9800;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .notice-form {
        display: flex;
        gap: 0.5rem;
    }
    .notice-form input {
        flex: 1;
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: 4px;
    }
    .game-actions {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.5rem;
    }
    .btn-extend {
        background: #4caf50;
        color: white;
        border: none;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.85rem;
    }

    @media (max-width: 600px) {
        .attendee-list li {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.5rem;
        }
        .attendee-info {
            width: 100%;
            justify-content: space-between;
        }
        .btn-delete {
            width: 100%;
            margin-top: 0.5rem;
        }
        .game-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.5rem;
        }
        .game-actions {
            flex-wrap: wrap;
        }
        .game-actions form {
            flex: 1;
        }
        .game-actions button {
            width: 100%;
        }
        .notice-manager {
            gap: 0.5rem;
        }
        .notice-form {
            flex-direction: column;
        }
        .notice-form button {
            width: 100%;
        }
    }
    .winner-option {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem;
        border: 1px solid #ddd;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.2s;
    }
    .winner-option:hover {
        background: #f5f5f5;
    }
    .winner-option:has(input:checked) {
        background: #fff8e1;
        border-color: #ffc107;
    }
    .winner-option .player-name {
        flex: 1;
        font-weight: 500;
    }
    .winner-option .medal {
        opacity: 0;
        transition: opacity 0.2s;
    }
    .winner-option:has(input:checked) .medal {
        opacity: 1;
    }

    /* New Game UI Styles */
    .game-header-row {
        display: flex;
        gap: 1rem;
        margin-bottom: 1rem;
    }
    .game-thumb {
        width: 60px;
        height: 60px;
        border-radius: 8px;
        object-fit: cover;
        background: #f0f0f0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5rem;
    }
    .game-details {
        flex: 1;
    }
    .game-details h3 {
        margin: 0 0 0.25rem 0;
    }
    .players-list {
        margin: 0 0 0.25rem 0;
        font-size: 0.9rem;
        color: #555;
    }
    .end-time {
        margin: 0;
        font-size: 0.85rem;
        color: #888;
    }

    /* New Admin UI Styles */
    .name-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .badge {
        font-size: 0.7rem;
        padding: 0.1rem 0.4rem;
        border-radius: 4px;
        font-weight: bold;
    }
    .badge.blacklist {
        background: #ff5252;
        color: white;
    }
    .badge.penalty {
        background: #ffd740;
        color: #333;
    }
    .attendee-actions {
        display: flex;
        gap: 0.25rem;
    }
    .btn-penalty {
        background: #ffd740;
        color: #333;
        border: none;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.8rem;
    }
    .btn-blacklist {
        background: #424242;
        color: white;
        border: none;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.8rem;
    }
    .chip-container.blacklisted {
        opacity: 0.5;
        background: #bdbdbd;
    }
    .penalty-dot {
        font-size: 0.7rem;
        color: #f44336;
        margin-left: 0.2rem;
    }

    .scheduled-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 1rem;
    }
    .scheduled-card {
        background: white;
        padding: 1rem;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        border-left: 4px solid #4c6ef5;
    }
    .duration-input {
        width: 50px;
        padding: 0.25rem;
        border-radius: 4px;
        border: 1px solid #ddd;
    }

    .reservations-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .reservation-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem;
        background: white;
        border-radius: 6px;
        border: 1px solid #eee;
    }
    .reservation-item.confirmed { border-left: 4px solid #4caf50; }
    .reservation-item.pending { border-left: 4px solid #ff9800; }
    .reservation-item.waitlisted { border-left: 4px solid #9e9e9e; }
    
    .res-info {
        display: flex;
        align-items: center;
        gap: 1rem;
    }
    .res-status-badge {
        font-size: 0.75rem;
        padding: 0.2rem 0.5rem;
        border-radius: 10px;
        background: #eee;
    }
    .res-status-badge.confirmed { background: #e8f5e9; color: #2e7d32; }
    .res-status-badge.pending { background: #fff3e0; color: #ef6c00; }
    .res-status-badge.waitlisted { background: #f5f5f5; color: #616161; }

    .btn-confirm {
        background: #4caf50;
        color: white;
        border: none;
        padding: 0.25rem 0.75rem;
        border-radius: 4px;
        cursor: pointer;
    }

    .input-group {
        position: relative;
        margin-bottom: 0.5rem;
    }

    /* Custom Dropdown Styles */
    .custom-dropdown {
        position: relative;
    }
    .dropdown-menu {
        position: absolute;
        top: 100%;
        left: 0;
        width: 100%;
        max-height: 300px;
        overflow-y: auto;
        background: white;
        border: 1px solid #ddd;
        border-radius: 4px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        z-index: 1000;
        list-style: none;
        padding: 0;
        margin: 4px 0 0 0;
    }
    .dropdown-menu li {
        border-bottom: 1px solid #eee;
    }
    .dropdown-menu li:last-child {
        border-bottom: none;
    }
    .dropdown-menu button {
        width: 100%;
        text-align: left;
        padding: 0.75rem;
        background: none;
        border: none;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        cursor: pointer;
        transition: background 0.2s;
    }
    .dropdown-menu button:hover {
        background: #f5f5f5;
    }
    .mini-thumb {
        width: 40px;
        height: 40px;
        border-radius: 4px;
        object-fit: cover;
        background: #eee;
    }
    .game-option-info {
        display: flex;
        flex-direction: column;
    }
    .game-option-info .name {
        font-weight: 500;
        color: #333;
    }
    .game-option-info .meta {
        font-size: 0.8rem;
        color: #888;
    }

    .winner-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
        margin-bottom: 0.5rem;
    }
    .winner-row .winner-option {
        flex: 1;
        margin-bottom: 0;
    }
    .score-input {
        width: 80px;
        padding: 0.75rem;
        border: 1px solid #ddd;
        border-radius: 8px;
    }

    /* New Settings & Inline Add Styles */
    .settings-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 1.5rem;
    }
    .settings-card {
        background: white;
        padding: 1.5rem;
        border-radius: 12px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.05);
        border: 1px solid #eee;
    }
    .settings-card h3 {
        margin-top: 0;
        margin-bottom: 1.5rem;
        font-size: 1.1rem;
        color: #333;
        border-bottom: 2px solid #f0f0f0;
        padding-bottom: 0.5rem;
    }
    .setting-item {
        margin-bottom: 1.25rem;
    }
    .setting-item label {
        display: block;
        font-size: 0.9rem;
        font-weight: 600;
        color: #666;
        margin-bottom: 0.5rem;
    }
    .setting-item input {
        width: 100%;
        padding: 0.6rem;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 1rem;
    }
    .setting-item .hint {
        font-size: 0.8rem;
        color: #888;
        margin-top: 0.25rem;
    }
    .inline-add-form {
        display: flex;
        gap: 0.5rem;
        align-items: center;
    }
    .attendee-select-mini, .session-select-mini {
        padding: 0.4rem;
        border-radius: 6px;
        border: 1px solid #ddd;
        font-size: 0.85rem;
    }
    .btn-mini {
        padding: 0.4rem 0.8rem;
        background: #4c6ef5;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.85rem;
        font-weight: 600;
    }
    .btn-mini:hover {
        background: #3b5bdb;
    }
    .btn-manager-toggle {
        background: #e9ecef;
        color: #495057;
        border: 1px solid #ced4da;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-size: 0.8rem;
        cursor: pointer;
    }
    .btn-manager-toggle.active {
        background: #ffd43b;
        color: #212529;
        border-color: #fcc419;
        font-weight: bold;
    }
    .btn-manager-toggle:hover {
        opacity: 0.9;
    }
</style>

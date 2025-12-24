<script lang="ts">
    import type { PageData } from './$types';
    import { enhance } from '$app/forms';

    export let data: PageData;

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
    let removeTarget: any = null;

    function handleRemove(attendee: any) {
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
            input.value = attendee.id;
            form.appendChild(input);
            document.body.appendChild(form);
            form.submit();
        }
    }

    // End Game Modal State
    let endGameModalVisible = false;
    let selectedEndGame: any = null;

    function openEndGameModal(game: any) {
        selectedEndGame = game;
        endGameModalVisible = true;
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

    function selectGame(game: any) {
        selectedGameName = game.name;
        selectedGameId = game.id;
        selectedDuration = game.playtime_min;
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

    $: filteredGames = data.allGames?.filter((g: any) => 
        g.name.toLowerCase().includes(selectedGameName.toLowerCase())
    ) || [];

    $: {
        const libraryGame = data.allGames?.find((g: any) => g.name === selectedGameName);
        const historyGame = data.savedGameNames.find((g: any) => g.game_name === selectedGameName);
        
        if (libraryGame) {
            selectedGameId = libraryGame.id;
            selectedDuration = libraryGame.playtime_min;
        } else if (historyGame && !libraryGame) { // Only fallback if not in library
            selectedGameId = '';
            selectedDuration = historyGame.duration;
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
        {#each data.attendees as attendee}
            <li>
                <div class="attendee-info">
                    <a href="/admin/attendees/{attendee.id}" class="attendee-link">{attendee.name}</a>
                    <span class="arrival-time">{formatTime(attendee.arrival_time)} 입장</span>
                </div>
                <form method="POST" action="?/removeAttendee" use:enhance={({ cancel }) => {
                    if (attendee.is_playing) {
                        cancel(); // Stop default submission
                        handleRemove(attendee); // Open modal
                    }
                }} style="display:inline;">
                    <input type="hidden" name="id" value={attendee.id} />
                    <button type="submit" class="btn-delete">퇴장</button>
                </form>
            </li>
        {/each}
    </ul>

    <form method="POST" action="?/addAttendee" use:enhance={() => {
        return async ({ result, update }) => {
            if (result.type === 'failure') {
                const data = result.data as { error?: string, missing?: boolean };
                if (data?.missing) {
                    showAlert('필수 입력 항목을 입력해주세요.');
                } else {
                    showAlert(data?.error || '오류가 발생했습니다.');
                }
            }
            await update();
        };
    }} class="add-form">
        <input type="text" name="name" placeholder="이름 입력" required />
        <button type="submit">인원 추가</button>
    </form>

    {#if data.savedMembers.length > 0}
        <div class="quick-add">
            <h3>저장된 멤버 (클릭하여 추가)</h3>
            <div class="member-chips">
                {#each data.savedMembers as member}
                    <div class="chip-container">
                        <a href="/admin/attendees/{member.id}" class="chip-link">{member.name}</a>
                        <form method="POST" action="?/addAttendee" use:enhance={() => {
                            return async ({ result, update }) => {
                                if (result.type === 'failure') {
                                    const data = result.data as { error?: string, missing?: boolean };
                                    if (data?.missing) {
                                        showAlert('필수 입력 항목을 입력해주세요.');
                                    } else {
                                        showAlert(data?.error || '오류가 발생했습니다.');
                                    }
                                }
                                await update();
                            };
                        }} style="display:inline;">
                            <input type="hidden" name="name" value={member.name} />
                            <button type="submit" class="chip-add" title="입장">+</button>
                        </form>
                    </div>
                {/each}
            </div>
        </div>
    {/if}
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
        {#each data.games as game}
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
        {#if data.games.length === 0}
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
                return async ({ result, update }) => {
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

                <input type="number" name="duration" placeholder="소요 시간 (분)" bind:value={selectedDuration} required />
                
                <div class="player-select">
                    <p>참여자 선택:</p>
                    {#each data.attendees as attendee}
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
                return async ({ result, update }) => {
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
                    {#each selectedEndGame.players as player}
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
    button {
        padding: 0.5rem 1rem;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
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
</style>

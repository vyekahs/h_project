<script lang="ts">
    import type { PageData } from './$types';
    import { enhance } from '$app/forms';

    export let data: PageData;

    let showModal = false;
    let selectedGameName = '';
    let selectedDuration = '';

    $: {
        const savedGame = data.savedGameNames.find((g: any) => g.game_name === selectedGameName);
        if (savedGame) {
            selectedDuration = savedGame.duration;
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
</script>

<div class="container">
    <div class="header">
        <h1>관리자 대시보드</h1>
        <button class="btn-primary" on:click={() => {
            showModal = true;
            selectedGameName = '';
            selectedDuration = '';
        }}>+ 새 게임 시작</button>
    </div>

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
                    {attendee.name}
                    <form method="POST" action="?/removeAttendee" use:enhance={({ cancel, formData }) => {
                        if (attendee.is_playing) {
                            if (confirm('이 사용자는 현재 게임 중입니다. 게임도 함께 종료하시겠습니까?\n\n[확인]: 게임 종료 및 퇴장\n[취소]: 사용자만 퇴장')) {
                                formData.append('endGame', 'true');
                                formData.append('gameId', attendee.game_id);
                            } else {
                                if (!confirm('정말 퇴장시키겠습니까?')) {
                                    return cancel();
                                }
                                if (confirm('참여 중인 게임도 함께 종료하시겠습니까?')) {
                                    formData.append('endGame', 'true');
                                    formData.append('gameId', attendee.game_id);
                                }
                            }
                        }
                    }} style="display:inline;">
                        <input type="hidden" name="id" value={attendee.id} />
                        <button type="submit" class="btn-delete">퇴장</button>
                    </form>
                </li>
            {/each}
        </ul>

        <form method="POST" action="?/addAttendee" use:enhance class="add-form">
            <input type="text" name="name" placeholder="이름 입력" required />
            <button type="submit">인원 추가</button>
        </form>

        {#if data.savedMembers.length > 0}
            <div class="quick-add">
                <h3>저장된 멤버 (클릭하여 추가)</h3>
                <div class="member-chips">
                    {#each data.savedMembers as member}
                        <form method="POST" action="?/addAttendee" use:enhance style="display:inline;">
                            <input type="hidden" name="name" value={member} />
                            <button type="submit" class="chip">{member}</button>
                        </form>
                    {/each}
                </div>
            </div>
        {/if}
    </section>

    <section>
        <h2>진행 중인 게임</h2>
        <div class="games-grid">
            {#each data.games as game}
                <div class="game-card">
                    <h3>{game.game_name}</h3>
                    <p>참여자: {game.players.join(', ')}</p>
                    <p>종료 예정: {new Date(game.end_time).toLocaleTimeString()} <span class="time-remaining">({getTimeRemaining(game.end_time)})</span></p>
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
                        <form method="POST" action="?/endGame" use:enhance>
                            <input type="hidden" name="id" value={game.id} />
                            <button type="submit" class="btn-delete">게임 종료</button>
                        </form>
                    </div>
                </div>
            {/each}
            {#if data.games.length === 0}
                <p class="empty-state">진행 중인 게임이 없습니다.</p>
            {/if}
        </div>
    </section>
</div>

{#if showModal}
    <div class="modal-backdrop" on:click={() => showModal = false}>
        <div class="modal-content" on:click|stopPropagation>
            <h2>새 게임 시작</h2>
            <form method="POST" action="?/createGame" use:enhance={() => {
                return async ({ update }) => {
                    await update();
                    showModal = false;
                };
            }} class="game-form">
                <input type="text" name="gameName" placeholder="게임 이름" list="game-list" bind:value={selectedGameName} required />
                <datalist id="game-list">
                    {#each data.savedGameNames as game}
                        <option value={game.game_name} />
                    {/each}
                </datalist>
                <input type="number" name="duration" placeholder="소요 시간 (분)" bind:value={selectedDuration} required />
                
                <div class="player-select">
                    <p>참여자 선택:</p>
                    {#each data.attendees as attendee}
                        <label class:disabled={attendee.is_playing}>
                            <input type="checkbox" name="players" value={attendee.name} disabled={attendee.is_playing} />
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

<style>
    .container {
        max-width: 800px;
        margin: 0 auto;
        padding: 2rem;
        font-family: sans-serif;
    }
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
    .chip {
        background: #e0e0e0;
        color: #333;
        border: none;
        padding: 0.25rem 0.75rem;
        border-radius: 16px;
        font-size: 0.85rem;
        cursor: pointer;
        transition: background 0.2s;
    }
    .chip:hover {
        background: #d0d0d0;
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
    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
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
    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 1rem;
        margin-top: 1.5rem;
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
</style>

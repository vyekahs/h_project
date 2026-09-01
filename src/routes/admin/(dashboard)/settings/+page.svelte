<script lang="ts">
    import { enhance } from '$app/forms';
    import type { PageData } from './$types';

    export let data: PageData;
</script>

<div class="container">
    <header>
        <h1>설정</h1>
    </header>

    <div class="settings-grid">
        <form method="POST" action="?/updateSettings" use:enhance class="settings-card">
            <h3>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                운영 시간 설정
            </h3>
            <div 
                class="setting-item">
                <label for="openingTime">평일 오픈 시간</label>
                <input type="time" id="openingTime" name="opening_time" value={data.settings.opening_time} />
            </div>
            <div class="setting-item">
                <label for="closingWeekday">평일 마감 시간</label>
                <input type="time" id="closingWeekday" name="closing_time_weekday" value={data.settings.closing_time_weekday} />
            </div>
            <div class="setting-item">
                <label for="closingWeekend">주말 마감 시간</label>
                <input type="time" id="closingWeekend" name="closing_time_weekend" value={data.settings.closing_time_weekend} />
            </div>
            <div class="setting-item">
                <label for="weekendDays">주말 요일 (0:일, 6:토)</label>
                <input type="text" id="weekendDays" name="weekend_days" value={data.settings.weekend_days} placeholder="5,6" />
            </div>
            <button type="submit" class="btn-primary full-width">시간 설정 저장</button>
        </form>

        <form method="POST" action="?/updateSettings" use:enhance class="settings-card">
            <h3>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg>
                예약 및 페널티 정책
            </h3>
            <div class="setting-item">
                <label for="noShowLimit">노쇼 판단 (분)</label>
                <input type="number" id="noShowLimit" name="no_show_limit_minutes" value={data.settings.no_show_limit_minutes} />
                <p class="hint">
                    게임 시작 {data.settings.no_show_limit_minutes}분 후까지 방에 없으면 대시보드의 대기·승인 큐에
                    노쇼 후보로 표시됩니다. 자동 취소되지는 않고, 운영자가 판단합니다.
                </p>
            </div>
            <div class="setting-item">
                <label for="autoDissolve">자동 폭파 (분)</label>
                <input type="number" id="autoDissolve" name="auto_dissolve_limit_minutes" value={data.settings.auto_dissolve_limit_minutes} />
                <p class="hint">
                    시작 {data.settings.auto_dissolve_limit_minutes}분 전 인원 미달 기준값입니다.
                    현재 자동 삭제는 동작하지 않고, 예정 게임 상세의 「게임 폭파」로 직접 처리합니다.
                </p>
            </div>
            <div class="setting-item">
                <label for="penaltyThreshold">페널티 제한 기준 (점)</label>
                <input type="number" id="penaltyThreshold" name="penalty_threshold" value={data.settings.penalty_threshold} />
                <p class="hint">{data.settings.penalty_threshold}점 이상 시 예약 제한</p>
            </div>
            <button type="submit" class="btn-primary full-width">정책 설정 저장</button>
        </form>

        <section class="settings-card">
            <h3>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                관리자 계정
            </h3>
            <p class="hint account-hint">이 기기에서 관리자 세션을 종료합니다.</p>
            <form method="POST" action="/logout">
                <button type="submit" class="btn-logout full-width">로그아웃</button>
            </form>
        </section>
    </div>
</div>

<style>
    .container {
        max-width: 900px;
    }
    header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
    }
    h1 {
        margin: 0;
    }
    .settings-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 2rem;
    }
    .settings-card {
        background: var(--bg-primary);
        padding: var(--space-5);
        border-radius: var(--radius-card);
        border: 1px solid var(--border-default);
    }
    h3 {
        margin-top: 0;
        margin-bottom: 1.5rem;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid #eee;
        font-size: var(--text-lg);
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .setting-item {
        margin-bottom: 1.5rem;
    }
    label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 500;
        color: #333;
    }
    input {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: var(--radius-control);
        font-size: var(--text-base);
    }
    .hint {
        margin: 0.25rem 0 0;
        font-size: var(--text-sm);
        color: #666;
    }
    .account-hint {
        margin: 0 0 0.75rem;
    }
    .btn-logout {
        background: var(--bg-primary, #fff);
        color: var(--color-red-dark, #d32f2f);
        border: 1px solid var(--color-red-dark, #d32f2f);
        padding: 0.75rem;
        min-height: 44px;
        border-radius: var(--radius-control);
        font-size: var(--text-base);
        font-weight: 600;
        cursor: pointer;
    }
    .btn-logout:hover {
        background: var(--color-error-bg, #ffebee);
    }
    .btn-primary {
        background: var(--color-blue-bright);
        color: white;
        border: none;
        padding: 0.75rem;
        border-radius: var(--radius-control);
        font-size: var(--text-base);
        cursor: pointer;
        transition: background 0.2s;
    }
    .btn-primary:hover {
        background: #0056b3;
    }
    .full-width {
        width: 100%;
    }

    /* 폰은 서서 한 손으로 쓰는 주 사용 장면 — 탭 타깃을 44px 아래로 줄이지 않는다 */
    @media (max-width: 768px) {
        button,
        input:not([type='hidden']):not([type='checkbox']) {
            min-height: 44px;
        }
    }
</style>

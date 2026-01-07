<script lang="ts">
    import { enhance } from '$app/forms';
    import type { PageData } from './$types';

    export let data: PageData;
</script>

<div class="container">
    <header>
        <h1>⚙️ 시스템 설정</h1>
        <a href="/admin" class="btn-back">← 대시보드로 돌아가기</a>
    </header>

    <div class="settings-grid">
        <form method="POST" action="?/updateSettings" use:enhance class="settings-card">
            <h3>🕒 운영 시간 설정</h3>
            <div class="setting-item">
                <label>평일 마감 시간</label>
                <input type="time" name="closing_time_weekday" value={data.settings.closing_time_weekday} />
            </div>
            <div class="setting-item">
                <label>주말 마감 시간</label>
                <input type="time" name="closing_time_weekend" value={data.settings.closing_time_weekend} />
            </div>
            <div class="setting-item">
                <label>주말 요일 (0:일, 6:토)</label>
                <input type="text" name="weekend_days" value={data.settings.weekend_days} placeholder="5,6" />
            </div>
            <button type="submit" class="btn-primary full-width">시간 설정 저장</button>
        </form>

        <form method="POST" action="?/updateSettings" use:enhance class="settings-card">
            <h3>⚖️ 예약 및 페널티 정책</h3>
            <div class="setting-item">
                <label>노쇼 판단 (분)</label>
                <input type="number" name="no_show_limit_minutes" value={data.settings.no_show_limit_minutes} />
                <p class="hint">시작 시간 {data.settings.no_show_limit_minutes}분 후까지 미도착 시 자동 취소</p>
            </div>
            <div class="setting-item">
                <label>자동 폭파 (분)</label>
                <input type="number" name="auto_dissolve_limit_minutes" value={data.settings.auto_dissolve_limit_minutes} />
                <p class="hint">시작 {data.settings.auto_dissolve_limit_minutes}분 전 인원 미달 시 자동 삭제</p>
            </div>
            <div class="setting-item">
                <label>페널티 제한 기준 (점)</label>
                <input type="number" name="penalty_threshold" value={data.settings.penalty_threshold} />
                <p class="hint">{data.settings.penalty_threshold}점 이상 시 예약 제한</p>
            </div>
            <button type="submit" class="btn-primary full-width">정책 설정 저장</button>
        </form>
    </div>
</div>

<style>
    .container {
        max-width: 800px;
        margin: 0 auto;
        padding: 2rem;
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
    .btn-back {
        text-decoration: none;
        color: #666;
        padding: 0.5rem 1rem;
        border: 1px solid #ddd;
        border-radius: 4px;
        transition: all 0.2s;
    }
    .btn-back:hover {
        background: #f5f5f5;
        color: #333;
    }
    .settings-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 2rem;
    }
    .settings-card {
        background: white;
        padding: 1.5rem;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        border: 1px solid #eee;
    }
    h3 {
        margin-top: 0;
        margin-bottom: 1.5rem;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid #eee;
        font-size: 1.2rem;
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
        border-radius: 4px;
        font-size: 1rem;
    }
    .hint {
        margin: 0.25rem 0 0;
        font-size: 0.85rem;
        color: #666;
    }
    .btn-primary {
        background: #007bff;
        color: white;
        border: none;
        padding: 0.75rem;
        border-radius: 4px;
        font-size: 1rem;
        cursor: pointer;
        transition: background 0.2s;
    }
    .btn-primary:hover {
        background: #0056b3;
    }
    .full-width {
        width: 100%;
    }
</style>

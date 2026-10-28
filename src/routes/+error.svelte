<script lang="ts">
    import { page } from '$app/stores';

    /**
     * 앱 안에서 뜨는 오류 화면.
     *
     * 이게 없으면 SvelteKit 기본 화면("404 Not Found"만 적힌 흰 페이지)이 뜬다.
     * 회원 입장에서는 앱이 깨진 것과 구분되지 않는다.
     *
     * 서버가 아예 꺼진 경우는 여기까지 오지 못한다 — 그때는 서비스워커가
     * static/offline.html을 내보낸다.
     */
    const status = $derived($page.status);
    const isNotFound = $derived(status === 404);
    const isServerError = $derived(status >= 500);
</script>

<div class="error-page">
    <div class="mark">{isNotFound ? '🔍' : isServerError ? '🔧' : '⚠️'}</div>

    {#if isNotFound}
        <h1>없는 페이지예요</h1>
        <p>주소가 바뀌었거나 지워진 화면입니다.</p>
    {:else if isServerError}
        <h1>잠시 문제가 있습니다</h1>
        <p>
            서버가 응답하지 못했습니다.<br />
            잠깐 뒤에 다시 시도해 주세요.
        </p>
    {:else}
        <h1>요청을 처리하지 못했습니다</h1>
        <p>{$page.error?.message ?? '알 수 없는 오류입니다.'}</p>
    {/if}

    <div class="actions">
        {#if !isNotFound}
            <button type="button" onclick={() => location.reload()}>다시 시도</button>
        {/if}
        <a href="/" class:primary={isNotFound}>처음으로</a>
    </div>

    <!-- 오류 코드는 작게 둔다. 운영자가 물어볼 때 필요하지만
         회원에게 가장 먼저 보여야 할 정보는 아니다. -->
    <p class="code">오류 {status}</p>
</div>

<style>
    .error-page {
        max-width: 24rem;
        margin: 0 auto;
        padding: 3rem 1.5rem;
        text-align: center;
    }
    .mark {
        font-size: 3rem;
        line-height: 1;
        margin-bottom: 1.25rem;
    }
    h1 {
        font-size: 1.25rem;
        font-weight: 700;
        margin: 0 0 0.625rem;
        color: var(--text-primary);
    }
    p {
        margin: 0;
        font-size: 0.9375rem;
        line-height: 1.65;
        color: var(--text-secondary);
    }
    .actions {
        margin-top: 1.75rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .actions button,
    .actions a {
        display: block;
        padding: 0.8125rem;
        font: inherit;
        font-size: 0.9375rem;
        font-weight: 600;
        text-align: center;
        text-decoration: none;
        border-radius: 0.75rem;
        border: 1px solid var(--border-default);
        background: var(--bg-secondary);
        color: var(--text-primary);
        cursor: pointer;
    }
    .actions button,
    .actions a.primary {
        background: var(--color-blue);
        border-color: var(--color-blue);
        color: var(--bg-primary);
    }
    .code {
        margin-top: 1.25rem;
        font-size: 0.75rem;
        color: var(--text-hint);
    }
</style>

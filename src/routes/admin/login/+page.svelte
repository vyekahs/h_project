<script lang="ts">
    import { enhance } from '$app/forms';
    let { form }: { form: any } = $props();
</script>

<div class="login-container">
    <div class="login-box">
        <h1>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            관리자 로그인
        </h1>
        <form method="POST" use:enhance>
            <div class="form-group">
                <input type="password" name="password" placeholder="관리자 비밀번호" required autocomplete="current-password" />
            </div>
            {#if form?.error}
                <p class="error">{form.error}</p>
            {/if}
            <button type="submit" class="btn-dark">로그인</button>
        </form>
        <a href="/" class="btn-secondary">← 메인으로 돌아가기</a>
    </div>
</div>

<style>
    .login-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background: #2c3e50;
        font-family: sans-serif;
        padding: 1rem;
    }
    .login-box {
        background: white;
        padding: 2rem;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        width: 100%;
        max-width: 320px;
        text-align: center;
    }
    h1 {
        font-size: 1.5rem;
        margin-bottom: 2rem;
        color: #333;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
    }
    .form-group {
        margin-bottom: 1rem;
    }
    input {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 1rem;
        box-sizing: border-box;
    }
    button {
        width: 100%;
        padding: 0.75rem;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 1rem;
        font-weight: bold;
        cursor: pointer;
        transition: background 0.2s;
    }
    /* 로그인은 콘솔 레이아웃 밖이라 어드민 포커스 링을 물려받지 못하고
       UA 기본 1px 링(#005fcc)에 의존했다. #333 버튼 위에서 거의 보이지 않는다. */
    :focus-visible {
        outline: 2px solid #111827;
        outline-offset: 2px;
        border-radius: 2px;
    }
    .btn-dark:focus-visible {
        outline-color: #9ec5fe;
    }
    .btn-dark {
        background: #333;
    }
    .btn-dark:hover {
        background: #000;
    }
    .error {
        color: #d32f2f;
        margin-bottom: 1rem;
        font-size: 0.9rem;
    }
    .btn-secondary {
        display: block;
        margin-top: 1rem;
        width: 100%;
        padding: 0.75rem;
        background: #f1f3f5;
        color: #495057;
        text-decoration: none;
        border-radius: 6px;
        font-size: 1rem;
        font-weight: bold;
        box-sizing: border-box;
        transition: background 0.2s;
    }
    .btn-secondary:hover {
        background: #e9ecef;
    }
</style>

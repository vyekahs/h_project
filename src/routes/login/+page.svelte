<script lang="ts">
    import { enhance } from '$app/forms';
    import { page } from '$app/stores';
    export let form;
</script>

<div class="login-container">
    <div class="login-box">
        <h1>🔐 로그인</h1>
        
        <form method="POST" use:enhance>
            <div class="form-group">
                <input type="text" name="name" placeholder="이름 (닉네임)" required />
            </div>
            <div class="form-group">
                <input type="password" name="password" placeholder="비밀번호" required autocomplete="current-password" />
            </div>
            {#if form?.error}
                <p class="error">{form.error}</p>
            {/if}
            <button type="submit" class="btn-primary">로그인</button>
        </form>
        <a href="/signup{$page.url.search}" class="signup-link">계정이 없으신가요? 회원가입</a>
        
        <a href="/" class="back-link">← 메인으로 돌아가기</a>
    </div>
</div>

<style>
    .login-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background: var(--bg-elevated);
        font-family: sans-serif;
        padding: 1rem;
    }
    .login-box {
        background: var(--bg-primary);
        padding: 2rem;
        border-radius: 12px;
        box-shadow: 0 4px 12px var(--shadow-md);
        width: 100%;
        max-width: 360px;
        text-align: center;
    }
    h1 {
        font-size: 1.5rem;
        margin-bottom: 1.5rem;
        color: var(--text-primary);
    }
    .form-group {
        margin-bottom: 1rem;
    }
    input {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        font-size: 1rem;
        box-sizing: border-box;
    }
    button[type="submit"] {
        width: 100%;
        padding: 0.75rem;
        color: var(--bg-primary);
        border: none;
        border-radius: 6px;
        font-size: 1rem;
        font-weight: bold;
        cursor: pointer;
        transition: background 0.2s;
    }
    .btn-primary {
        background: var(--color-blue-bright);
    }
    .btn-primary:hover {
        background: var(--color-blue-bright);
    }
    .error {
        color: var(--color-red-dark);
        margin-bottom: 1rem;
        font-size: 0.9rem;
    }
    .back-link, .signup-link {
        display: block;
        margin-top: 1.5rem;
        color: var(--text-secondary);
        text-decoration: none;
        font-size: 0.9rem;
    }
    .back-link:hover, .signup-link:hover {
        text-decoration: underline;
    }
    .signup-link {
        color: var(--color-blue-bright);
        margin-top: 1rem;
    }
</style>

<script lang="ts">
    import { enhance } from '$app/forms';
    export let form;
</script>

<div class="login-container">
    <div class="login-box">
        <h1>🔐 관리자 로그인</h1>
        <form method="POST" use:enhance>
            <div class="form-group">
                <input type="password" name="password" placeholder="비밀번호를 입력하세요" required />
            </div>
            {#if form?.error}
                <p class="error">{form.error}</p>
            {/if}
            <button type="submit">로그인</button>
        </form>
        <a href="/" class="back-link">← 메인으로 돌아가기</a>
    </div>
</div>

<style>
    .login-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background: #f0f2f5;
        font-family: sans-serif;
    }
    .login-box {
        background: white;
        padding: 2rem;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        width: 100%;
        max-width: 320px;
        text-align: center;
    }
    h1 {
        font-size: 1.5rem;
        margin-bottom: 2rem;
        color: #333;
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
        background: #333;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 1rem;
        font-weight: bold;
        cursor: pointer;
        transition: background 0.2s;
    }
    button:hover {
        background: #000;
    }
    .error {
        color: #d32f2f;
        margin-bottom: 1rem;
        font-size: 0.9rem;
    }
    .back-link {
        display: block;
        margin-top: 1.5rem;
        color: #666;
        text-decoration: none;
        font-size: 0.9rem;
    }
    .back-link:hover {
        text-decoration: underline;
    }
</style>

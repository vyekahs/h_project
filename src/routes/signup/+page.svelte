<script lang="ts">
    import { enhance } from '$app/forms';
    export let form;
</script>

<div class="auth-container">
    <div class="auth-box">
        <h1>📝 회원가입</h1>
        <form method="POST" use:enhance>
            <div class="form-group">
                <label for="name">이름 (닉네임)</label>
                <input type="text" id="name" name="name" placeholder="사용할 이름을 입력하세요" required />
            </div>
            <div class="form-group">
                <label for="password">비밀번호</label>
                <input type="password" id="password" name="password" placeholder="비밀번호" required />
            </div>
            <div class="form-group">
                <label for="confirmPassword">비밀번호 확인</label>
                <input type="password" id="confirmPassword" name="confirmPassword" placeholder="비밀번호 확인" required />
            </div>
            {#if form?.error}
                <p class="error">{form.error}</p>
            {/if}
            <button type="submit">가입하기</button>
        </form>
        <div class="links">
            <a href="/login">이미 계정이 있으신가요? 로그인</a>
            <a href="/">메인으로 돌아가기</a>
        </div>
    </div>
</div>

<style>
    .auth-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background: #f0f2f5;
        font-family: sans-serif;
        padding: 1rem;
    }
    .auth-box {
        background: white;
        padding: 2rem;
        border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        width: 100%;
        max-width: 400px;
    }
    h1 {
        text-align: center;
        font-size: 1.5rem;
        margin-bottom: 2rem;
        color: #333;
    }
    .form-group {
        margin-bottom: 1rem;
    }
    label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 500;
        color: #555;
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
        background: #007bff;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 1rem;
        font-weight: bold;
        cursor: pointer;
        transition: background 0.2s;
        margin-top: 1rem;
    }
    button:hover {
        background: #0056b3;
    }
    .error {
        color: #d32f2f;
        margin-bottom: 1rem;
        font-size: 0.9rem;
        text-align: center;
    }
    .links {
        margin-top: 1.5rem;
        text-align: center;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .links a {
        color: #666;
        text-decoration: none;
        font-size: 0.9rem;
    }
    .links a:hover {
        text-decoration: underline;
        color: #007bff;
    }
</style>

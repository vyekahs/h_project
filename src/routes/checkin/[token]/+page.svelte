<script lang="ts">
    export let data;
</script>

<div class="checkin-container">
    <div class="card">
        {#if data.success}
            <div class="icon success">✅</div>
            <h1>입장 완료!</h1>
            <p class="message">환영합니다, <strong>{data.user.name}</strong>님!</p>
            <p class="sub-message">즐거운 보드게임 시간 되세요.</p>
            <a href="/" class="btn-home">메인으로 이동</a>
        {:else}
            <div class="icon error">❌</div>
            <h1>체크인 실패</h1>
            <p class="message">{data.error}</p>
            <a href="/" class="btn-home">메인으로 이동</a>
        {/if}
    </div>
</div>

<style>
    .checkin-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background: #f0f2f5;
        font-family: sans-serif;
        padding: 1rem;
    }
    .card {
        background: white;
        padding: 3rem 2rem;
        border-radius: 20px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        text-align: center;
        width: 100%;
        max-width: 360px;
    }
    .icon {
        font-size: 4rem;
        margin-bottom: 1.5rem;
    }
    h1 {
        margin: 0 0 1rem 0;
        color: #333;
    }
    .message {
        font-size: 1.2rem;
        color: #555;
        margin-bottom: 0.5rem;
    }
    .sub-message {
        color: #888;
        margin-bottom: 2rem;
    }
    .btn-home {
        display: inline-block;
        padding: 0.75rem 2rem;
        background: #007bff;
        color: white;
        text-decoration: none;
        border-radius: 25px;
        font-weight: bold;
        transition: background 0.2s;
    }
    .btn-home:hover {
        background: #0056b3;
    }
</style>

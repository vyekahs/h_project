<script lang="ts">
    import { onMount } from 'svelte';
    
    // In a real app, this might come from a DB or config
    const games = [
        {
            id: 'sudoku',
            name: '스도쿠',
            description: '논리적인 숫자 채우기 퍼즐입니다.',
            icon: '🧩',
            url: '/games/sudoku',
            color: '#bbdefb'
        }
    ];
</script>

<div class="lounge-container">
    <header>
        <h1>🎮 오락실</h1>
        <p>잠깐 쉬어가는 시간! 미니게임을 즐겨보세요.</p>
    </header>

    <div class="games-grid">
        {#each games as game}
            <a href={game.url} class="game-card" style="--card-color: {game.color}">
                <div class="icon">{game.icon}</div>
                <div class="info">
                    <h2>{game.name}</h2>
                    <p>{game.description}</p>
                </div>
                <div class="play-btn">플레이</div>
            </a>
        {/each}
        
        <!-- Coming Soon Placeholder -->
        <div class="game-card coming-soon">
            <div class="icon">🚧</div>
            <div class="info">
                <h2>준비 중</h2>
                <p>새로운 게임을 기대해주세요!</p>
            </div>
        </div>
    </div>
</div>

<style>
    .lounge-container {
        padding: 2rem;
        max-width: 800px;
        margin: 0 auto;
        min-height: 80vh;
    }

    header {
        text-align: center;
        margin-bottom: 3rem;
    }

    header h1 {
        font-size: 2.5rem;
        margin-bottom: 0.5rem;
        color: #333;
    }

    header p {
        color: #666;
    }

    .games-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 2rem;
    }

    .game-card {
        background: white;
        border-radius: 16px;
        padding: 2rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        text-decoration: none;
        color: #333;
        box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        transition: transform 0.2s, box-shadow 0.2s;
        border: 2px solid transparent;
        position: relative;
        overflow: hidden;
    }

    .game-card:hover {
        transform: translateY(-5px);
        box-shadow: 0 8px 25px rgba(0,0,0,0.15);
        border-color: var(--card-color);
    }

    .game-card .icon {
        font-size: 4rem;
        margin-bottom: 1rem;
    }

    .game-card .info h2 {
        margin: 0 0 0.5rem 0;
        font-size: 1.5rem;
    }

    .game-card .info p {
        margin: 0;
        color: #666;
        font-size: 0.9rem;
        line-height: 1.4;
    }
    
    .play-btn {
        margin-top: 1.5rem;
        background: #333;
        color: white;
        padding: 0.5rem 1.5rem;
        border-radius: 20px;
        font-weight: bold;
        opacity: 0;
        transform: translateY(10px);
        transition: all 0.2s;
    }
    
    .game-card:hover .play-btn {
        opacity: 1;
        transform: translateY(0);
    }

    .coming-soon {
        background: #f5f5f5;
        opacity: 0.7;
        cursor: default;
        box-shadow: none;
    }
    
    .coming-soon:hover {
        transform: none;
        border-color: transparent;
        box-shadow: none;
    }
</style>

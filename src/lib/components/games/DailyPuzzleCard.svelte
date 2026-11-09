<script lang="ts">
	import { formatTime } from '$lib/games/utils';
	import type { DailyBoard } from '$lib/games/dailyPuzzle';

	let { board }: { board: DailyBoard } = $props();

	const href = '/minigames/water-sort?daily=1';
	const medal = ['🥇', '🥈', '🥉'];
</script>

<section class="daily-card" aria-label="오늘의 퍼즐">
	<div class="daily-head">
		<span class="daily-title">🧩 오늘의 퍼즐 <span class="daily-game">워터소트</span></span>
		{#if board.streak > 0}
			<span class="daily-streak">🔥 {board.streak}일 연속</span>
		{/if}
	</div>

	{#if board.mine}
		<div class="daily-mine">
			<span class="mine-label">내 기록</span>
			<span class="mine-value">{formatTime(board.mine.clearTime)} · {board.mine.moves}회</span>
			<span class="mine-rank">{board.mine.rank}위 / {board.total}명</span>
		</div>
	{:else}
		<a class="daily-cta" {href}>오늘 문제 풀기</a>
	{/if}

	{#if board.top.length > 0}
		<ol class="daily-top">
			{#each board.top.slice(0, 3) as entry (entry.userId)}
				<li class:me={entry.userId === board.mine?.userId}>
					<span class="top-rank">{medal[entry.rank - 1] ?? `${entry.rank}`}</span>
					<span class="top-name">{entry.name}</span>
					<span class="top-time">{formatTime(entry.clearTime)}</span>
				</li>
			{/each}
		</ol>
		<p class="daily-foot">
			오늘 {board.total}명 참여
			{#if board.mine}· <a class="daily-again" {href}>다시 풀기 (기록 안 남음)</a>{/if}
		</p>
	{:else}
		<p class="daily-foot">아직 아무도 안 풀었어요. 첫 번째가 되어 보세요!</p>
	{/if}
</section>

<style>
	.daily-card {
		margin: 0 0 1.5rem;
		padding: 14px 16px;
		border-radius: 16px;
		background: var(--glass-surface-medium);
		border: 1px solid var(--glass-border-strong);
		box-shadow: var(--shadow-sm);
	}
	.daily-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 10px;
	}
	.daily-title {
		font-size: 0.95rem;
		font-weight: 800;
		color: var(--text-primary);
	}
	.daily-game {
		margin-left: 4px;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-secondary);
	}
	.daily-streak {
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--color-amber-darker);
	}
	.daily-cta {
		display: block;
		text-align: center;
		padding: 10px;
		border-radius: 12px;
		background: var(--color-blue);
		color: var(--bg-primary);
		font-weight: 700;
		text-decoration: none;
	}
	.daily-mine {
		display: flex;
		align-items: baseline;
		gap: 8px;
		flex-wrap: wrap;
	}
	.mine-label {
		font-size: 0.8rem;
		color: var(--text-secondary);
	}
	.mine-value {
		font-weight: 700;
		color: var(--text-primary);
	}
	.mine-rank {
		margin-left: auto;
		font-weight: 800;
		color: var(--color-blue);
	}
	.daily-top {
		list-style: none;
		margin: 12px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.daily-top li {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.85rem;
		color: var(--text-primary);
	}
	.daily-top li.me .top-name {
		font-weight: 800;
	}
	.top-rank {
		width: 1.5em;
		text-align: center;
	}
	.top-name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.top-time {
		font-variant-numeric: tabular-nums;
		color: var(--text-secondary);
	}
	.daily-foot {
		margin: 10px 0 0;
		font-size: 0.75rem;
		color: var(--text-tertiary);
	}
	.daily-again {
		color: var(--text-secondary);
	}
</style>

<script lang="ts">
	interface WtpPost {
		id: number;
		game_id: number | null;
		game_name: string;
		message: string;
		created_by: number;
		creator_name: string;
		creator_title: string | null;
		image_url: string | null;
		min_players: number | null;
		max_players: number | null;
		created_at: string;
		participant_count: number;
		participants: { id: number; name: string; title_name: string | null }[];
		tags?: { id: number; name: string }[];
	}

	let {
		post,
		userId,
		onJoin,
		onLeave,
		onDetail,
	}: {
		post: WtpPost;
		userId: number | null;
		onJoin: (postId: number) => void;
		onLeave: (postId: number) => void;
		onDetail: (post: WtpPost) => void;
	} = $props();

	const isOwner = $derived(userId === post.created_by);
	const isParticipant = $derived(userId ? post.participants.some(p => p.id === userId) : false);

</script>

<div class="wtp-card" onclick={() => onDetail(post)} role="button" tabindex="0" onkeydown={(e) => { if (e.key === 'Enter') onDetail(post); }}>
	<div class="wtp-header">
		<div class="wtp-game-info">
			{#if post.image_url}
				<img src={post.image_url} alt={post.game_name} class="wtp-game-img" />
			{:else}
				<div class="wtp-game-img placeholder">🎲</div>
			{/if}
			<div class="wtp-title-area">
				<h3 class="wtp-game-name">{post.game_name}</h3>
				<span class="wtp-creator">
					{#if post.creator_title}
						<span class="wtp-creator-title">[ {post.creator_title} ]</span>
					{/if}
					{post.creator_name}
				</span>
			</div>
		</div>
	</div>

	<p class="wtp-message">{post.message}</p>

	{#if post.tags && post.tags.length > 0}
		<div class="wtp-tags-display">
			{#each post.tags as tag}
				<span class="wtp-tag-badge">{tag.name}</span>
			{/each}
		</div>
	{/if}

	<div class="wtp-footer">
		<div class="wtp-participants">
			<span class="wtp-count">{post.participant_count}명 참여</span>
			<div class="wtp-names">
				{#each post.participants.slice(0, 5) as p}
					<span class="wtp-name-tag">{p.name}</span>
				{/each}
				{#if post.participants.length > 5}
					<span class="wtp-more">+{post.participants.length - 5}</span>
				{/if}
			</div>
		</div>

		{#if userId}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="wtp-actions" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
				{#if isParticipant}
					<button class="wtp-btn leave" onclick={() => onLeave(post.id)}>나가기</button>
				{:else}
					<button class="wtp-btn join" onclick={() => onJoin(post.id)}>참여</button>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.wtp-card {
		background: var(--bg-primary);
		padding: 0.75rem 1rem;
		border-radius: 12px;
		box-shadow: 0 2px 4px var(--overlay-light);
		border: 1px solid var(--border-light);
		cursor: pointer;
		transition: transform 0.2s, box-shadow 0.2s;
	}
	.wtp-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px var(--shadow-sm);
	}

	.wtp-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.5rem;
	}
	.wtp-game-info {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-width: 0;
	}
	.wtp-game-img {
		width: 40px;
		height: 40px;
		border-radius: 8px;
		object-fit: cover;
		flex-shrink: 0;
	}
	.wtp-game-img.placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-secondary);
		font-size: 1.2rem;
	}
	.wtp-title-area {
		min-width: 0;
	}
	.wtp-game-name {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.wtp-creator {
		font-size: 0.75rem;
		color: var(--text-secondary);
	}
	.wtp-creator-title {
		color: var(--color-blue, #3b82f6);
		font-size: 0.7rem;
	}
	.wtp-message {
		margin: 0.4rem 0;
		font-size: 0.85rem;
		color: var(--text-primary);
		line-height: 1.4;
	}
	.wtp-tags-display {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-bottom: 0.3rem;
	}
	.wtp-tag-badge {
		display: inline-block;
		padding: 0.15rem 0.5rem;
		border-radius: 10px;
		background: var(--color-blue-light, #dbeafe);
		color: var(--color-blue-deep, #1d4ed8);
		font-size: 0.75rem;
		font-weight: 600;
	}

	.wtp-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.25rem;
	}
	.wtp-participants {
		min-width: 0;
	}
	.wtp-count {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-blue, #3b82f6);
	}
	.wtp-names {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-top: 0.15rem;
	}
	.wtp-name-tag {
		font-size: 0.7rem;
		background: var(--bg-secondary);
		padding: 0.1rem 0.4rem;
		border-radius: 4px;
		color: var(--text-secondary);
	}
	.wtp-more {
		font-size: 0.7rem;
		color: var(--text-secondary);
		padding: 0.1rem 0.25rem;
	}

	.wtp-actions {
		flex-shrink: 0;
	}
	.wtp-btn {
		padding: 0.3rem 0.75rem;
		border-radius: 8px;
		border: none;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s;
	}
	.wtp-btn.join {
		background: var(--color-blue, #3b82f6);
		color: white;
	}
	.wtp-btn.join:hover {
		opacity: 0.9;
	}
	.wtp-btn.leave {
		background: var(--bg-secondary);
		color: var(--text-secondary);
	}
	.wtp-btn.leave:hover {
		background: var(--border-light);
	}
	.wtp-btn.close {
		background: var(--bg-secondary);
		color: var(--color-red, #ef4444);
		border: 1px solid var(--color-red, #ef4444);
	}
	.wtp-btn.close:hover {
		background: var(--color-red, #ef4444);
		color: white;
	}
</style>

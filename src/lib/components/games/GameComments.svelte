<script lang="ts">
	import MentionInput from './MentionInput.svelte';

	let {
		gameId,
		userId,
		isAdmin = false,
		dark = false,
	}: {
		gameId: string;
		userId: number;
		isAdmin?: boolean;
		dark?: boolean;
	} = $props();

	interface Comment {
		id: number;
		game_id: string;
		user_id: number;
		content: string;
		created_at: string;
		nickname: string;
		title_name: string | null;
	}

	let comments: Comment[] = $state([]);
	let loading = $state(true);
	let loadingMore = $state(false);
	let hasMore = $state(false);
	let inputValue = $state('');
	let submitting = $state(false);
	let scrollContainer: HTMLDivElement | undefined = $state();
	let modalMessage = $state('');
	let showModal = $state(false);

	// Load initial comments
	$effect(() => {
		loadComments();
	});

	async function loadComments() {
		loading = true;
		try {
			const res = await fetch(`/api/game/comments/${gameId}?limit=20`);
			if (res.ok) {
				const data = await res.json();
				// API returns newest first, reverse for chat style (oldest on top)
				comments = (data.comments ?? []).reverse();
				hasMore = data.hasMore ?? false;
				// Scroll to bottom after initial load
				requestAnimationFrame(() => {
					if (scrollContainer) {
						scrollContainer.scrollTop = scrollContainer.scrollHeight;
					}
				});
			}
		} catch (e) {
			console.error('Failed to load comments', e);
		} finally {
			loading = false;
		}
	}

	async function loadOlder() {
		if (loadingMore || !hasMore || comments.length === 0) return;
		loadingMore = true;

		const oldestId = comments[0]?.id;
		const prevScrollHeight = scrollContainer?.scrollHeight ?? 0;

		try {
			const res = await fetch(`/api/game/comments/${gameId}?before=${oldestId}&limit=20`);
			if (res.ok) {
				const data = await res.json();
				const olderComments = (data.comments ?? []).reverse();
				comments = [...olderComments, ...comments];
				hasMore = data.hasMore ?? false;

				// Maintain scroll position
				requestAnimationFrame(() => {
					if (scrollContainer) {
						const newScrollHeight = scrollContainer.scrollHeight;
						scrollContainer.scrollTop = newScrollHeight - prevScrollHeight;
					}
				});
			}
		} catch (e) {
			console.error('Failed to load older comments', e);
		} finally {
			loadingMore = false;
		}
	}

	async function handleSubmit(content: string) {
		if (submitting) return;
		submitting = true;

		try {
			const res = await fetch(`/api/game/comments/${gameId}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content }),
			});

			if (res.ok) {
				const data = await res.json();
				comments = [...comments, data.comment];
				inputValue = '';

				// Scroll to bottom
				requestAnimationFrame(() => {
					if (scrollContainer) {
						scrollContainer.scrollTop = scrollContainer.scrollHeight;
					}
				});
			} else {
				const err = await res.json();
				modalMessage = err.error || '댓글 작성에 실패했습니다';
				showModal = true;
			}
		} catch {
			modalMessage = '댓글 작성에 실패했습니다';
			showModal = true;
		} finally {
			submitting = false;
		}
	}

	let deleteTargetId = $state<number | null>(null);
	let showDeleteConfirm = $state(false);

	function confirmDelete(commentId: number) {
		deleteTargetId = commentId;
		showDeleteConfirm = true;
	}

	async function executeDelete() {
		if (!deleteTargetId) return;
		showDeleteConfirm = false;
		try {
			const res = await fetch(`/api/game/comments/delete/${deleteTargetId}`, { method: 'DELETE' });
			if (res.ok) {
				comments = comments.filter(c => c.id !== deleteTargetId);
			} else {
				const err = await res.json();
				modalMessage = err.error || '삭제에 실패했습니다';
				showModal = true;
			}
		} catch {
			modalMessage = '삭제에 실패했습니다';
			showModal = true;
		}
		deleteTargetId = null;
	}

	function formatTimeAgo(dateStr: string): string {
		const now = Date.now();
		const date = new Date(dateStr).getTime();
		const diff = Math.floor((now - date) / 1000);

		if (diff < 60) return '방금 전';
		if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
		if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
		if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
		return new Date(dateStr).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
	}

	const isWtp = gameId.startsWith('wtp_');

	function renderContent(content: string): string {
		// Escape HTML first
		const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		// wtp에서는 멘션 하이라이트 안 함
		if (isWtp) return escaped;
		return escaped.replace(/@([\w가-힣]{1,50})/g, '<span class="mention">@$1</span>');
	}

	let wtpInputValue = $state('');
	function handleWtpKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && wtpInputValue.trim()) {
			e.preventDefault();
			handleSubmit(wtpInputValue.trim());
			wtpInputValue = '';
		}
	}
</script>

<div class="comments-container" class:dark>
	<!-- Scrollable comment list -->
	<p style="text-align: center; font-size: 0.8rem; color: var(--text-muted, #999); margin-bottom: 0.5rem;">아직 테스트 중인 기능입니다. 언제든지 없어질 수 있습니다.</p>
	<div class="comments-scroll" bind:this={scrollContainer}>
		{#if loading}
			<div class="empty-state">불러오는 중...</div>
		{:else if comments.length === 0}
			<div class="empty-state">
				<p>아직 댓글이 없습니다</p>
				<p class="empty-sub">첫 댓글을 남겨보세요!</p>
			</div>
		{:else}
			<!-- Load more button at top -->
			{#if hasMore}
				<div class="load-more-top">
					<button class="load-more-btn" onclick={loadOlder} disabled={loadingMore}>
						{loadingMore ? '불러오는 중...' : '이전 댓글 더 보기'}
					</button>
				</div>
			{/if}

			{#each comments as comment (comment.id)}
				<div class="comment-item">
					<div class="comment-header">
						<div class="comment-user">
							<span class="user-name">{comment.nickname}</span>
							{#if comment.title_name}
								<span class="user-title">{comment.title_name}</span>
							{/if}
						</div>
						<div class="comment-meta">
							<span class="comment-time">{formatTimeAgo(comment.created_at)}</span>
							{#if comment.user_id === userId || isAdmin}
								<button class="delete-btn" onclick={() => confirmDelete(comment.id)}>삭제</button>
							{/if}
						</div>
					</div>
					<div class="comment-content">
						{@html renderContent(comment.content)}
					</div>
				</div>
			{/each}
		{/if}
	</div>

	<!-- Fixed input at bottom -->
	<div class="input-area">
		{#if isWtp}
			<input
				type="text"
				class="wtp-chat-input"
				bind:value={wtpInputValue}
				onkeydown={handleWtpKeydown}
				placeholder="메시지를 입력하세요"
				disabled={submitting}
				maxlength="200"
			/>
		{:else}
			<p class="input-hint">1분에 한번씩만 작성할 수 있습니다</p>
			<MentionInput
				bind:value={inputValue}
				onsubmit={handleSubmit}
				disabled={submitting}
				{dark}
			/>
		{/if}
	</div>
</div>

<!-- Alert modal -->
{#if showModal}
	<div class="modal-overlay" onclick={() => showModal = false} onkeydown={(e) => e.key === 'Escape' && (showModal = false)} role="button" tabindex="-1">
		<div class="modal" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="presentation">
			<p class="modal-message">{modalMessage}</p>
			<button class="modal-btn" onclick={() => showModal = false}>확인</button>
		</div>
	</div>
{/if}

<!-- Delete confirm modal -->
{#if showDeleteConfirm}
	<div class="modal-overlay" onclick={() => showDeleteConfirm = false} onkeydown={(e) => e.key === 'Escape' && (showDeleteConfirm = false)} role="button" tabindex="-1">
		<div class="modal" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="presentation">
			<p class="modal-message">댓글을 삭제하시겠습니까?</p>
			<div class="modal-actions">
				<button class="modal-btn-secondary" onclick={() => showDeleteConfirm = false}>취소</button>
				<button class="modal-btn-danger" onclick={executeDelete}>삭제</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.comments-container {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	.comments-scroll {
		flex: 1;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-height: 0;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex: 1;
		color: var(--text-muted);
		font-size: 0.95rem;
		gap: 0.3rem;
	}

	.empty-sub {
		font-size: 0.8rem;
		color: var(--text-tertiary);
	}

	.load-more-top {
		text-align: center;
		padding: 0.5rem 0;
	}

	.load-more-btn {
		background: var(--bg-secondary);
		border: 1px solid var(--border-light);
		border-radius: 10px;
		padding: 0.4rem 1rem;
		font-size: 0.8rem;
		color: var(--text-secondary);
		cursor: pointer;
		transition: all 0.2s;
	}

	.load-more-btn:hover {
		background: var(--bg-hover);
	}

	.load-more-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.comment-item {
		background: var(--bg-secondary);
		border: 1px solid var(--border-light);
		border-radius: 12px;
		padding: 0.6rem 0.8rem;
	}

	.comment-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.25rem;
	}

	.comment-user {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.user-name {
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--text-primary);
	}

	.user-title {
		font-size: 0.65rem;
		font-weight: 600;
		padding: 0.15rem 0.4rem;
		border-radius: 4px;
		background: var(--color-info-bg, #e3f2fd);
		color: var(--color-blue-bright, #1565c0);
	}

	.comment-meta {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.comment-time {
		font-size: 0.7rem;
		color: var(--text-muted);
	}

	.delete-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 0.7rem;
		padding: 0.1rem 0.3rem;
		cursor: pointer;
		border-radius: 4px;
		transition: all 0.15s;
	}

	.delete-btn:hover {
		color: var(--color-red-dark, #c62828);
		background: rgba(198, 40, 40, 0.08);
	}

	.comment-content {
		font-size: 0.9rem;
		line-height: 1.45;
		color: var(--text-darker);
		word-break: break-word;
	}

	.comment-content :global(.mention) {
		color: var(--color-blue-bright, #1565c0);
		font-weight: 600;
	}

	.input-area {
		flex-shrink: 0;
		padding: 0.5rem;
		border-top: 1px solid var(--border-light);
	}

	.input-hint {
		margin: 0 0 0.3rem 0.4rem;
		font-size: 0.7rem;
		color: var(--text-muted, #999);
	}

	.wtp-chat-input {
		width: 100%;
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--border-default, #ddd);
		border-radius: 10px;
		font-size: 0.9rem;
		outline: none;
		transition: border-color 0.15s;
	}
	.wtp-chat-input:focus {
		border-color: var(--color-blue, #339af0);
	}

	/* Modal */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 200;
	}

	.modal {
		background: var(--bg-primary, #fff);
		border-radius: 20px;
		padding: 1.5rem;
		width: 85%;
		max-width: 300px;
		text-align: center;
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.15);
		animation: modalIn 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.modal-message {
		font-size: 0.95rem;
		font-weight: 500;
		color: var(--text-primary, #333);
		margin: 0 0 1.2rem;
		line-height: 1.5;
	}

	.modal-btn {
		width: 100%;
		background: linear-gradient(135deg, var(--bg-dark, #1a1a1a) 0%, #111 100%);
		color: #fff;
		border: none;
		padding: 0.75rem;
		border-radius: 12px;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: transform 0.15s;
	}

	.modal-btn:active {
		transform: scale(0.97);
	}

	.modal-actions {
		display: flex;
		gap: 0.6rem;
	}

	.modal-btn-secondary {
		flex: 1;
		background: var(--bg-tertiary, #f1f3f5);
		color: var(--text-primary, #333);
		border: none;
		padding: 0.75rem;
		border-radius: 12px;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: transform 0.15s;
	}

	.modal-btn-secondary:active {
		transform: scale(0.97);
	}

	.modal-btn-danger {
		flex: 1;
		background: var(--color-red, #ef4444);
		color: #fff;
		border: none;
		padding: 0.75rem;
		border-radius: 12px;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: transform 0.15s;
	}

	.modal-btn-danger:active {
		transform: scale(0.97);
	}

	@keyframes modalIn {
		from { opacity: 0; transform: scale(0.92); }
		to { opacity: 1; transform: scale(1); }
	}

</style>

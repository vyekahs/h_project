<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';

	let { data } = $props();

	interface Comment {
		id: number;
		game_id: string;
		user_id: number;
		content: string;
		created_at: string;
		nickname: string;
		title_name: string | null;
	}

	const partyId = data.party.id;
	const userId = data.user!.id;

	let comments: Comment[] = $state([...data.initialComments].reverse());
	let hasMore = $state(data.hasMore);
	let loading = $state(false);
	let loadingMore = $state(false);
	let inputValue = $state('');
	let submitting = $state(false);
	let scrollContainer: HTMLDivElement | undefined = $state();
	let modalMessage = $state('');
	let showModal = $state(false);
	let deleteTargetId = $state<number | null>(null);
	let showDeleteConfirm = $state(false);
	let chatPage: HTMLDivElement | undefined = $state();

	// SSE 연결
	let eventSource: EventSource | null = null;

	onMount(() => {
		// 채팅방 진입 시 해당 파티 채팅 알림 읽음 처리
		fetch('/api/notifications/read', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ referenceId: `party_chat:${partyId}` }),
		}).then(res => {
			if (res.ok) window.dispatchEvent(new Event('notifications-read'));
		}).catch(() => {});

		// 초기 스크롤 하단
		requestAnimationFrame(() => {
			if (scrollContainer) {
				scrollContainer.scrollTop = scrollContainer.scrollHeight;
			}
		});

		// SSE 구독
		eventSource = new EventSource('/api/sse/notifications');
		eventSource.addEventListener('party_chat', (e) => {
			try {
				const payload = JSON.parse(e.data);
				if (payload.partyId === partyId) {
					comments = [...comments, payload.comment];
					requestAnimationFrame(() => {
						if (scrollContainer) {
							scrollContainer.scrollTop = scrollContainer.scrollHeight;
						}
					});
				}
			} catch {}
		});

		// visualViewport API로 모바일 키보드 대응
		function handleViewportResize() {
			if (!chatPage) return;
			const vv = window.visualViewport;
			if (vv) {
				chatPage.style.height = `${vv.height}px`;
				chatPage.style.top = `${vv.offsetTop}px`;
				// 키보드 올라올 때 스크롤 하단 유지
				requestAnimationFrame(() => {
					if (scrollContainer) {
						scrollContainer.scrollTop = scrollContainer.scrollHeight;
					}
				});
			}
		}

		window.visualViewport?.addEventListener('resize', handleViewportResize);
		window.visualViewport?.addEventListener('scroll', handleViewportResize);

		return () => {
			eventSource?.close();
			window.visualViewport?.removeEventListener('resize', handleViewportResize);
			window.visualViewport?.removeEventListener('scroll', handleViewportResize);
		};
	});

	async function loadOlder() {
		if (loadingMore || !hasMore || comments.length === 0) return;
		loadingMore = true;

		const oldestId = comments[0]?.id;
		const prevScrollHeight = scrollContainer?.scrollHeight ?? 0;

		try {
			const res = await fetch(`/api/party/${partyId}/chat?before=${oldestId}&limit=20`);
			if (res.ok) {
				const data = await res.json();
				const olderComments = (data.comments ?? []).reverse();
				comments = [...olderComments, ...comments];
				hasMore = data.hasMore ?? false;

				requestAnimationFrame(() => {
					if (scrollContainer) {
						const newScrollHeight = scrollContainer.scrollHeight;
						scrollContainer.scrollTop = newScrollHeight - prevScrollHeight;
					}
				});
			}
		} catch (e) {
			console.error('Failed to load older messages', e);
		} finally {
			loadingMore = false;
		}
	}

	async function handleSubmit() {
		const content = inputValue.trim();
		if (!content || submitting) return;
		submitting = true;

		try {
			const res = await fetch(`/api/party/${partyId}/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content }),
			});

			if (res.ok) {
				const data = await res.json();
				comments = [...comments, data.comment];
				inputValue = '';

				requestAnimationFrame(() => {
					if (scrollContainer) {
						scrollContainer.scrollTop = scrollContainer.scrollHeight;
					}
				});
			} else {
				const err = await res.json();
				modalMessage = err.error || '메시지 전송에 실패했습니다';
				showModal = true;
			}
		} catch {
			modalMessage = '메시지 전송에 실패했습니다';
			showModal = true;
		} finally {
			submitting = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	}

	function confirmDelete(commentId: number) {
		deleteTargetId = commentId;
		showDeleteConfirm = true;
	}

	async function executeDelete() {
		if (!deleteTargetId) return;
		showDeleteConfirm = false;
		try {
			const res = await fetch(`/api/party/${partyId}/chat/${deleteTargetId}`, { method: 'DELETE' });
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
</script>

<svelte:head>
	<title>{data.party.name} 채팅</title>
</svelte:head>

<div class="chat-page" bind:this={chatPage}>
	<!-- Header -->
	<header class="chat-header">
		<button class="back-btn" onclick={() => history.back()} aria-label="뒤로 가기">
			<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="15 18 9 12 15 6"></polyline>
			</svg>
		</button>
		<div class="header-info">
			<h1 class="party-name">{data.party.name}</h1>
			<span class="member-count">{data.party.members.length}명</span>
		</div>
	</header>

	<!-- Chat messages -->
	<div class="chat-scroll" bind:this={scrollContainer}>
		{#if comments.length === 0 && !loading}
			<div class="empty-state">
				<p>아직 대화가 없습니다</p>
				<p class="empty-sub">첫 메시지를 보내보세요!</p>
			</div>
		{:else}
			{#if hasMore}
				<div class="load-more-top">
					<button class="load-more-btn" onclick={loadOlder} disabled={loadingMore}>
						{loadingMore ? '불러오는 중...' : '이전 메시지 더 보기'}
					</button>
				</div>
			{/if}

			{#each comments as comment (comment.id)}
				{@const isMine = comment.user_id === userId}
				<div class="message-row" class:mine={isMine}>
					<div class="message-bubble" class:mine={isMine}>
						{#if !isMine}
							<div class="message-sender">
								<span class="sender-name">{comment.nickname}</span>
								{#if comment.title_name}
									<span class="sender-title">{comment.title_name}</span>
								{/if}
							</div>
						{/if}
						<div class="message-content">{comment.content}</div>
						<div class="message-meta">
							<span class="message-time">{formatTimeAgo(comment.created_at)}</span>
							{#if isMine}
								<button class="delete-btn" onclick={() => confirmDelete(comment.id)}>삭제</button>
							{/if}
						</div>
					</div>
				</div>
			{/each}
		{/if}
	</div>

	<!-- Input area -->
	<div class="input-area">
		<input
			type="text"
			class="chat-input"
			bind:value={inputValue}
			onkeydown={handleKeydown}
			placeholder="메시지를 입력하세요"
			disabled={submitting}
			maxlength="200"
		/>
		<button class="send-btn" onclick={handleSubmit} disabled={submitting || !inputValue.trim()}>
			<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
				<path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
			</svg>
		</button>
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
			<p class="modal-message">메시지를 삭제하시겠습니까?</p>
			<div class="modal-actions">
				<button class="modal-btn-secondary" onclick={() => showDeleteConfirm = false}>취소</button>
				<button class="modal-btn-danger" onclick={executeDelete}>삭제</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.chat-page {
		display: flex;
		flex-direction: column;
		position: fixed;
		left: 0;
		right: 0;
		top: 0;
		height: 100%;
		z-index: 50;
		background: var(--bg-secondary);
		color: var(--text-primary);
		color-scheme: inherit;
		transition: background-color 0.2s, color 0.2s;
	}

	/* Header */
	.chat-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: var(--bg-primary);
		border-bottom: 1px solid var(--border-light);
		flex-shrink: 0;
	}

	.back-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border: none;
		background: none;
		border-radius: 10px;
		color: var(--text-primary);
		cursor: pointer;
		padding: 0;
		transition: background 0.15s;
	}

	.back-btn:hover {
		background: var(--bg-hover);
	}

	.header-info {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		min-width: 0;
	}

	.party-name {
		font-size: 1.05rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.member-count {
		font-size: 0.8rem;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	/* Chat scroll area */
	.chat-scroll {
		flex: 1;
		overflow-y: auto;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
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
		background: var(--bg-primary);
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

	/* Messages */
	.message-row {
		display: flex;
	}

	.message-row.mine {
		justify-content: flex-end;
	}

	.message-bubble {
		max-width: 80%;
		background: var(--bg-primary);
		border: 1px solid var(--border-light);
		border-radius: 14px;
		padding: 0.5rem 0.75rem;
	}

	.message-bubble.mine {
		background: var(--color-info-bg);
		border-color: transparent;
	}

	.message-sender {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin-bottom: 0.2rem;
	}

	.sender-name {
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--text-primary);
	}

	.sender-title {
		font-size: 0.6rem;
		font-weight: 600;
		padding: 0.1rem 0.3rem;
		border-radius: 4px;
		background: var(--color-info-bg);
		color: var(--color-blue-bright);
	}

	.message-content {
		font-size: 0.9rem;
		line-height: 1.45;
		color: var(--text-primary);
		word-break: break-word;
	}

	.message-meta {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		justify-content: flex-end;
		margin-top: 0.15rem;
	}

	.message-time {
		font-size: 0.65rem;
		color: var(--text-muted);
	}

	.delete-btn {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 0.65rem;
		padding: 0.05rem 0.2rem;
		cursor: pointer;
		border-radius: 4px;
		transition: all 0.15s;
	}

	.delete-btn:hover {
		color: var(--color-red-dark);
		background: var(--color-error-bg);
	}

	/* Input area */
	.input-area {
		flex-shrink: 0;
		display: flex;
		gap: 0.5rem;
		padding: 0.6rem 0.75rem;
		background: var(--bg-primary);
		border-top: 1px solid var(--border-light);
		padding-bottom: calc(0.6rem + env(safe-area-inset-bottom, 0px));
	}

	.chat-input {
		flex: 1;
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--border-default);
		border-radius: 20px;
		font-size: 0.9rem;
		outline: none;
		transition: border-color 0.15s;
		background: var(--bg-secondary);
		color: var(--text-primary);
	}

	.chat-input::placeholder {
		color: var(--text-hint);
	}

	.chat-input:focus {
		border-color: var(--color-blue);
	}

	.send-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		border: none;
		background: var(--color-blue);
		color: white;
		cursor: pointer;
		flex-shrink: 0;
		transition: opacity 0.15s;
	}

	.send-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.send-btn:not(:disabled):hover {
		opacity: 0.85;
	}

	/* Modals */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: var(--overlay-heavy);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 200;
	}

	.modal {
		background: var(--bg-primary);
		border-radius: 20px;
		padding: 1.5rem;
		width: 85%;
		max-width: 300px;
		text-align: center;
		box-shadow: 0 16px 48px var(--shadow-lg);
		animation: modalIn 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.modal-message {
		font-size: 0.95rem;
		font-weight: 500;
		color: var(--text-primary);
		margin: 0 0 1.2rem;
		line-height: 1.5;
	}

	.modal-btn {
		width: 100%;
		background: var(--color-blue);
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
		background: var(--bg-tertiary);
		color: var(--text-primary);
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
		background: var(--color-red);
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

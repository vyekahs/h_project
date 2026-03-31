<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { user } from '$lib/stores/user';
	import { showToast } from '$lib/stores/notifications.svelte';

	interface Notification {
		id: number;
		type: string;
		message: string;
		from_user_id: number | null;
		from_user_name: string | null;
		reference_id: string | null;
		is_read: boolean;
		created_at: string;
	}

	let unreadCount = $state(0);
	let notifications: Notification[] = $state([]);
	let showDropdown = $state(false);
	let loading = $state(false);
	let eventSource: EventSource | null = null;
	let dropdownRef: HTMLDivElement | undefined = $state();
	let bellBtnRef: HTMLButtonElement | undefined = $state();
	let dropdownStyle = $state('');

	// Swipe state
	let swipingId: number | null = $state(null);
	let swipeOffset = $state(0);
	let touchStartX = 0;
	let touchStartY = 0;
	let isSwiping = $state(false);

	onMount(() => {
		fetchUnreadCount();
		connectSSE();
		document.addEventListener('click', handleClickOutside);
	});

	onDestroy(() => {
		eventSource?.close();
		if (typeof document !== 'undefined') {
			document.removeEventListener('click', handleClickOutside);
		}
	});

	function handleClickOutside(e: MouseEvent) {
		if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
			showDropdown = false;
		}
	}

	async function fetchUnreadCount() {
		try {
			const res = await fetch('/api/notifications/unread-count');
			if (res.ok) {
				const data = await res.json();
				unreadCount = data.count ?? 0;
			}
		} catch {}
	}

	function connectSSE() {
		eventSource = new EventSource('/api/sse/notifications');

		eventSource.addEventListener('notification', (e) => {
			try {
				const data = JSON.parse(e.data);
				unreadCount++;
				showToast({ title: data.title, body: data.body, url: data.url });
			} catch {}
		});

		eventSource.addEventListener('error', () => {
			eventSource?.close();
			setTimeout(connectSSE, 5000);
		});
	}

	async function toggleDropdown() {
		showDropdown = !showDropdown;
		if (showDropdown) {
			if (bellBtnRef) {
				const rect = bellBtnRef.getBoundingClientRect();
				const dropdownWidth = 300;
				const top = rect.bottom + 8;
				// 드롭다운이 화면 왼쪽 밖으로 나가지 않도록 right 제한
				const maxRight = window.innerWidth - dropdownWidth - 8;
				const right = Math.max(8, Math.min(window.innerWidth - rect.right - 8, maxRight));
				dropdownStyle = `top: ${top}px; right: ${right}px;`;
			}
			if (notifications.length === 0) {
				await loadNotifications();
			}
		} else {
			// 닫을 때 스와이프 리셋
			resetSwipe();
		}
	}

	async function loadNotifications() {
		loading = true;
		try {
			const res = await fetch('/api/notifications?limit=10');
			if (res.ok) {
				const data = await res.json();
				notifications = data.notifications ?? [];
			}
		} catch {} finally {
			loading = false;
		}
	}

	async function handleNotificationClick(n: Notification) {
		// 스와이프 중이면 클릭 무시
		if (swipingId === n.id) return;

		// Mark as read
		if (!n.is_read) {
			try {
				await fetch('/api/notifications/read', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ notificationIds: [n.id] }),
				});
				n.is_read = true;
				unreadCount = Math.max(0, unreadCount - 1);
			} catch {}
		}

		showDropdown = false;

		// Navigate to reference URL
		if (n.reference_id) {
			const parts = n.reference_id.split(':');
			if (parts[0] === 'game' && parts[1]) {
				// game:sudoku:comment:123
				goto(`/minigames/start/${parts[1]}?tab=comments`);
			} else if (parts[0] === 'visit_plan') {
				goto('/');
			} else if (parts[0] === 'game_session') {
				goto('/');
			} else if (parts[0] === 'ranking' && parts[1]) {
				goto(`/minigames/start/${parts[1]}?tab=ranking`);
			} else if (parts[0] === 'party_chat' && parts[1]) {
				goto(`/party/${parts[1]}/chat`);
			} else if (parts[0] === 'party_invite') {
				goto('/mypage?tab=parties');
			}
		}
	}

	async function markAllRead() {
		try {
			await fetch('/api/notifications/read', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ all: true }),
			});
			notifications = notifications.map(n => ({ ...n, is_read: true }));
			unreadCount = 0;
		} catch {}
	}

	// Swipe handlers
	function handleTouchStart(e: TouchEvent, id: number) {
		// 다른 항목 스와이프 중이면 리셋
		if (swipingId !== null && swipingId !== id) {
			resetSwipe();
		}
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
		isSwiping = false;
		swipingId = id;
		swipeOffset = 0;
	}

	function handleTouchMove(e: TouchEvent) {
		if (swipingId === null) return;
		const dx = e.touches[0].clientX - touchStartX;
		const dy = e.touches[0].clientY - touchStartY;

		// 세로 스크롤이 더 크면 스와이프 취소
		if (!isSwiping && Math.abs(dy) > Math.abs(dx)) {
			swipingId = null;
			swipeOffset = 0;
			return;
		}

		if (Math.abs(dx) > 10) {
			isSwiping = true;
		}

		if (isSwiping) {
			e.preventDefault();
			// 왼쪽으로만 허용, 최대 -70px
			swipeOffset = Math.max(-70, Math.min(0, dx));
		}
	}

	function handleTouchEnd() {
		if (swipingId === null) return;
		if (swipeOffset < -35) {
			// 충분히 스와이프했으면 삭제 버튼 열기
			swipeOffset = -70;
		} else {
			// 아니면 원위치
			resetSwipe();
		}
		isSwiping = false;
	}

	function resetSwipe() {
		swipingId = null;
		swipeOffset = 0;
		isSwiping = false;
	}

	async function deleteNotification(id: number) {
		const n = notifications.find(n => n.id === id);
		try {
			await fetch('/api/notifications', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ notificationId: id }),
			});
			if (n && !n.is_read) {
				unreadCount = Math.max(0, unreadCount - 1);
			}
			notifications = notifications.filter(n => n.id !== id);
			resetSwipe();
		} catch {}
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

{#if $user.id}
<div class="notification-bell" bind:this={dropdownRef}>
	<button class="bell-btn" bind:this={bellBtnRef} onclick={toggleDropdown} aria-label="알림">
		<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/>
			<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
		</svg>
		{#if unreadCount > 0}
			<span class="badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
		{/if}
	</button>

	{#if showDropdown}
		<div class="dropdown" style={dropdownStyle}>
			<div class="dropdown-header">
				<span class="dropdown-title">알림</span>
				{#if unreadCount > 0}
					<button class="mark-all-btn" onclick={markAllRead}>모두 읽음</button>
				{/if}
			</div>

			<div class="dropdown-body">
				{#if loading}
					<div class="dropdown-empty">불러오는 중...</div>
				{:else if notifications.length === 0}
					<div class="dropdown-empty">알림이 없습니다</div>
				{:else}
					{#each notifications as n (n.id)}
						<div class="notification-swipe-wrapper">
							<div
								class="notification-item-container"
								class:unread={!n.is_read}
								style="transform: translateX({swipingId === n.id ? swipeOffset : 0}px); transition: {isSwiping && swipingId === n.id ? 'none' : 'transform 0.2s ease'};"
								ontouchstart={(e) => handleTouchStart(e, n.id)}
								ontouchmove={handleTouchMove}
								ontouchend={handleTouchEnd}
								role="group"
							>
								<button
									class="notification-item"
									onclick={() => handleNotificationClick(n)}
								>
									<div class="notif-content">
										<p class="notif-message">{n.message}</p>
										<span class="notif-time">{formatTimeAgo(n.created_at)}</span>
									</div>
									{#if !n.is_read}
										<span class="unread-dot"></span>
									{/if}
								</button>
							</div>
							<button
								class="delete-btn"
								onclick={() => deleteNotification(n.id)}
							>
								삭제
							</button>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>
{/if}

<style>
	.notification-bell {
		position: relative;
	}

	.bell-btn {
		position: relative;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.4rem;
		color: var(--text-secondary);
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		transition: background 0.15s;
	}

	.bell-btn:hover {
		background: var(--overlay-light);
	}

	.badge {
		position: absolute;
		top: 0;
		right: -2px;
		background: var(--color-red, #ef4444);
		color: white;
		font-size: 0.6rem;
		font-weight: 700;
		min-width: 16px;
		height: 16px;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 3px;
		line-height: 1;
	}

	.dropdown {
		position: fixed;
		width: 300px;
		max-height: 400px;
		background: var(--bg-primary);
		border: 1px solid var(--border-default);
		border-radius: 12px;
		box-shadow: 0 4px 20px var(--shadow-lg);
		z-index: 9999;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.dropdown-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--border-light);
	}

	.dropdown-title {
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--text-primary);
	}

	.mark-all-btn {
		background: none;
		border: none;
		color: var(--color-blue-bright, #007bff);
		font-size: 0.75rem;
		cursor: pointer;
		padding: 0.2rem 0.4rem;
		border-radius: 4px;
	}

	.mark-all-btn:hover {
		background: var(--color-info-bg);
	}

	.dropdown-body {
		overflow-y: auto;
		max-height: 340px;
	}

	.dropdown-empty {
		padding: 2rem;
		text-align: center;
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	.notification-swipe-wrapper {
		position: relative;
		overflow: hidden;
	}

	.notification-item-container {
		position: relative;
		z-index: 1;
		background: var(--bg-primary);
	}

	.notification-item-container.unread {
		background: var(--color-info-bg);
	}

	.delete-btn {
		position: absolute;
		top: 0;
		right: 0;
		width: 70px;
		height: 100%;
		background: var(--color-red, #ef4444);
		color: white;
		border: none;
		cursor: pointer;
		font-size: 0.8rem;
		font-weight: 600;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 0;
	}

	.notification-item {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 0.7rem 1rem;
		border: none;
		background: none;
		cursor: pointer;
		text-align: left;
		gap: 0.5rem;
		transition: background 0.15s;
	}

	.notification-item:hover {
		background: var(--bg-hover);
	}

	.notif-content {
		flex: 1;
		min-width: 0;
	}

	.notif-message {
		font-size: 0.82rem;
		color: var(--text-primary);
		margin: 0;
		line-height: 1.35;
		word-break: break-word;
	}

	.notif-time {
		font-size: 0.7rem;
		color: var(--text-muted);
		margin-top: 0.15rem;
		display: block;
	}

	.unread-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-blue-bright, #007bff);
		flex-shrink: 0;
	}
</style>

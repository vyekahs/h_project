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
		if (showDropdown && notifications.length === 0) {
			await loadNotifications();
		}
	}

	async function loadNotifications() {
		loading = true;
		try {
			const res = await fetch('/api/notifications');
			if (res.ok) {
				const data = await res.json();
				notifications = data.notifications ?? [];
			}
		} catch {} finally {
			loading = false;
		}
	}

	async function handleNotificationClick(n: Notification) {
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
			// reference_id format: "game:sudoku:comment:123"
			const parts = n.reference_id.split(':');
			if (parts[0] === 'game' && parts[1]) {
				goto(`/minigames/start/${parts[1]}?tab=comments`);
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
	<button class="bell-btn" onclick={toggleDropdown} aria-label="알림">
		<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/>
			<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
		</svg>
		{#if unreadCount > 0}
			<span class="badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
		{/if}
	</button>

	{#if showDropdown}
		<div class="dropdown">
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
						<button
							class="notification-item"
							class:unread={!n.is_read}
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
		position: absolute;
		top: calc(100% + 8px);
		right: -8px;
		width: 300px;
		max-height: 400px;
		background: var(--bg-primary);
		border: 1px solid var(--border-default);
		border-radius: 12px;
		box-shadow: 0 4px 20px var(--shadow-lg);
		z-index: 1100;
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

	.notification-item.unread {
		background: var(--color-info-bg);
	}

	.notification-item.unread:hover {
		background: rgba(59, 130, 246, 0.12);
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

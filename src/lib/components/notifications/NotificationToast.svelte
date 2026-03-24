<script lang="ts">
	import { goto } from '$app/navigation';
	import { getToasts, dismissToast } from '$lib/stores/notifications.svelte';

	const toasts = $derived(getToasts());

	function handleClick(toast: { id: number; url?: string }) {
		dismissToast(toast.id);
		if (toast.url) {
			goto(toast.url);
		}
	}
</script>

{#if toasts.length > 0}
	<div class="toast-container">
		{#each toasts as toast (toast.id)}
			<div
				class="toast"
				onclick={() => handleClick(toast)}
				onkeydown={(e) => e.key === 'Enter' && handleClick(toast)}
				role="button"
				tabindex="0"
			>
				<div class="toast-icon">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/>
						<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
					</svg>
				</div>
				<div class="toast-content">
					<p class="toast-title">{toast.title}</p>
					<p class="toast-body">{toast.body}</p>
				</div>
				<button
					class="toast-close"
					onclick={(e) => { e.stopPropagation(); dismissToast(toast.id); }}
					aria-label="닫기"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="18" y1="6" x2="6" y2="18"/>
						<line x1="6" y1="6" x2="18" y2="18"/>
					</svg>
				</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	.toast-container {
		position: fixed;
		top: env(safe-area-inset-top, 0);
		left: 50%;
		transform: translateX(-50%);
		width: 100%;
		max-width: 400px;
		z-index: 2000;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem;
		pointer-events: none;
	}

	.toast {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		background: var(--bg-primary, #fff);
		border: 1px solid var(--border-default, #ddd);
		border-radius: 12px;
		padding: 0.75rem 1rem;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
		cursor: pointer;
		pointer-events: auto;
		text-align: left;
		width: 100%;
		animation: slideDown 0.3s ease-out;
		transition: opacity 0.2s, transform 0.2s;
	}

	.toast:hover {
		transform: translateY(-1px);
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.toast-icon {
		flex-shrink: 0;
		color: var(--color-blue-bright, #007bff);
		margin-top: 1px;
	}

	.toast-content {
		flex: 1;
		min-width: 0;
	}

	.toast-title {
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0;
	}

	.toast-body {
		font-size: 0.78rem;
		color: var(--text-secondary);
		margin: 0.15rem 0 0;
		line-height: 1.3;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.toast-close {
		flex-shrink: 0;
		background: none;
		border: none;
		color: var(--text-muted);
		padding: 0.2rem;
		cursor: pointer;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.toast-close:hover {
		background: var(--overlay-light);
		color: var(--text-primary);
	}
</style>

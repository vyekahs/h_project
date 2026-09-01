<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	import HardwareMonitor from './HardwareMonitor.svelte';
	import PerformanceMonitor from './PerformanceMonitor.svelte';

	let { data } = $props();

	let activeTab = $state<'hardware' | 'performance'>('hardware');

	onMount(() => {
		const urlTab = $page.url.searchParams.get('tab');
		if (urlTab === 'performance') activeTab = 'performance';
	});

	function switchTab(tab: 'hardware' | 'performance') {
		activeTab = tab;
		goto(`?tab=${tab}`, { replaceState: true, noScroll: true });
	}
</script>

<svelte:head>
	<title>모니터 - 관리자</title>
</svelte:head>

<div class="monitor-page">
	<div class="header">
		<h1>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
				<line x1="8" y1="21" x2="16" y2="21" />
				<line x1="12" y1="17" x2="12" y2="21" />
			</svg>
			모니터
		</h1>
	</div>

	<div class="tab-nav">
		<button class="tab-btn" class:active={activeTab === 'hardware'} onclick={() => switchTab('hardware')}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<rect x="4" y="4" width="16" height="16" rx="2" />
				<rect x="9" y="9" width="6" height="6" />
			</svg>
			하드웨어
		</button>
		<button class="tab-btn" class:active={activeTab === 'performance'} onclick={() => switchTab('performance')}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<path d="M3 3v18h18" />
				<path d="m19 9-5 5-4-4-3 3" />
			</svg>
			성능
		</button>
	</div>

	<!-- Keep both mounted to preserve data streams -->
	<div class="tab-content">
		<div style="display: {activeTab === 'hardware' ? 'block' : 'none'}">
			<HardwareMonitor />
		</div>
		<div style="display: {activeTab === 'performance' ? 'block' : 'none'}">
			<PerformanceMonitor {data} />
		</div>
	</div>
</div>

<style>
	.monitor-page {
		padding: 1.5rem;
		max-width: 1400px;
		margin: 0 auto;
	}

	.header {
		margin-bottom: 2rem;
		padding-bottom: 1rem;
		border-bottom: 2px solid var(--border-light);
	}

	.header h1 {
		margin: 0;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--text-primary);
	}

	.header h1 svg {
		color: var(--color-blue-bright);
	}

	.tab-nav {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
		background: var(--bg-secondary);
		padding: 0.5rem;
		border-radius: 12px;
		box-shadow: 0 2px 4px var(--shadow-sm);
	}

	.tab-btn {
		flex: 1;
		background: transparent;
		border: none;
		padding: 0.875rem 1.5rem;
		cursor: pointer;
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-secondary);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.625rem;
		transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
		font-family: inherit;
		border-radius: 8px;
		position: relative;
	}

	.tab-btn::before {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--bg-hover);
		border-radius: 8px;
		opacity: 0;
		transition: opacity 0.25s;
	}

	.tab-btn:hover::before {
		opacity: 1;
	}

	.tab-btn:hover {
		color: var(--text-primary);
		transform: translateY(-1px);
	}

	.tab-btn.active {
		color: var(--color-blue-bright);
		background: var(--bg-primary);
		box-shadow: 0 2px 8px var(--shadow-md),
		            0 0 0 1px var(--border-default);
	}

	.tab-btn.active::before {
		display: none;
	}

	.tab-btn svg {
		flex-shrink: 0;
		position: relative;
		z-index: 1;
		transition: transform 0.25s;
	}

	.tab-btn.active svg {
		transform: scale(1.1);
	}

	.tab-content {
		animation: fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		min-height: 60vh;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Mobile Responsive */
	@media (max-width: 768px) {
		.monitor-page {
			padding: 1rem;
		}

		.header {
			margin-bottom: 1.5rem;
		}

		.header h1 {
			font-size: 1.5rem;
			gap: 0.5rem;
		}

		.tab-nav {
			gap: 0.375rem;
			padding: 0.375rem;
		}

		.tab-btn {
			padding: 0.75rem 1rem;
			font-size: 0.9rem;
			gap: 0.5rem;
			min-height: 44px;
		}

		.tab-btn svg {
			width: 16px;
			height: 16px;
		}
	}

	/* Dark mode enhancements */
	@media (prefers-color-scheme: dark) {
		.tab-nav {
			box-shadow: 0 2px 8px var(--shadow-md);
		}

		.tab-btn.active {
			box-shadow: 0 2px 12px var(--shadow-lg),
			            0 0 0 1px var(--border-medium);
		}
	}
</style>

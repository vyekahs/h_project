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
	<title>통합 모니터링 - 관리자</title>
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
			통합 모니터링
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
	.header {
		margin-bottom: 1.5rem;
	}

	.header h1 {
		margin: 0;
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.tab-nav {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
		border-bottom: 2px solid #eee;
	}

	.tab-btn {
		background: none;
		border: none;
		border-bottom: 3px solid transparent;
		padding: 0.75rem 1.5rem;
		cursor: pointer;
		font-size: 1rem;
		font-weight: 500;
		color: #666;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		transition: all 0.2s;
		font-family: inherit;
	}

	.tab-btn:hover {
		color: #333;
		background: #f5f5f5;
		border-radius: 8px 8px 0 0;
	}

	.tab-btn.active {
		color: #007bff;
		border-bottom-color: #007bff;
		background: #f8f9fa;
	}

	.tab-btn svg {
		flex-shrink: 0;
	}

	.tab-content {
		animation: fadeIn 0.2s ease-in-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* Mobile Responsive */
	@media (max-width: 768px) {
		.tab-nav {
			gap: 0.25rem;
		}

		.tab-btn {
			padding: 0.5rem 1rem;
			font-size: 0.9rem;
		}

		.tab-btn svg {
			width: 16px;
			height: 16px;
		}
	}
</style>

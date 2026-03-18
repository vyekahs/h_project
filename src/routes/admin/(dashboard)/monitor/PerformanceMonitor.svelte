<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidate } from '$app/navigation';

	let { data } = $props();

	// Extract performance data from props
	const perfData = $derived(data.performance || data);

	// View toggle: realtime vs historical
	let viewMode = $state<'realtime' | 'historical'>('realtime');
	let historicalData = $state<any>(null);
	let loading = $state(false);

	// 5초마다 자동 새로고침
	let intervalId: ReturnType<typeof setInterval> | null = null;

	onMount(() => {
		intervalId = setInterval(() => {
			invalidate('/admin/monitor');
		}, 5000);

		return () => {
			if (intervalId) clearInterval(intervalId);
		};
	});

	async function loadHistoricalData() {
		loading = true;
		try {
			const res = await fetch('/api/admin/performance/history');
			if (res.ok) {
				historicalData = await res.json();
			}
		} catch (e) {
			console.error('Failed to load historical data:', e);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (viewMode === 'historical' && !historicalData) {
			loadHistoricalData();
		}
	});

	function formatUptime(ms: number): string {
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) return `${days}일 ${hours % 24}시간`;
		if (hours > 0) return `${hours}시간 ${minutes % 60}분`;
		if (minutes > 0) return `${minutes}분 ${seconds % 60}초`;
		return `${seconds}초`;
	}

	function formatTime(timestamp: number): string {
		return new Date(timestamp).toLocaleTimeString('ko-KR');
	}

	function getStatusColor(value: number, thresholds: { warning: number; danger: number }): string {
		if (value >= thresholds.danger) return 'text-red-600';
		if (value >= thresholds.warning) return 'text-yellow-600';
		return 'text-green-600';
	}
</script>

<div class="p-6 max-w-7xl mx-auto">
	<div class="flex items-center justify-between mb-6">
		<h1 class="text-2xl font-bold">서버 성능 모니터링</h1>
		<div class="text-sm text-gray-500">5초마다 자동 새로고침</div>
	</div>

	<!-- System Health Overview -->
	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
		<div class="card">
			<div class="text-sm text-gray-500 mb-1">서버 가동 시간</div>
			<div class="text-2xl font-bold">{formatUptime(perfData.health.uptime)}</div>
		</div>

		<div class="card">
			<div class="text-sm text-gray-500 mb-1">평균 응답 시간</div>
			<div
				class="text-2xl font-bold {getStatusColor(perfData.health.avgResponseTime, {
					warning: 200,
					danger: 500
				})}"
			>
				{perfData.health.avgResponseTime}ms
			</div>
		</div>

		<div class="card">
			<div class="text-sm text-gray-500 mb-1">P95 응답 시간</div>
			<div
				class="text-2xl font-bold {getStatusColor(perfData.health.p95ResponseTime, {
					warning: 300,
					danger: 1000
				})}"
			>
				{perfData.health.p95ResponseTime}ms
			</div>
		</div>

		<div class="card">
			<div class="text-sm text-gray-500 mb-1">느린 요청 비율</div>
			<div
				class="text-2xl font-bold {getStatusColor(perfData.health.slowRequestRate, {
					warning: 10,
					danger: 30
				})}"
			>
				{perfData.health.slowRequestRate}%
			</div>
		</div>
	</div>

	<!-- Real-time Metrics -->
	<div class="card mb-6">
		<h2 class="text-lg font-semibold mb-4">실시간 메트릭 (최근 1분)</h2>
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
			<div>
				<div class="text-sm text-gray-500">분당 요청 수</div>
				<div class="text-xl font-bold">{perfData.realtime.requestsPerMinute}</div>
			</div>
			<div>
				<div class="text-sm text-gray-500">평균 응답 시간</div>
				<div class="text-xl font-bold">{perfData.realtime.avgResponseTime}ms</div>
			</div>
			<div>
				<div class="text-sm text-gray-500">느린 요청 수</div>
				<div class="text-xl font-bold">{perfData.realtime.slowRequestsPerMinute}</div>
			</div>
		</div>
	</div>

	<!-- Endpoint Statistics -->
	<div class="card mb-6">
		<h2 class="text-lg font-semibold mb-4">엔드포인트별 통계 (느린 순)</h2>
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="table-header">
					<tr>
						<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">엔드포인트</th>
						<th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">요청 수</th>
						<th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">평균</th>
						<th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">최소</th>
						<th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">최대</th>
						<th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">느린 요청</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-200">
					{#each perfData.endpoints as endpoint}
						<tr class="hover:bg-gray-50">
							<td class="px-4 py-2 text-sm font-mono">{endpoint.path}</td>
							<td class="px-4 py-2 text-sm text-right">{endpoint.count}</td>
							<td
								class="px-4 py-2 text-sm text-right {getStatusColor(endpoint.avgDuration, {
									warning: 200,
									danger: 500
								})}"
							>
								{Math.round(endpoint.avgDuration)}ms
							</td>
							<td class="px-4 py-2 text-sm text-right text-gray-500">
								{Math.round(endpoint.minDuration)}ms
							</td>
							<td class="px-4 py-2 text-sm text-right text-red-600">
								{Math.round(endpoint.maxDuration)}ms
							</td>
							<td class="px-4 py-2 text-sm text-right">{endpoint.slowCount}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<!-- Slow Requests with Toggle -->
	<div class="card mb-6">
		<div class="flex justify-between items-center mb-4">
			<h2 class="text-lg font-semibold">느린 요청 (≥200ms)</h2>

			<!-- View Toggle -->
			<div class="view-toggle">
				<button
					class="toggle-btn {viewMode === 'realtime' ? 'active' : ''}"
					onclick={() => (viewMode = 'realtime')}
				>
					실시간 (메모리)
				</button>
				<button
					class="toggle-btn {viewMode === 'historical' ? 'active' : ''}"
					onclick={() => (viewMode = 'historical')}
				>
					전체 기록 (DB)
				</button>
			</div>
		</div>

		{#if viewMode === 'realtime'}
			<!-- Memory-based slow requests -->
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="table-header">
						<tr>
							<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">시간</th>
							<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">경로</th>
							<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">메서드</th>
							<th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">응답시간</th>
							<th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">상태</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200">
						{#each perfData.slowRequests as request}
							<tr class="hover:bg-gray-50">
								<td class="px-4 py-2 text-sm text-gray-600">{formatTime(request.timestamp)}</td>
								<td class="px-4 py-2 text-sm font-mono">{request.path}</td>
								<td class="px-4 py-2 text-sm">{request.method}</td>
								<td
									class="px-4 py-2 text-sm text-right {getStatusColor(request.duration, {
										warning: 500,
										danger: 1000
									})}"
								>
									{request.duration}ms
								</td>
								<td class="px-4 py-2 text-sm text-right">{request.statusCode}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<!-- Historical view (DB-based) -->
			{#if loading}
				<div class="loading-state">
					<div class="spinner"></div>
					<p>데이터 로딩 중...</p>
				</div>
			{:else if historicalData}
				<div class="mb-4 p-3 history-stats">
					<div class="text-sm text-gray-700">
						<strong>최근 7일 통계:</strong>
						총 {historicalData.stats.total}건 |
						평균 {historicalData.stats.avgDuration}ms |
						최대 {historicalData.stats.maxDuration}ms
					</div>
				</div>

				<div class="overflow-x-auto">
					<table class="w-full">
						<thead class="table-header">
							<tr>
								<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">시간</th>
								<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">경로</th>
								<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">메서드</th>
								<th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">응답시간</th>
								<th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">상태</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-gray-200">
							{#each historicalData.slowRequests as request}
								<tr class="hover:bg-gray-50">
									<td class="px-4 py-2 text-sm text-gray-600">
										{formatTime(new Date(request.timestamp).getTime())}
									</td>
									<td class="px-4 py-2 text-sm font-mono">{request.path}</td>
									<td class="px-4 py-2 text-sm">{request.method}</td>
									<td
										class="px-4 py-2 text-sm text-right {getStatusColor(request.duration, {
											warning: 500,
											danger: 1000
										})}"
									>
										{request.duration}ms
									</td>
									<td class="px-4 py-2 text-sm text-right">{request.statusCode}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div class="empty-state">
					<p>기록된 데이터가 없습니다.</p>
				</div>
			{/if}
		{/if}
	</div>

	<!-- Slow Queries -->
	{#if perfData.slowQueries.length > 0}
		<div class="card">
			<h2 class="text-lg font-semibold mb-4">최근 느린 DB 쿼리 (≥50ms)</h2>
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="table-header">
						<tr>
							<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">시간</th>
							<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">쿼리</th>
							<th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase"
								>실행시간</th
							>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200">
						{#each perfData.slowQueries as query}
							<tr class="hover:bg-gray-50">
								<td class="px-4 py-2 text-sm text-gray-600">{formatTime(query.timestamp)}</td>
								<td class="px-4 py-2 text-sm font-mono text-gray-800">{query.query}</td>
								<td
									class="px-4 py-2 text-sm text-right {getStatusColor(query.duration, {
										warning: 100,
										danger: 500
									})}"
								>
									{query.duration}ms
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	<div class="info-box">
		<h3 class="font-semibold mb-2">성능 임계값 기준</h3>
		<ul class="text-sm space-y-1 text-gray-700">
			<li><span class="text-green-600">●</span> 정상: 응답 &lt;200ms, 느린 요청 &lt;10%</li>
			<li>
				<span class="text-yellow-600">●</span> 주의: 응답 200-500ms, 느린 요청 10-30%
			</li>
			<li><span class="text-red-600">●</span> 위험: 응답 ≥500ms, 느린 요청 ≥30%</li>
		</ul>
	</div>
</div>

<style>
	/* Card Styles */
	.card {
		background: var(--bg-primary);
		border: 1px solid var(--border-default);
		border-radius: 12px;
		padding: 1.5rem;
		box-shadow: 0 2px 8px var(--shadow-sm);
		margin-bottom: 1.5rem;
		transition: box-shadow 0.2s;
	}

	.card:hover {
		box-shadow: 0 4px 12px var(--shadow-md);
	}

	.card h2 {
		color: var(--text-primary);
		font-size: 1.125rem;
		font-weight: 700;
		margin: 0 0 1.25rem 0;
	}

	/* Grid Stats */
	:global(.grid) {
		display: grid;
		gap: 1.5rem;
	}

	:global(.grid-cols-4) {
		grid-template-columns: repeat(4, 1fr);
	}

	:global(.grid-cols-3) {
		grid-template-columns: repeat(3, 1fr);
	}

	.stat-card {
		background: var(--bg-secondary);
		padding: 1.25rem;
		border-radius: 10px;
		border: 1px solid var(--border-light);
	}

	.stat-label {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		margin-bottom: 0.5rem;
		font-weight: 500;
	}

	.stat-value {
		font-size: 1.875rem;
		font-weight: 700;
		color: var(--text-primary);
	}

	.stat-value.success {
		color: var(--color-green);
	}

	.stat-value.warning {
		color: var(--color-amber);
	}

	.stat-value.danger {
		color: var(--color-red);
	}

	/* Tables */
	:global(table) {
		width: 100%;
		border-collapse: collapse;
	}

	:global(thead) {
		background: var(--bg-tertiary);
		border-bottom: 2px solid var(--border-default);
	}

	:global(th) {
		padding: 0.875rem 1rem;
		text-align: left;
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	:global(td) {
		padding: 0.875rem 1rem;
		color: var(--text-primary);
		font-size: 0.875rem;
		border-bottom: 1px solid var(--border-light);
	}

	:global(tbody tr) {
		transition: background-color 0.15s;
	}

	:global(tbody tr:hover) {
		background: var(--bg-hover);
	}

	:global(.font-mono) {
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		font-size: 0.8125rem;
	}

	/* Info Box */
	.info-box {
		margin-top: 1.5rem;
		padding: 1.25rem;
		background: var(--color-info-bg);
		border: 1px solid var(--color-blue);
		border-radius: 10px;
	}

	.info-box h3 {
		margin: 0 0 0.75rem 0;
		font-size: 1rem;
		font-weight: 700;
		color: var(--text-primary);
	}

	.info-box ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.info-box li {
		padding: 0.375rem 0;
		font-size: 0.875rem;
		color: var(--text-secondary);
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.info-box li span {
		font-size: 1.25rem;
		line-height: 1;
	}

	/* Historical Data */
	.history-stats {
		padding: 1rem;
		background: var(--color-info-bg);
		border: 1px solid var(--color-blue);
		border-radius: 8px;
		margin-bottom: 1.25rem;
	}

	.history-stats strong {
		color: var(--text-primary);
	}

	/* View Toggle */
	.view-toggle {
		display: flex;
		gap: 0.375rem;
		background: var(--bg-secondary);
		padding: 0.375rem;
		border-radius: 10px;
		border: 1px solid var(--border-light);
	}

	.toggle-btn {
		background: transparent;
		border: none;
		padding: 0.625rem 1.25rem;
		border-radius: 7px;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-secondary);
		cursor: pointer;
		transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
		font-family: inherit;
	}

	.toggle-btn:hover {
		color: var(--text-primary);
		background: var(--bg-hover);
	}

	.toggle-btn.active {
		background: var(--bg-primary);
		color: var(--color-blue-bright);
		box-shadow: 0 2px 6px var(--shadow-md);
	}

	/* Loading State */
	.loading-state {
		text-align: center;
		padding: 3rem;
		color: var(--text-secondary);
	}

	.loading-state p {
		margin-top: 1rem;
		font-size: 0.95rem;
	}

	.spinner {
		border: 3px solid var(--bg-tertiary);
		border-top: 3px solid var(--color-blue-bright);
		border-radius: 50%;
		width: 48px;
		height: 48px;
		animation: spin 1s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite;
		margin: 0 auto 1rem;
	}

	@keyframes spin {
		0% {
			transform: rotate(0deg);
		}
		100% {
			transform: rotate(360deg);
		}
	}

	.empty-state {
		text-align: center;
		padding: 3rem;
		color: var(--text-tertiary);
		font-size: 0.95rem;
	}

	/* Overflow handling */
	:global(.overflow-x-auto) {
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		margin: -0.5rem;
		padding: 0.5rem;
		position: relative;
	}

	:global(.overflow-x-auto::after) {
		content: '';
		position: absolute;
		right: 0;
		top: 0;
		bottom: 0;
		width: 40px;
		background: linear-gradient(to left, var(--bg-primary), transparent);
		pointer-events: none;
		opacity: 0;
		transition: opacity 0.3s;
	}

	@media (max-width: 768px) {
		:global(.overflow-x-auto::after) {
			opacity: 1;
		}
	}

	/* Mobile Responsive */
	@media (max-width: 768px) {
		.card {
			padding: 1rem;
			border-radius: 10px;
		}

		.card h2 {
			font-size: 1rem;
			margin-bottom: 1rem;
		}

		.view-toggle {
			gap: 0.25rem;
			padding: 0.25rem;
			flex-direction: column;
		}

		.toggle-btn {
			padding: 0.625rem 1rem;
			font-size: 0.8125rem;
			width: 100%;
		}

		/* Stat cards stack on mobile */
		:global(.grid-cols-4),
		:global(.grid-cols-3) {
			grid-template-columns: repeat(2, 1fr);
			gap: 1rem;
		}

		.stat-card {
			padding: 1rem;
		}

		.stat-label {
			font-size: 0.75rem;
		}

		.stat-value {
			font-size: 1.5rem;
		}

		/* Table responsive */
		:global(th),
		:global(td) {
			padding: 0.625rem 0.75rem;
			font-size: 0.8125rem;
		}

		:global(th) {
			font-size: 0.6875rem;
		}

		:global(.font-mono) {
			font-size: 0.75rem;
		}

		/* Compact table on mobile */
		:global(table) {
			min-width: 600px;
		}

		/* Info box */
		.info-box {
			padding: 1rem;
		}

		.info-box h3 {
			font-size: 0.9375rem;
		}

		.info-box li {
			font-size: 0.8125rem;
			padding: 0.25rem 0;
		}

		.history-stats {
			padding: 0.875rem;
			font-size: 0.8125rem;
		}
	}

	/* Very small screens */
	@media (max-width: 480px) {
		:global(.grid-cols-4),
		:global(.grid-cols-3) {
			grid-template-columns: 1fr;
		}

		.stat-value {
			font-size: 1.375rem;
		}

		.view-toggle {
			font-size: 0.75rem;
		}

		.toggle-btn {
			padding: 0.5rem 0.75rem;
		}
	}
</style>

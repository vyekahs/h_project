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
		<div class="grid grid-cols-1 md:grid-cols-4 gap-4">
			<div class="stat-card">
				<div class="stat-label">분당 요청 수</div>
				<div class="stat-value">{perfData.realtime.requestsPerMinute}</div>
			</div>
			<div class="stat-card">
				<div class="stat-label">평균 응답 시간</div>
				<div class="stat-value">{perfData.realtime.avgResponseTime}ms</div>
			</div>
			<div class="stat-card">
				<div class="stat-label">느린 요청 수</div>
				<div class="stat-value">{perfData.realtime.slowRequestsPerMinute}</div>
			</div>
			{#if perfData.dbPool}
				<div class="stat-card {perfData.dbPool.utilizationPercent >= 80 ? 'warning-card' : ''}">
					<div class="stat-label">DB 연결 사용률</div>
					<div class="stat-value {getStatusColor(perfData.dbPool.utilizationPercent, { warning: 70, danger: 85 })}">
						{perfData.dbPool.activeConnections}/{perfData.dbPool.maxConnections}
					</div>
					<div class="stat-sublabel">{perfData.dbPool.utilizationPercent}% 사용 중</div>
				</div>
			{/if}
		</div>
		{#if perfData.dbPool && perfData.dbPool.utilizationPercent >= 80}
			<div class="db-warning">
				⚠️ DB 연결 풀이 {perfData.dbPool.utilizationPercent}% 사용 중입니다.
				연결 수 증설을 고려하세요. (현재: 최대 {perfData.dbPool.maxConnections}개)
			</div>
		{/if}
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

	<!-- DB Pool History (Historical View Only) -->
	{#if viewMode === 'historical' && historicalData?.dbPoolHistory && historicalData.dbPoolHistory.length > 0}
		<div class="card mb-6">
			<h2 class="text-lg font-semibold mb-4">DB 연결 풀 통계 이력 (사용률 ≥70%)</h2>

			<div class="mb-4 p-3 history-stats">
				<div class="text-sm text-gray-700">
					<strong>최근 7일 통계:</strong>
					{#if historicalData.dbPoolStats}
						총 {historicalData.dbPoolStats.total}건 기록 |
						평균 사용률 {historicalData.dbPoolStats.avgUtilization}% |
						최대 사용률 {historicalData.dbPoolStats.maxUtilization}% |
						피크 연결 수 {historicalData.dbPoolStats.peakConnections}개
					{/if}
				</div>
			</div>

			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="table-header">
						<tr>
							<th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">시간</th>
							<th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">활성 연결</th>
							<th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">최대 연결</th>
							<th class="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">사용률</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200">
						{#each historicalData.dbPoolHistory as poolStat}
							<tr class="hover:bg-gray-50">
								<td class="px-4 py-2 text-sm text-gray-600">
									{formatTime(new Date(poolStat.timestamp).getTime())}
								</td>
								<td class="px-4 py-2 text-sm text-right">{poolStat.activeConnections}</td>
								<td class="px-4 py-2 text-sm text-right text-gray-500">{poolStat.maxConnections}</td>
								<td
									class="px-4 py-2 text-sm text-right font-semibold {getStatusColor(poolStat.utilizationPercent, {
										warning: 70,
										danger: 85
									})}"
								>
									{poolStat.utilizationPercent}%
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

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
		border-radius: var(--radius-card);
		padding: var(--space-5);
		margin-bottom: var(--space-5);
		transition: box-shadow 0.2s;
	}

	.card:hover {
		box-shadow: 0 4px 12px var(--shadow-md);
	}

	.card h2 {
		color: var(--text-primary);
		font-size: var(--text-lg);
		font-weight: 700;
		margin: 0 0 1.25rem 0;
	}

	/* Grid Stats */
	:global(.grid) {
		display: grid;
		gap: var(--space-5);
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
		border-radius: var(--radius-card);
		border: 1px solid var(--border-light);
	}

	.stat-label {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		margin-bottom: var(--space-2);
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
		padding: 0.875rem var(--space-4);
		text-align: left;
		font-size: var(--text-xs);
		font-weight: 700;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	:global(td) {
		padding: 0.875rem var(--space-4);
		color: var(--text-primary);
		font-size: var(--text-sm);
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
		font-size: var(--text-sm);
	}

	/* Info Box */
	.info-box {
		margin-top: var(--space-5);
		padding: 1.25rem;
		background: var(--color-info-bg);
		border: 1px solid var(--color-blue);
		border-radius: var(--radius-card);
	}

	.info-box h3 {
		margin: 0 0 var(--space-3) 0;
		font-size: var(--text-base);
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
		font-size: var(--text-sm);
		color: var(--text-secondary);
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.info-box li span {
		font-size: var(--text-lg);
		line-height: 1;
	}

	/* Historical Data */
	.history-stats {
		padding: var(--space-4);
		background: var(--color-info-bg);
		border: 1px solid var(--color-blue);
		border-radius: var(--radius-control);
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
		border-radius: var(--radius-card);
		border: 1px solid var(--border-light);
	}

	.toggle-btn {
		background: transparent;
		border: none;
		padding: 0.625rem 1.25rem;
		border-radius: 7px;
		font-size: var(--text-sm);
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
	}

	/* Loading State */
	.loading-state {
		text-align: center;
		padding: 3rem;
		color: var(--text-secondary);
	}

	.loading-state p {
		margin-top: var(--space-4);
		font-size: var(--text-sm);
	}

	.spinner {
		border: 3px solid var(--bg-tertiary);
		border-top: 3px solid var(--color-blue-bright);
		border-radius: 50%;
		width: 48px;
		height: 48px;
		animation: spin 1s cubic-bezier(0.22, 1, 0.36, 1) infinite;
		margin: 0 auto var(--space-4);
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
		font-size: var(--text-sm);
	}

	/* Overflow handling */
	:global(.overflow-x-auto) {
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		margin: -0.5rem;
		padding: var(--space-2);
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
			padding: var(--space-4);
			border-radius: var(--radius-card);
		}

		.card h2 {
			font-size: var(--text-base);
			margin-bottom: var(--space-4);
		}

		.view-toggle {
			gap: var(--space-1);
			padding: var(--space-1);
			flex-direction: column;
		}

		.toggle-btn {
			padding: 0.625rem var(--space-4);
			font-size: var(--text-sm);
			width: 100%;
		}

		/* Stat cards stack on mobile */
		:global(.grid-cols-4),
		:global(.grid-cols-3) {
			grid-template-columns: repeat(2, 1fr);
			gap: var(--space-4);
		}

		.stat-card {
			padding: var(--space-4);
		}

		.stat-label {
			font-size: var(--text-xs);
		}

		.stat-value {
			font-size: var(--text-xl);
		}

		/* Table responsive */
		:global(th),
		:global(td) {
			padding: 0.625rem var(--space-3);
			font-size: var(--text-sm);
		}

		:global(th) {
			font-size: var(--text-xs);
		}

		:global(.font-mono) {
			font-size: var(--text-xs);
		}

		/* Compact table on mobile */
		:global(table) {
			min-width: 600px;
		}

		/* Info box */
		.info-box {
			padding: var(--space-4);
		}

		.info-box h3 {
			font-size: var(--text-sm);
		}

		.info-box li {
			font-size: var(--text-sm);
			padding: var(--space-1) 0;
		}

		.history-stats {
			padding: 0.875rem;
			font-size: var(--text-sm);
		}
	}

	/* Very small screens */
	@media (max-width: 480px) {
		:global(.grid-cols-4),
		:global(.grid-cols-3) {
			grid-template-columns: 1fr;
		}

		.stat-value {
			font-size: var(--text-xl);
		}

		.view-toggle {
			font-size: var(--text-xs);
		}

		.toggle-btn {
			padding: var(--space-2) var(--space-3);
		}
	}
</style>

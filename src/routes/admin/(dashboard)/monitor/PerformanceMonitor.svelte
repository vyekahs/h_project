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
		<div class="bg-white p-4 rounded-lg shadow">
			<div class="text-sm text-gray-500 mb-1">서버 가동 시간</div>
			<div class="text-2xl font-bold">{formatUptime(perfData.health.uptime)}</div>
		</div>

		<div class="bg-white p-4 rounded-lg shadow">
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

		<div class="bg-white p-4 rounded-lg shadow">
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

		<div class="bg-white p-4 rounded-lg shadow">
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
	<div class="bg-white p-4 rounded-lg shadow mb-6">
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
	<div class="bg-white p-4 rounded-lg shadow mb-6">
		<h2 class="text-lg font-semibold mb-4">엔드포인트별 통계 (느린 순)</h2>
		<div class="overflow-x-auto">
			<table class="w-full">
				<thead class="bg-gray-50">
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
	<div class="bg-white p-4 rounded-lg shadow mb-6">
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
					<thead class="bg-gray-50">
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
				<div class="mb-4 p-3 bg-blue-50 rounded">
					<div class="text-sm text-gray-700">
						<strong>최근 7일 통계:</strong>
						총 {historicalData.stats.total}건 |
						평균 {historicalData.stats.avgDuration}ms |
						최대 {historicalData.stats.maxDuration}ms
					</div>
				</div>

				<div class="overflow-x-auto">
					<table class="w-full">
						<thead class="bg-gray-50">
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
		<div class="bg-white p-4 rounded-lg shadow">
			<h2 class="text-lg font-semibold mb-4">최근 느린 DB 쿼리 (≥50ms)</h2>
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-gray-50">
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

	<div class="mt-6 p-4 bg-blue-50 rounded-lg">
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
	/* View Toggle */
	.view-toggle {
		display: flex;
		gap: 0.5rem;
		background: #f5f5f5;
		padding: 0.25rem;
		border-radius: 8px;
	}

	.toggle-btn {
		background: transparent;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 6px;
		font-size: 0.85rem;
		font-weight: 500;
		color: #666;
		cursor: pointer;
		transition: all 0.2s;
		font-family: inherit;
	}

	.toggle-btn:hover {
		color: #333;
	}

	.toggle-btn.active {
		background: white;
		color: #007bff;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	/* Loading State */
	.loading-state {
		text-align: center;
		padding: 3rem;
		color: #666;
	}

	.spinner {
		border: 3px solid #f3f3f3;
		border-top: 3px solid #007bff;
		border-radius: 50%;
		width: 40px;
		height: 40px;
		animation: spin 1s linear infinite;
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
		padding: 2rem;
		color: #999;
	}
</style>

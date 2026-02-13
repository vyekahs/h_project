<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	interface Metrics {
		cpu: { usage: number; cores: number };
		memory: {
			heapUsed: number;
			heapTotal: number;
			rss: number;
			external: number;
			systemTotal: number;
			systemFree: number;
		};
		db: {
			totalCount: number;
			idleCount: number;
			waitingCount: number;
			latencyMs: number;
		};
		connections: { socketIO: number; sse: number };
		uptime: number;
		timestamp: number;
	}

	let metrics: Metrics | null = null;
	let connected = false;
	let eventSource: EventSource | null = null;

	function formatBytes(bytes: number): string {
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
		return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
	}

	function formatUptime(seconds: number): string {
		const d = Math.floor(seconds / 86400);
		const h = Math.floor((seconds % 86400) / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = seconds % 60;
		const parts: string[] = [];
		if (d > 0) parts.push(`${d}일`);
		if (h > 0) parts.push(`${h}시간`);
		if (m > 0) parts.push(`${m}분`);
		if (parts.length === 0) parts.push(`${s}초`);
		return parts.join(' ');
	}

	function cpuColor(usage: number): string {
		if (usage < 50) return '#4caf50';
		if (usage < 80) return '#ff9800';
		return '#f44336';
	}

	function systemMemUsed(metrics: Metrics): number {
		return metrics.memory.systemTotal - metrics.memory.systemFree;
	}

	function memPercent(metrics: Metrics): number {
		return Math.round((systemMemUsed(metrics) / metrics.memory.systemTotal) * 100);
	}

	function memColor(percent: number): string {
		if (percent < 50) return '#4caf50';
		if (percent < 80) return '#ff9800';
		return '#f44336';
	}

	function dbStatusText(metrics: Metrics): string {
		if (metrics.db.latencyMs < 0) return 'Error';
		if (metrics.db.waitingCount > 0) return 'Busy';
		return 'OK';
	}

	function dbStatusColor(metrics: Metrics): string {
		if (metrics.db.latencyMs < 0) return '#f44336';
		if (metrics.db.waitingCount > 0) return '#ff9800';
		return '#4caf50';
	}

	let pollTimer: ReturnType<typeof setInterval> | null = null;

	async function fetchMetrics() {
		try {
			const res = await fetch('/api/admin/monitor');
			if (res.ok) {
				metrics = await res.json();
				connected = true;
			} else {
				connected = false;
			}
		} catch {
			connected = false;
		}
	}

	function startPolling() {
		fetchMetrics();
		pollTimer = setInterval(fetchMetrics, 5000);
	}

	function connectSSE() {
		eventSource = new EventSource('/api/sse/admin/monitor');

		eventSource.onmessage = (event) => {
			metrics = JSON.parse(event.data);
			connected = true;
		};

		eventSource.onerror = () => {
			connected = false;
			// SSE failed — close and fall back to polling
			if (eventSource) {
				eventSource.close();
				eventSource = null;
			}
			if (!pollTimer) {
				startPolling();
			}
		};
	}

	onMount(() => {
		connectSSE();
	});

	onDestroy(() => {
		if (eventSource) {
			eventSource.close();
			eventSource = null;
		}
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
	});
</script>

<div class="monitor-page">
	<div class="header">
		<h1>
			<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:10px; vertical-align:text-bottom;"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
			서버 모니터
		</h1>
		<div class="connection-status" class:connected>
			<span class="dot"></span>
			{connected ? '실시간 연결됨' : '연결 끊김'}
		</div>
	</div>

	{#if metrics}
		<!-- KPI Cards -->
		<div class="kpi-grid">
			<!-- CPU -->
			<div class="kpi-card">
				<h3>CPU 사용률</h3>
				<div class="value" style="color: {cpuColor(metrics.cpu.usage)}">{metrics.cpu.usage}%</div>
				<div class="progress-bg">
					<div class="progress-bar" style="width: {metrics.cpu.usage}%; background: {cpuColor(metrics.cpu.usage)}"></div>
				</div>
				<div class="label">{metrics.cpu.cores}코어</div>
			</div>

			<!-- Memory -->
			<div class="kpi-card">
				<h3>시스템 메모리</h3>
				<div class="value" style="color: {memColor(memPercent(metrics))}">{memPercent(metrics)}%</div>
				<div class="progress-bg">
					<div class="progress-bar" style="width: {memPercent(metrics)}%; background: {memColor(memPercent(metrics))}"></div>
				</div>
				<div class="label">{formatBytes(systemMemUsed(metrics))} / {formatBytes(metrics.memory.systemTotal)}</div>
			</div>

			<!-- DB -->
			<div class="kpi-card">
				<h3>DB 연결</h3>
				<div class="value" style="color: {dbStatusColor(metrics)}">{dbStatusText(metrics)}</div>
				<div class="db-details">
					<span>활성 {metrics.db.totalCount - metrics.db.idleCount}</span>
					<span>유휴 {metrics.db.idleCount}</span>
					<span>대기 {metrics.db.waitingCount}</span>
				</div>
				<div class="label">Ping {metrics.db.latencyMs >= 0 ? metrics.db.latencyMs + 'ms' : 'N/A'}</div>
			</div>

			<!-- Socket.IO -->
			<div class="kpi-card">
				<h3>Socket.IO</h3>
				<div class="value">{metrics.connections.socketIO}</div>
				<div class="label">활성 연결 수</div>
			</div>

			<!-- SSE -->
			<div class="kpi-card">
				<h3>SSE</h3>
				<div class="value">{metrics.connections.sse}</div>
				<div class="label">활성 스트림 수</div>
			</div>

			<!-- Uptime -->
			<div class="kpi-card">
				<h3>업타임</h3>
				<div class="value uptime">{formatUptime(metrics.uptime)}</div>
				<div class="label">서버 가동 시간</div>
			</div>
		</div>

		<!-- Detail Cards -->
		<div class="detail-grid">
			<!-- Memory Details -->
			<div class="detail-card">
				<h3>
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:text-bottom;"><path d="M6 19v-3"/><path d="M10 19v-3"/><path d="M14 19v-6"/><path d="M18 19v-6"/><path d="M6 13v-2"/><path d="M10 13v-2"/><rect x="2" y="3" width="20" height="18" rx="2"/></svg>
					메모리 상세
				</h3>
				<div class="detail-list">
					<div class="detail-row">
						<span>시스템 사용</span>
						<span class="detail-value">{formatBytes(systemMemUsed(metrics))} / {formatBytes(metrics.memory.systemTotal)}</span>
					</div>
					<div class="detail-row">
						<span>시스템 여유</span>
						<span class="detail-value">{formatBytes(metrics.memory.systemFree)}</span>
					</div>
					<div class="detail-row separator">
						<span>Node.js RSS</span>
						<span class="detail-value">{formatBytes(metrics.memory.rss)}</span>
					</div>
					<div class="detail-row">
						<span>Heap Used</span>
						<span class="detail-value">{formatBytes(metrics.memory.heapUsed)}</span>
					</div>
					<div class="detail-row">
						<span>Heap Total</span>
						<span class="detail-value">{formatBytes(metrics.memory.heapTotal)}</span>
					</div>
					<div class="detail-row">
						<span>External</span>
						<span class="detail-value">{formatBytes(metrics.memory.external)}</span>
					</div>
				</div>
			</div>

			<!-- Connection Details -->
			<div class="detail-card">
				<h3>
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:text-bottom;"><path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14"/><path d="M2 20h20"/><path d="M14 12v.01"/></svg>
					연결 상세
				</h3>
				<div class="detail-list">
					<div class="detail-row">
						<span>Socket.IO 연결</span>
						<span class="detail-value">{metrics.connections.socketIO}개</span>
					</div>
					<div class="detail-row">
						<span>SSE 스트림</span>
						<span class="detail-value">{metrics.connections.sse}개</span>
					</div>
					<div class="detail-row separator">
						<span>DB 활성 연결</span>
						<span class="detail-value">{metrics.db.totalCount - metrics.db.idleCount}개</span>
					</div>
					<div class="detail-row">
						<span>DB 유휴 연결</span>
						<span class="detail-value">{metrics.db.idleCount}개</span>
					</div>
					<div class="detail-row">
						<span>DB 대기 요청</span>
						<span class="detail-value">{metrics.db.waitingCount}개</span>
					</div>
					<div class="detail-row">
						<span>DB 응답 시간</span>
						<span class="detail-value">{metrics.db.latencyMs >= 0 ? metrics.db.latencyMs + 'ms' : 'Error'}</span>
					</div>
				</div>
			</div>
		</div>

		<div class="last-update">
			마지막 갱신: {new Date(metrics.timestamp).toLocaleTimeString('ko-KR')}
		</div>
	{:else}
		<div class="loading">
			<p>서버 메트릭 로딩 중...</p>
		</div>
	{/if}
</div>

<style>
	.monitor-page {
		/* padding handled by layout */
	}
	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
	}
	.header h1 {
		margin: 0;
	}
	.connection-status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: #999;
		padding: 0.4rem 0.8rem;
		border-radius: 20px;
		background: #f5f5f5;
	}
	.connection-status.connected {
		color: #4caf50;
		background: #e8f5e9;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #ccc;
	}
	.connection-status.connected .dot {
		background: #4caf50;
		animation: pulse 2s infinite;
	}
	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}

	/* KPI Grid */
	.kpi-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 1rem;
		margin-bottom: 1.5rem;
	}
	.kpi-card {
		background: white;
		padding: 1.25rem;
		border-radius: 12px;
		box-shadow: 0 2px 8px rgba(0,0,0,0.05);
		text-align: center;
		border: 1px solid #eee;
	}
	.kpi-card h3 {
		margin: 0;
		font-size: 0.85rem;
		color: #666;
		font-weight: normal;
	}
	.kpi-card .value {
		font-size: 2rem;
		font-weight: bold;
		color: #333;
		margin: 0.5rem 0;
	}
	.kpi-card .value.uptime {
		font-size: 1.3rem;
	}
	.kpi-card .label {
		font-size: 0.75rem;
		color: #999;
	}
	.progress-bg {
		height: 6px;
		background: #eee;
		border-radius: 3px;
		overflow: hidden;
		margin: 0.5rem 0;
	}
	.progress-bar {
		height: 100%;
		border-radius: 3px;
		transition: width 0.5s ease;
	}
	.db-details {
		display: flex;
		justify-content: center;
		gap: 0.75rem;
		font-size: 0.8rem;
		color: #666;
		margin: 0.25rem 0;
	}

	/* Detail Grid */
	.detail-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
		gap: 1.5rem;
		margin-bottom: 1.5rem;
	}
	.detail-card {
		background: white;
		padding: 1.5rem;
		border-radius: 12px;
		box-shadow: 0 2px 8px rgba(0,0,0,0.05);
		border: 1px solid #eee;
	}
	.detail-card h3 {
		margin: 0 0 1rem 0;
		font-size: 1rem;
		color: #333;
	}
	.detail-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.detail-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.9rem;
		color: #555;
		padding: 0.25rem 0;
	}
	.detail-row.separator {
		border-top: 1px solid #eee;
		padding-top: 0.5rem;
		margin-top: 0.25rem;
	}
	.detail-value {
		font-weight: 600;
		color: #333;
	}

	.last-update {
		text-align: center;
		font-size: 0.8rem;
		color: #999;
	}
	.loading {
		text-align: center;
		padding: 3rem;
		color: #999;
	}

	@media (max-width: 768px) {
		.header {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.75rem;
		}
		.kpi-grid {
			grid-template-columns: repeat(2, 1fr);
		}
		.detail-grid {
			grid-template-columns: 1fr;
		}
	}
</style>

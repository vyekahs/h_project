<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	interface MetricsSnapshot {
		cpu: number;
		memPercent: number;
		sse: number;
		db: number;
		timestamp: number;
	}

	interface AutoLog {
		time: string;
		type: 'checkin' | 'checkout' | 'auto-open';
		source: 'BLE' | 'WiFi';
		userName: string;
		attendeeId: number;
	}

	interface StuckRequest {
		id: string;
		path: string;
		method: string;
		ageMs: number;
	}

	interface AbandonedRequest {
		path: string;
		method: string;
		ranForMs: number;
		timestamp: number;
	}

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
			maxCount?: number;
			allInstancesCount?: number;
		};
		connections: { sse: number };
		stuckRequests?: StuckRequest[];
		abandonedRequests?: AbandonedRequest[];
		uptime: number;
		timestamp: number;
		history?: MetricsSnapshot[];
		autoLogs?: AutoLog[];
	}

	let metrics: Metrics | null = $state(null);
	let connected = $state(false);
	let eventSource: EventSource | null = null;
	let history: MetricsSnapshot[] = $state([]);
	let autoLogs: AutoLog[] = $state([]);

	// Modal state
	let showMemModal = $state(false);
	let showSseModal = $state(false);

	function formatBytes(bytes: number): string {
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
		return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
	}

	function formatAge(ms: number): string {
		if (ms < 60000) return `${Math.round(ms / 1000)}초`;
		const m = Math.floor(ms / 60000);
		const s = Math.round((ms % 60000) / 1000);
		return `${m}분 ${s}초`;
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

	/* 수치에 얹는 글자색. 흰 배경에서 #4caf50은 2.78:1, #ff9800은 2.16:1로
	   큰 글씨 기준(3:1)조차 못 넘겼다. 토큰의 진한 값으로 통일한다. */
	const LEVEL_COLORS = {
		ok: 'var(--color-green-dark)',
		warn: 'var(--color-orange-text)',
		bad: 'var(--color-red-dark)'
	} as const;

	function levelColor(value: number, warnAt = 50, badAt = 80): string {
		if (value < warnAt) return LEVEL_COLORS.ok;
		if (value < badAt) return LEVEL_COLORS.warn;
		return LEVEL_COLORS.bad;
	}

	function cpuColor(usage: number): string {
		return levelColor(usage);
	}

	function systemMemUsed(m: Metrics): number {
		return m.memory.systemTotal - m.memory.systemFree;
	}

	function memPercent(m: Metrics): number {
		return Math.round((systemMemUsed(m) / m.memory.systemTotal) * 100);
	}

	function memColor(percent: number): string {
		return levelColor(percent);
	}

	function dbStatusText(m: Metrics): string {
		if (m.db.latencyMs < 0) return 'Error';
		if (m.db.waitingCount > 0) return 'Busy';
		return 'OK';
	}

	function dbStatusColor(m: Metrics): string {
		if (m.db.latencyMs < 0) return LEVEL_COLORS.bad;
		if (m.db.waitingCount > 0) return LEVEL_COLORS.warn;
		return LEVEL_COLORS.ok;
	}

	function logTypeLabel(type: string): string {
		if (type === 'checkin') return '체크인';
		if (type === 'checkout') return '체크아웃';
		if (type === 'auto-open') return '자동 오픈';
		return type;
	}

	function logTypeClass(type: string): string {
		if (type === 'checkin') return 'log-checkin';
		if (type === 'checkout') return 'log-checkout';
		if (type === 'auto-open') return 'log-open';
		return '';
	}

	// SVG chart helpers
	const CHART_W = 500;
	const CHART_H = 120;
	const CHART_PAD = 30;

	function buildPath(data: number[], maxVal: number): string {
		if (data.length < 2) return '';
		const w = CHART_W - CHART_PAD;
		const h = CHART_H - 10;
		const step = w / (data.length - 1);
		const clampMax = Math.max(maxVal, 1);
		return data.map((v, i) => {
			const x = CHART_PAD + i * step;
			const y = h - (v / clampMax) * (h - 10) + 5;
			return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
		}).join(' ');
	}

	function buildAreaPath(data: number[], maxVal: number): string {
		if (data.length < 2) return '';
		const w = CHART_W - CHART_PAD;
		const h = CHART_H - 10;
		const step = w / (data.length - 1);
		const clampMax = Math.max(maxVal, 1);
		const points = data.map((v, i) => {
			const x = CHART_PAD + i * step;
			const y = h - (v / clampMax) * (h - 10) + 5;
			return `${x.toFixed(1)},${y.toFixed(1)}`;
		});
		const firstX = CHART_PAD;
		const lastX = CHART_PAD + (data.length - 1) * step;
		return `M${firstX},${h + 5} L${points.join(' L')} L${lastX.toFixed(1)},${h + 5} Z`;
	}

	function yLabels(maxVal: number): { y: number; label: string }[] {
		const h = CHART_H - 10;
		const steps = [0, Math.round(maxVal / 2), maxVal];
		return steps.map(v => ({
			y: h - (v / Math.max(maxVal, 1)) * (h - 10) + 5,
			label: String(v)
		}));
	}

	const cpuData = $derived(history.map((h) => h.cpu));
	const memData = $derived(history.map((h) => h.memPercent));
	const sseData = $derived(history.map((h) => h.sse));
	const sseMax = $derived(Math.max(5, ...sseData));
	const dbData = $derived(history.map((h) => h.db));
	const dbMax = $derived(Math.max(5, ...dbData));

	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let destroyed = false;

	async function fetchMetrics() {
		try {
			const res = await fetch('/api/admin/monitor');
			if (res.ok) {
				const data = await res.json();
				metrics = data;
				connected = true;
				if (data.history) history = data.history;
				if (data.autoLogs) autoLogs = data.autoLogs;
			}
		} catch {}
	}

	function startPolling() {
		if (pollTimer || destroyed) return;
		pollTimer = setInterval(fetchMetrics, 5000);
	}

	function connectSSE() {
		if (destroyed) return;
		if (eventSource) {
			eventSource.close();
		}

		eventSource = new EventSource('/api/sse/admin/monitor');

		eventSource.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				metrics = data;
				connected = true;
				if (data.history) history = data.history;
				if (data.autoLogs) autoLogs = data.autoLogs;
				// SSE 복구되면 폴링 중지
				if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
			} catch {}
		};

		eventSource.onerror = () => {
			connected = false;
			if (eventSource) {
				eventSource.close();
				eventSource = null;
			}
			startPolling();
			// 3초 후 SSE 재연결 시도
			if (!destroyed) {
				setTimeout(connectSSE, 3000);
			}
		};
	}

	onMount(() => {
		fetchMetrics();
		connectSSE();
	});

	onDestroy(() => {
		destroyed = true;
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
		<h2 class="panel-title">
			<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:10px; vertical-align:text-bottom;"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
			서버 모니터
		</h2>
		<div class="connection-status" class:connected>
			<span class="dot"></span>
			{connected ? '실시간 연결됨' : '연결 끊김'}
		</div>
	</div>

	{#if metrics}
		<!-- -1. 멈춘 요청 경고 (5초 이상 응답 못 준 요청) -->
		{#if metrics.stuckRequests && metrics.stuckRequests.length > 0}
			<div class="detail-card stuck-card">
				<h3>
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:text-bottom;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
					⚠️ 응답 없는 요청 ({metrics.stuckRequests.length}개)
				</h3>
				<div class="log-table-wrap">
					<table class="log-table">
						<thead>
							<tr>
								<th>경과 시간</th>
								<th>메서드</th>
								<th>경로</th>
							</tr>
						</thead>
						<tbody>
							{#each metrics.stuckRequests as r (r.id)}
								<tr>
									<td class="log-time stuck-age">{formatAge(r.ageMs)}</td>
									<td><span class="log-source">{r.method}</span></td>
									<td>{r.path}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}

		<!-- -0.5. 클라이언트가 중간에 끊어버린 장기 요청 이력 (클라이언트 쪽 프리징의 흔적) -->
		{#if metrics.abandonedRequests && metrics.abandonedRequests.length > 0}
			<div class="detail-card abandoned-card">
				<h3>
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:text-bottom;"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
					도중에 끊긴 장기 요청 이력 (클라이언트 새로고침 추정)
				</h3>
				<p class="abandoned-hint">3초 이상 진행 중이던 요청을 클라이언트가 중간에 끊은 기록입니다 — 모바일 등에서 화면이 멈춰 새로고침했을 때 남는 흔적입니다.</p>
				<div class="log-table-wrap">
					<table class="log-table">
						<thead>
							<tr>
								<th>시각</th>
								<th>진행 시간</th>
								<th>메서드</th>
								<th>경로</th>
							</tr>
						</thead>
						<tbody>
							{#each metrics.abandonedRequests as r, i (r.timestamp + '-' + i)}
								<tr>
									<td class="log-time">{new Date(r.timestamp).toLocaleTimeString('ko-KR')}</td>
									<td class="stuck-age">{formatAge(r.ranForMs)}</td>
									<td><span class="log-source">{r.method}</span></td>
									<td>{r.path}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}

		<!-- 0. 자동 체크인/체크아웃 기록 -->
		<div class="detail-card log-card">
			<h3>
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; vertical-align:text-bottom;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>
				자동 체크인/체크아웃 기록
			</h3>
			{#if autoLogs.length > 0}
				<div class="log-table-wrap">
					<table class="log-table">
						<thead>
							<tr>
								<th>시간</th>
								<th>유형</th>
								<th>소스</th>
								<th>사용자</th>
							</tr>
						</thead>
						<tbody>
							{#each autoLogs as log}
								<tr>
									<td class="log-time">{log.time}</td>
									<td><span class="log-badge {logTypeClass(log.type)}">{logTypeLabel(log.type)}</span></td>
									<td><span class="log-source">{log.source}</span></td>
									<td>{log.userName}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<p class="empty-state">아직 기록이 없습니다.</p>
			{/if}
		</div>

		<!-- 1~3. Chart Cards: CPU, RAM(clickable), SSE(clickable) -->
		<div class="charts-grid">
			<!-- 1. CPU -->
			<div class="chart-card">
				<div class="chart-header">
					<div class="chart-title">CPU 사용률</div>
					<div class="chart-value" style="color: {cpuColor(metrics.cpu.usage)}">{metrics.cpu.usage}<span class="chart-unit">%</span></div>
					<div class="chart-sub">{metrics.cpu.cores}코어</div>
				</div>
				<svg viewBox="0 0 {CHART_W} {CHART_H}" class="chart-svg">
					{#each yLabels(100) as yl}
						<line x1={CHART_PAD} y1={yl.y} x2={CHART_W} y2={yl.y} stroke="#eee" stroke-width="1" />
						<text x={CHART_PAD - 4} y={yl.y + 4} text-anchor="end" fill="#999" font-size="10">{yl.label}</text>
					{/each}
					{#if cpuData.length >= 2}
						<path d={buildAreaPath(cpuData, 100)} fill="rgba(76,175,80,0.1)" />
						<path d={buildPath(cpuData, 100)} fill="none" stroke="#4caf50" stroke-width="2" />
					{/if}
				</svg>
			</div>

			<!-- 2. RAM (clickable) -->
			<button class="chart-card clickable" onclick={() => showMemModal = true}>
				<div class="chart-header">
					<div class="chart-title">시스템 메모리 <span class="tap-hint">상세보기</span></div>
					<div class="chart-value" style="color: {memColor(memPercent(metrics))}">{memPercent(metrics)}<span class="chart-unit">%</span></div>
					<div class="chart-sub">{formatBytes(systemMemUsed(metrics))} / {formatBytes(metrics.memory.systemTotal)}</div>
				</div>
				<svg viewBox="0 0 {CHART_W} {CHART_H}" class="chart-svg">
					{#each yLabels(100) as yl}
						<line x1={CHART_PAD} y1={yl.y} x2={CHART_W} y2={yl.y} stroke="#eee" stroke-width="1" />
						<text x={CHART_PAD - 4} y={yl.y + 4} text-anchor="end" fill="#999" font-size="10">{yl.label}</text>
					{/each}
					{#if memData.length >= 2}
						<path d={buildAreaPath(memData, 100)} fill="rgba(33,150,243,0.1)" />
						<path d={buildPath(memData, 100)} fill="none" stroke="#2196f3" stroke-width="2" />
					{/if}
				</svg>
			</button>

			<!-- 3. SSE (clickable) -->
			<button class="chart-card clickable" onclick={() => showSseModal = true}>
				<div class="chart-header">
					<div class="chart-title">SSE 활성 스트림 <span class="tap-hint">상세보기</span></div>
					<div class="chart-value" style="color: var(--color-orange-text)">{metrics.connections.sse}<span class="chart-unit">개</span></div>
				</div>
				<svg viewBox="0 0 {CHART_W} {CHART_H}" class="chart-svg">
					{#each yLabels(sseMax) as yl}
						<line x1={CHART_PAD} y1={yl.y} x2={CHART_W} y2={yl.y} stroke="#eee" stroke-width="1" />
						<text x={CHART_PAD - 4} y={yl.y + 4} text-anchor="end" fill="#999" font-size="10">{yl.label}</text>
					{/each}
					{#if sseData.length >= 2}
						<path d={buildAreaPath(sseData, sseMax)} fill="rgba(255,152,0,0.1)" />
						<path d={buildPath(sseData, sseMax)} fill="none" stroke="#ff9800" stroke-width="2" />
					{/if}
				</svg>
			</button>

			<!-- 4. DB 커넥션 (clickable) -->
			<button class="chart-card clickable" onclick={() => showSseModal = true}>
				<div class="chart-header">
					<div class="chart-title">DB 커넥션 수 <span class="tap-hint">상세보기</span></div>
					<div class="chart-value" style="color: {dbStatusColor(metrics)}">{metrics.db.totalCount}<span class="chart-unit">개</span></div>
				</div>
				<svg viewBox="0 0 {CHART_W} {CHART_H}" class="chart-svg">
					{#each yLabels(dbMax) as yl}
						<line x1={CHART_PAD} y1={yl.y} x2={CHART_W} y2={yl.y} stroke="#eee" stroke-width="1" />
						<text x={CHART_PAD - 4} y={yl.y + 4} text-anchor="end" fill="#999" font-size="10">{yl.label}</text>
					{/each}
					{#if dbData.length >= 2}
						<path d={buildAreaPath(dbData, dbMax)} fill="rgba(156,39,176,0.1)" />
						<path d={buildPath(dbData, dbMax)} fill="none" stroke="#9c27b0" stroke-width="2" />
					{/if}
				</svg>
			</button>
		</div>

		<!-- 4~5. KPI row: DB, Uptime -->
		<div class="kpi-grid">
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

			<div class="kpi-card">
				<h3>업타임</h3>
				<div class="value uptime">{formatUptime(metrics.uptime)}</div>
				<div class="label">서버 가동 시간</div>
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

<!-- Memory Detail Modal -->
{#if showMemModal && metrics}
	<!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 모달의 Escape(trapFocus)와 닫기 버튼이 담당한다. -->
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div 
		class="modal-backdrop" 
		onclick={() => showMemModal = false}  
		role="button" 
		tabindex="-1"
		aria-label="모달 닫기"
	>
		<div class="modal" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-label="메모리 상세" tabindex="-1">
			<div class="modal-header">
				<h3>메모리 상세</h3>
				<button class="modal-close" onclick={() => showMemModal = false}>&times;</button>
			</div>
			<div class="detail-list">
				<div class="detail-row">
					<span>시스템 사용</span>
					<span class="detail-value">{formatBytes(systemMemUsed(metrics))} / {formatBytes(metrics.memory.systemTotal)}</span>
				</div>
				<div class="detail-row">
					<span>시스템 여유</span>
					<span class="detail-value">{formatBytes(metrics.memory.systemFree)}</span>
				</div>
				<div class="detail-row">
					<span>사용률</span>
					<span class="detail-value" style="color: {memColor(memPercent(metrics))}">{memPercent(metrics)}%</span>
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
	</div>
{/if}

<!-- SSE / Connection Detail Modal -->
{#if showSseModal && metrics}
	<!-- 백드롭은 편의용 클릭 영역. 키보드 경로는 모달의 Escape(trapFocus)와 닫기 버튼이 담당한다. -->
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div 
		class="modal-backdrop" 
		onclick={() => showSseModal = false}  
		role="button" 
		tabindex="-1"
		aria-label="모달 닫기"
	>
		<div class="modal" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-label="연결 상세" tabindex="-1">
			<div class="modal-header">
				<h3>연결 상세</h3>
				<button class="modal-close" onclick={() => showSseModal = false}>&times;</button>
			</div>
			<div class="detail-list">
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
				{#if metrics.db.maxCount}
					<div class="detail-row">
						<span>내 풀 사용량</span>
						<span class="detail-value">{metrics.db.totalCount} / {metrics.db.maxCount}개</span>
					</div>
				{/if}
				{#if metrics.db.allInstancesCount !== undefined}
					<div class="detail-row">
						<span>DB 전체 연결 <small>(다른 인스턴스 포함)</small></span>
						<span class="detail-value">{metrics.db.allInstancesCount}개</span>
					</div>
				{/if}
				<div class="detail-row">
					<span>DB 응답 시간</span>
					<span class="detail-value">{metrics.db.latencyMs >= 0 ? metrics.db.latencyMs + 'ms' : 'Error'}</span>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--space-6);
	}
	.header .panel-title {
		margin: 0;
		font-size: var(--text-lg);
	}
	.connection-status {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-sm);
		color: var(--text-muted);
		padding: 0.4rem 0.8rem;
		border-radius: var(--radius-card);
		background: var(--bg-surface);
	}
	.connection-status.connected {
		/* #4caf50은 이 연초록 위에서 2.47:1이었다 */
		color: var(--color-green-dark);
		background: var(--color-success-bg);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--border-medium);
	}
	.connection-status.connected .dot {
		background: var(--color-green-dark);
		animation: pulse 2s infinite;
	}
	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}

	/* Charts */
	.charts-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: var(--space-4);
		margin-bottom: var(--space-5);
	}
	.chart-card {
		background: white;
		padding: 1.25rem;
		border-radius: var(--radius-card);
		border: 1px solid var(--border-light);
		text-align: left;
		width: 100%;
		font-family: inherit;
		font-size: inherit;
		color: inherit;
	}
	button.chart-card {
		cursor: pointer;
		transition: border-color 0.15s, box-shadow 0.15s;
	}
	button.chart-card:hover {
		border-color: var(--border-medium);
		box-shadow: 0 4px 16px rgba(0,0,0,0.1);
	}
	.chart-header {
		margin-bottom: var(--space-3);
	}
	.chart-title {
		font-size: var(--text-sm);
		color: var(--text-secondary);
		font-weight: normal;
	}
	.tap-hint {
		font-size: var(--text-xs);
		color: var(--text-secondary);
		margin-left: 4px;
	}
	.chart-value {
		font-size: 2.2rem;
		font-weight: bold;
		line-height: 1.2;
	}
	.chart-unit {
		font-size: var(--text-base);
		font-weight: 600;
		margin-left: 2px;
	}
	.chart-sub {
		font-size: var(--text-xs);
		color: var(--text-muted);
		margin-top: 2px;
	}
	.chart-svg {
		width: 100%;
		height: auto;
	}

	/* KPI Grid */
	.kpi-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: var(--space-4);
		margin-bottom: var(--space-5);
	}
	.kpi-card {
		background: white;
		padding: 1.25rem;
		border-radius: var(--radius-card);
		text-align: center;
		border: 1px solid var(--border-light);
	}
	.kpi-card h3 {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--text-secondary);
		font-weight: normal;
	}
	.kpi-card .value {
		font-size: 2rem;
		font-weight: bold;
		color: var(--text-primary);
		margin: var(--space-2) 0;
	}
	.kpi-card .value.uptime {
		font-size: var(--text-lg);
	}
	.kpi-card .label {
		font-size: var(--text-xs);
		color: var(--text-muted);
	}
	.db-details {
		display: flex;
		justify-content: center;
		gap: var(--space-3);
		font-size: var(--text-xs);
		color: var(--text-secondary);
		margin: var(--space-1) 0;
	}

	/* Log Card */
	.detail-card {
		background: white;
		padding: var(--space-5);
		border-radius: var(--radius-card);
		border: 1px solid var(--border-light);
	}
	.detail-card h3 {
		margin: 0 0 var(--space-4) 0;
		font-size: var(--text-base);
		color: var(--text-primary);
	}
	.log-card {
		margin-bottom: var(--space-5);
	}
	.stuck-card {
		margin-bottom: var(--space-5);
		border: 1px solid var(--color-red-dark);
		background: var(--color-error-bg);
		animation: pulse-border 2s infinite;
	}
	.stuck-card h3 {
		color: var(--color-red-darker);
	}
	.stuck-age {
		font-weight: 700;
		color: var(--color-red-darker);
	}
	.abandoned-card {
		margin-bottom: var(--space-5);
		border: 1px solid var(--color-orange);
		background: var(--color-warning-bg);
	}
	.abandoned-card h3 {
		color: var(--color-orange-text);
	}
	.abandoned-hint {
		margin: 0 0 var(--space-3) 0;
		font-size: var(--text-xs);
		color: var(--text-secondary);
	}
	@keyframes pulse-border {
		0%, 100% { border-color: var(--color-red-dark); }
		50% { border-color: var(--tint-red-bg-hover); }
	}
	.log-table-wrap {
		max-height: 400px;
		overflow-y: auto;
	}
	.log-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}
	.log-table thead {
		position: sticky;
		top: 0;
		background: white;
	}
	.log-table th {
		text-align: left;
		padding: var(--space-2) var(--space-3);
		border-bottom: 2px solid var(--border-light);
		color: var(--text-secondary);
		font-weight: 600;
		font-size: var(--text-xs);
	}
	.log-table td {
		padding: 0.4rem var(--space-3);
		border-bottom: 1px solid var(--bg-surface);
	}
	.log-table tbody tr:hover {
		background: var(--bg-secondary);
	}
	.log-time {
		font-family: monospace;
		color: var(--text-tertiary);
	}
	.log-badge {
		display: inline-block;
		padding: 0.15rem var(--space-2);
		border-radius: var(--radius-card);
		font-size: var(--text-xs);
		font-weight: 600;
	}
	.log-checkin {
		background: var(--color-success-bg);
		color: var(--color-green-dark);
	}
	.log-checkout {
		background: var(--tint-red-bg);
		color: var(--color-red-darker);
	}
	.log-open {
		background: var(--color-warning-bg);
		color: var(--color-orange-text);
	}
	.log-source {
		display: inline-block;
		padding: 0.1rem 0.4rem;
		border-radius: var(--radius-control);
		font-size: var(--text-xs);
		background: var(--tint-blue-bg);
		color: var(--color-blue-bright);
		font-weight: 600;
	}
	.empty-state {
		color: var(--text-muted);
		text-align: center;
		padding: var(--space-6);
	}

	/* Modal */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: var(--space-4);
	}
	.modal {
		background: white;
		border-radius: var(--radius-card);
		padding: var(--space-5);
		width: 100%;
		max-width: 420px;
		box-shadow: 0 8px 32px rgba(0,0,0,0.15);
	}
	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: var(--space-4);
	}
	.modal-header h3 {
		margin: 0;
		font-size: var(--text-lg);
		color: var(--text-primary);
	}
	.modal-close {
		background: none;
		border: none;
		font-size: var(--text-xl);
		color: var(--text-muted);
		cursor: pointer;
		padding: 0 var(--space-1);
		line-height: 1;
	}
	.modal-close:hover {
		color: var(--text-primary);
	}
	.detail-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.detail-row {
		display: flex;
		justify-content: space-between;
		font-size: var(--text-sm);
		color: var(--text-darker);
		padding: var(--space-1) 0;
	}
	.detail-row.separator {
		border-top: 1px solid var(--border-light);
		padding-top: var(--space-2);
		margin-top: var(--space-1);
	}
	.detail-value {
		font-weight: 600;
		color: var(--text-primary);
	}

	.last-update {
		text-align: center;
		font-size: var(--text-xs);
		color: var(--text-muted);
	}
	.loading {
		text-align: center;
		padding: 3rem;
		color: var(--text-muted);
	}

	@media (max-width: 768px) {
		.header {
			flex-direction: column;
			align-items: flex-start;
			gap: var(--space-3);
		}
		.kpi-grid {
			grid-template-columns: 1fr 1fr;
		}
		.charts-grid {
			grid-template-columns: 1fr;
		}
	}
</style>

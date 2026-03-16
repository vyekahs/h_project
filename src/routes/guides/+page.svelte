<svelte:head>
	<title>게임 가이드 - 혼자놀다가게</title>
	<meta name="description" content="혼자놀다가게에서 제공하는 미니게임의 규칙, 전략, 플레이 방법을 안내합니다. 스도쿠, 티츄, 킬러 스도쿠 등 다양한 퍼즐과 카드 게임의 완벽 가이드." />
</svelte:head>

<div class="guide-page">
	<div class="container">
		<a href="/" class="back-link">← 홈으로</a>

		<div class="hero">
			<h1>게임 가이드</h1>
			<p class="subtitle">각 게임의 규칙과 전략을 알아보세요</p>
		</div>

		<p class="intro">
			혼자놀다가게에서 제공하는 미니게임들의 플레이 방법, 규칙, 전략 팁을 정리했습니다.
			처음 접하는 게임이라면 가이드를 먼저 읽어보시면 더 재미있게 즐길 수 있어요.
		</p>

		<div class="guide-grid">
			<a href="/guides/tichu" class="guide-card">
				<div class="guide-icon">🃏</div>
				<div class="guide-info">
					<h2>티츄 가이드</h2>
					<p class="guide-desc">2:2 팀 대전 카드 게임. 전략적인 카드 조합과 티츄 선언이 승부를 가릅니다.</p>
					<span class="guide-tag">카드게임</span>
					<span class="guide-tag">전략</span>
				</div>
			</a>

			<a href="/guides/sudoku" class="guide-card">
				<div class="guide-icon">🔢</div>
				<div class="guide-info">
					<h2>스도쿠 가이드</h2>
					<p class="guide-desc">9×9 격자에 1~9 숫자를 채우는 논리 퍼즐. 기본 규칙부터 고급 풀이법까지.</p>
					<span class="guide-tag">논리퍼즐</span>
					<span class="guide-tag">숫자</span>
				</div>
			</a>

			<a href="/guides/killer-sudoku" class="guide-card">
				<div class="guide-icon">🧩</div>
				<div class="guide-info">
					<h2>킬러 스도쿠 가이드</h2>
					<p class="guide-desc">스도쿠에 덧셈 규칙이 더해진 변형 퍼즐. 케이지와 합산 전략을 배워보세요.</p>
					<span class="guide-tag">논리퍼즐</span>
					<span class="guide-tag">연산</span>
				</div>
			</a>

			<a href="/guides/unblock-me" class="guide-card">
				<div class="guide-icon">📦</div>
				<div class="guide-info">
					<h2>언블록미 가이드</h2>
					<p class="guide-desc">블록을 밀어 빨간 블록을 탈출시키는 슬라이딩 퍼즐. 공간 인지력을 키워보세요.</p>
					<span class="guide-tag">퍼즐</span>
					<span class="guide-tag">공간지각</span>
				</div>
			</a>

			<a href="/guides/energy" class="guide-card">
				<div class="guide-icon">⚡</div>
				<div class="guide-info">
					<h2>에너지 서킷 가이드</h2>
					<p class="guide-desc">타일을 회전시켜 전구와 배터리를 연결하는 회로 퍼즐.</p>
					<span class="guide-tag">퍼즐</span>
					<span class="guide-tag">회로</span>
				</div>
			</a>

			<a href="/guides/water-sort" class="guide-card">
				<div class="guide-icon">🧪</div>
				<div class="guide-info">
					<h2>워터소트 가이드</h2>
					<p class="guide-desc">색깔 물을 시험관 사이로 옮겨 같은 색끼리 정리하는 퍼즐.</p>
					<span class="guide-tag">퍼즐</span>
					<span class="guide-tag">정렬</span>
				</div>
			</a>

			<a href="/guides/triple-tile" class="guide-card">
				<div class="guide-icon">🀄</div>
				<div class="guide-info">
					<h2>트리플 타일 가이드</h2>
					<p class="guide-desc">같은 타일 3개를 모아 제거하는 마작 스타일 매칭 퍼즐.</p>
					<span class="guide-tag">매칭</span>
					<span class="guide-tag">퍼즐</span>
				</div>
			</a>

			<a href="/guides/train-tracks" class="guide-card">
				<div class="guide-icon">🚂</div>
				<div class="guide-info">
					<h2>트레인 트랙 가이드</h2>
					<p class="guide-desc">선로 타일을 배치하여 출발역에서 도착역까지 기차길을 완성하세요.</p>
					<span class="guide-tag">논리퍼즐</span>
					<span class="guide-tag">경로</span>
				</div>
			</a>

			<a href="/guides/2048" class="guide-card">
				<div class="guide-icon">🎯</div>
				<div class="guide-info">
					<h2>2048 가이드</h2>
					<p class="guide-desc">같은 숫자 타일을 합쳐 2048을 만드는 클래식 슬라이딩 퍼즐.</p>
					<span class="guide-tag">퍼즐</span>
					<span class="guide-tag">전략</span>
				</div>
			</a>
		</div>
	</div>
</div>

<style>
	.guide-page {
		min-height: 100vh;
		background: var(--bg-primary);
		color: var(--text-primary);
		padding: 24px 16px 80px;
	}
	.container {
		max-width: 720px;
		margin: 0 auto;
	}
	.back-link {
		display: inline-block;
		color: var(--text-muted);
		text-decoration: none;
		font-size: 0.9rem;
		margin-bottom: 24px;
		transition: color 0.2s;
	}
	.back-link:hover { color: var(--text-primary); }
	.hero {
		text-align: center;
		margin-bottom: 24px;
	}
	.hero h1 {
		font-size: 2rem;
		font-weight: 800;
		margin: 0 0 8px;
	}
	.subtitle {
		font-size: 1.05rem;
		color: var(--text-secondary);
		margin: 0;
	}
	.intro {
		font-size: 0.95rem;
		color: var(--text-secondary);
		line-height: 1.7;
		margin: 0 0 32px;
		text-align: center;
	}
	.guide-grid {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.guide-card {
		display: flex;
		gap: 16px;
		align-items: flex-start;
		background: var(--bg-secondary);
		border: 1px solid var(--border-light);
		border-radius: 16px;
		padding: 20px;
		text-decoration: none;
		color: inherit;
		transition: all 0.2s;
	}
	.guide-card:hover {
		border-color: var(--border-default);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px var(--shadow-sm);
	}
	.guide-icon {
		font-size: 2rem;
		flex-shrink: 0;
		margin-top: 2px;
	}
	.guide-info {
		flex: 1;
		min-width: 0;
	}
	.guide-info h2 {
		font-size: 1.1rem;
		font-weight: 700;
		margin: 0 0 6px;
		color: var(--text-primary);
	}
	.guide-desc {
		font-size: 0.85rem;
		color: var(--text-muted);
		margin: 0 0 8px;
		line-height: 1.5;
	}
	.guide-tag {
		display: inline-block;
		font-size: 0.7rem;
		padding: 2px 8px;
		border-radius: 10px;
		background: var(--bg-tertiary);
		color: var(--text-tertiary);
		margin-right: 4px;
	}
</style>

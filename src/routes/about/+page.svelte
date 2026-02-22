<svelte:head>
	<title>소개 - 혼자놀다가게</title>
	<meta name="description" content="혼자놀다가게 보드게임 카페. 다양한 보드게임과 온라인 미니게임을 즐겨보세요." />
</svelte:head>

<div class="about-page">
	<div class="container">
		<a href="/" class="back-link">← 홈으로</a>

		<div class="hero">
			<h1>혼자놀다가게</h1>
			<p class="subtitle">보드게임 카페</p>
		</div>

		<section>
			<h2>혼자놀다가게는</h2>
			<p>
				혼자놀다가게는 다양한 보드게임을 즐길 수 있는 보드게임 카페입니다.
				혼자 와도, 여럿이 와도 편하게 게임을 즐길 수 있는 공간을 제공합니다.
			</p>
			<p>
				이 사이트에서는 카페 방문 현황 확인, 게임 일정 관리, 온라인 미니게임 등
				다양한 기능을 이용하실 수 있습니다.
			</p>
		</section>

		<section>
			<h2>온라인 오락실</h2>
			<p>방문하지 않아도 온라인으로 즐길 수 있는 미니게임을 제공합니다. 회원가입 후 플레이하면 기록이 저장되고 랭킹에 등록됩니다.</p>

			<div class="game-grid">
				<a href="/games/tichu" class="game-card">
					<div class="game-icon">🃏</div>
					<h3>티츄</h3>
					<p>4인 트릭 테이킹 카드 게임. AI 파트너와 함께 상대 팀을 이겨보세요. 전략적인 카드 운용과 티츄 선언이 승패를 가릅니다.</p>
				</a>

				<a href="/games/sudoku" class="game-card">
					<div class="game-icon">🔢</div>
					<h3>스도쿠</h3>
					<p>9x9 격자에 1~9 숫자를 채우는 논리 퍼즐. 난이도별로 도전하고 최고 기록을 세워보세요.</p>
				</a>

				<a href="/games/killer-sudoku" class="game-card">
					<div class="game-icon">🧩</div>
					<h3>킬러 스도쿠</h3>
					<p>스도쿠에 덧셈 규칙이 더해진 변형 퍼즐. 일반 스도쿠보다 한 단계 높은 도전을 원한다면 추천합니다.</p>
				</a>

				<a href="/games/unblock-me" class="game-card">
					<div class="game-icon">📦</div>
					<h3>언블록미</h3>
					<p>블록을 밀어 빨간 블록을 탈출시키는 슬라이딩 퍼즐. 단순하지만 점점 어려워지는 스테이지에 도전하세요.</p>
				</a>
			</div>
		</section>

		<section>
			<h2>주요 기능</h2>
			<div class="feature-list">
				<div class="feature">
					<span class="feature-icon">📊</span>
					<div>
						<h3>실시간 현황</h3>
						<p>카페 방문자 수와 진행 중인 게임을 실시간으로 확인할 수 있습니다.</p>
					</div>
				</div>
				<div class="feature">
					<span class="feature-icon">🏆</span>
					<div>
						<h3>랭킹 시스템</h3>
						<p>미니게임 기록을 경쟁하고 포인트를 모아 보상을 받으세요.</p>
					</div>
				</div>
				<div class="feature">
					<span class="feature-icon">🎮</span>
					<div>
						<h3>보드게임 라이브러리</h3>
						<p>카페에 보유한 보드게임 목록을 검색하고 정보를 확인할 수 있습니다.</p>
					</div>
				</div>
			</div>
		</section>
	</div>
</div>

<style>
	.about-page {
		min-height: 100vh;
		background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
		color: #e2e8f0;
		padding: 24px 16px 60px;
	}
	.container {
		max-width: 720px;
		margin: 0 auto;
	}
	.back-link {
		display: inline-block;
		color: #94a3b8;
		text-decoration: none;
		font-size: 0.9rem;
		margin-bottom: 24px;
		transition: color 0.2s;
	}
	.back-link:hover { color: #e2e8f0; }

	.hero {
		text-align: center;
		margin-bottom: 40px;
	}
	.hero h1 {
		font-size: 2.2rem;
		font-weight: 800;
		color: #f8fafc;
		margin: 0 0 8px;
	}
	.subtitle {
		font-size: 1.1rem;
		color: #94a3b8;
		margin: 0;
		font-weight: 500;
	}

	section {
		margin-bottom: 40px;
	}
	h2 {
		font-size: 1.3rem;
		font-weight: 700;
		color: #f1f5f9;
		margin: 0 0 16px;
	}
	p {
		font-size: 0.95rem;
		line-height: 1.7;
		color: #cbd5e1;
		margin: 0 0 12px;
	}

	.game-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 16px;
		margin-top: 16px;
	}
	.game-card {
		display: block;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		padding: 20px;
		text-decoration: none;
		color: inherit;
		transition: all 0.2s;
	}
	.game-card:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.2);
		transform: translateY(-2px);
	}
	.game-icon {
		font-size: 2rem;
		margin-bottom: 8px;
	}
	.game-card h3 {
		font-size: 1.1rem;
		font-weight: 700;
		color: #f1f5f9;
		margin: 0 0 8px;
	}
	.game-card p {
		font-size: 0.85rem;
		color: #94a3b8;
		margin: 0;
		line-height: 1.6;
	}

	.feature-list {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.feature {
		display: flex;
		gap: 16px;
		align-items: flex-start;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 14px;
		padding: 16px;
	}
	.feature-icon {
		font-size: 1.5rem;
		flex-shrink: 0;
		margin-top: 2px;
	}
	.feature h3 {
		font-size: 1rem;
		font-weight: 700;
		color: #f1f5f9;
		margin: 0 0 4px;
	}
	.feature p {
		font-size: 0.85rem;
		color: #94a3b8;
		margin: 0;
	}
</style>

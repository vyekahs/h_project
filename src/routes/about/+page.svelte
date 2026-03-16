<svelte:head>
	<title>소개 - 혼자놀다가게 | 보드게임 카페 & 온라인 게임</title>
	<meta name="description" content="혼자놀다가게는 보드게임 카페이자 온라인 게임 플랫폼입니다. 다양한 보드게임과 무료 온라인 미니게임을 즐겨보세요." />
</svelte:head>

<div class="about-page">
	<div class="container">
		<a href="/" class="back-link">← 홈으로</a>

		<div class="hero">
			<h1>혼자놀다가게</h1>
			<p class="subtitle">보드게임 카페 & 온라인 게임 플랫폼</p>
		</div>

		<section>
			<h2>혼자놀다가게는</h2>
			<p>
				혼자놀다가게는 다양한 보드게임을 즐길 수 있는 보드게임 카페입니다.
				혼자 와도, 여럿이 와도 편하게 게임을 즐길 수 있는 공간을 제공합니다.
				"혼자 놀아도 재미있는 곳"이라는 철학을 담아,
				1인 방문자도 부담 없이 다양한 게임을 경험할 수 있도록 운영하고 있습니다.
			</p>
			<p>
				카페에는 수백 종의 보드게임이 구비되어 있으며,
				전략 게임, 파티 게임, 퍼즐 게임, 카드 게임 등 다양한 장르를 갖추고 있습니다.
				게임 선택이 어려우시면 스태프가 인원수와 취향에 맞는 게임을 추천해드립니다.
			</p>
			<p>
				이 웹사이트에서는 카페 방문 현황 확인, 게임 일정 관리,
				온라인 미니게임, 랭킹 시스템 등 다양한 기능을 이용하실 수 있습니다.
				카페에 직접 방문하지 않아도 온라인으로 게임을 즐기고 다른 사용자와 기록을 겨룰 수 있습니다.
			</p>
		</section>

		<section>
			<h2>온라인 오락실</h2>
			<p>
				혼자놀다가게 온라인 오락실은 누구나 무료로 이용할 수 있는 미니게임 플랫폼입니다.
				별도의 앱 설치 없이 웹 브라우저에서 바로 플레이할 수 있으며,
				스마트폰, 태블릿, PC 등 모든 기기를 지원합니다.
				회원가입 후 로그인하면 게임 기록이 저장되고 월별 랭킹에 참여할 수 있습니다.
			</p>
			<p>
				현재 9종의 게임을 제공하고 있으며, 논리 퍼즐부터 전략 카드 게임까지 다양한 장르를 갖추고 있습니다.
				각 게임은 여러 단계의 난이도를 제공하여 초보자부터 숙련자까지 모두 즐길 수 있습니다.
				게임별 상세 규칙과 전략은 <a href="/guides">게임 가이드</a>에서 확인할 수 있습니다.
			</p>

			<div class="game-grid">
				<a href="/minigames/tichu" class="game-card">
					<div class="game-icon">🃏</div>
					<h3>티츄</h3>
					<p>4인 트릭 테이킹 카드 게임. AI 파트너와 함께 상대 팀을 이겨보세요. 전략적인 카드 운용과 티츄 선언이 승패를 가릅니다.</p>
				</a>

				<a href="/minigames/sudoku" class="game-card">
					<div class="game-icon">🔢</div>
					<h3>스도쿠</h3>
					<p>9×9 격자에 1~9 숫자를 채우는 논리 퍼즐. 5단계 난이도로 도전하고 최고 기록을 세워보세요.</p>
				</a>

				<a href="/minigames/killer-sudoku" class="game-card">
					<div class="game-icon">🧩</div>
					<h3>킬러 스도쿠</h3>
					<p>스도쿠에 덧셈 규칙이 더해진 변형 퍼즐. 일반 스도쿠보다 한 단계 높은 도전을 원한다면 추천합니다.</p>
				</a>

				<a href="/minigames/unblock-me" class="game-card">
					<div class="game-icon">📦</div>
					<h3>언블록미</h3>
					<p>블록을 밀어 빨간 블록을 탈출시키는 슬라이딩 퍼즐. 단순하지만 점점 어려워지는 스테이지에 도전하세요.</p>
				</a>

				<a href="/minigames/water-sort" class="game-card">
					<div class="game-icon">🧪</div>
					<h3>워터소트</h3>
					<p>색깔 물을 같은 색끼리 정렬하는 퍼즐. 시험관 사이로 물을 옮겨 모든 시험관을 정리하세요.</p>
				</a>

				<a href="/minigames/energy" class="game-card">
					<div class="game-icon">⚡</div>
					<h3>에너지 서킷</h3>
					<p>파이프 타일을 회전하여 발전소에서 전구까지 전력을 공급하는 회로 연결 퍼즐입니다.</p>
				</a>

				<a href="/minigames/train-tracks" class="game-card">
					<div class="game-icon">🚂</div>
					<h3>트레인 트랙</h3>
					<p>격자판에 선로를 배치하여 출발역에서 도착역까지 기차길을 완성하는 논리 퍼즐입니다.</p>
				</a>

				<a href="/minigames/2048" class="game-card">
					<div class="game-icon">🎯</div>
					<h3>2048</h3>
					<p>같은 숫자의 타일을 합쳐 2048을 만드는 슬라이딩 퍼즐. 전략적인 타일 배치가 고득점의 비결입니다.</p>
				</a>

				<a href="/minigames/triple-tile" class="game-card">
					<div class="game-icon">🀄</div>
					<h3>트리플 타일</h3>
					<p>쌓여 있는 타일에서 같은 무늬 3개를 모아 제거하는 매칭 퍼즐. 슬롯 관리가 핵심입니다.</p>
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
						<p>카페 방문자 수와 진행 중인 게임을 실시간으로 확인할 수 있습니다. 방문 전에 카페 혼잡도를 미리 파악하세요.</p>
					</div>
				</div>
				<div class="feature">
					<span class="feature-icon">🏆</span>
					<div>
						<h3>랭킹 시스템</h3>
						<p>미니게임 기록을 다른 유저와 경쟁하세요. 월별 랭킹에서 상위권에 도전하고, 게임별 최고 기록을 갱신해보세요.</p>
					</div>
				</div>
				<div class="feature">
					<span class="feature-icon">🎮</span>
					<div>
						<h3>보드게임 라이브러리</h3>
						<p>카페에 보유한 보드게임 목록을 검색하고 정보를 확인할 수 있습니다. 인원수, 장르, 난이도별로 필터링하여 원하는 게임을 쉽게 찾으세요.</p>
					</div>
				</div>
				<div class="feature">
					<span class="feature-icon">💎</span>
					<div>
						<h3>포인트 시스템</h3>
						<p>게임 클리어와 카페 방문으로 포인트를 적립하세요. 적립된 포인트는 마이페이지에서 확인할 수 있으며, 다양한 혜택으로 교환할 수 있습니다.</p>
					</div>
				</div>
				<div class="feature">
					<span class="feature-icon">📖</span>
					<div>
						<h3>게임 가이드</h3>
						<p>각 게임의 규칙, 전략, 팁을 상세하게 안내하는 <a href="/guides">게임 가이드</a>를 제공합니다. 초보자도 쉽게 게임을 배울 수 있습니다.</p>
					</div>
				</div>
			</div>
		</section>

		<section>
			<h2>이용 안내</h2>
			<p>
				혼자놀다가게 웹사이트의 모든 온라인 게임은 무료로 이용할 수 있습니다.
				회원가입 없이도 게임을 플레이할 수 있지만,
				기록 저장과 랭킹 참여를 위해서는 간단한 회원가입이 필요합니다.
			</p>
			<p>
				PWA(Progressive Web App)를 지원하여 스마트폰 홈 화면에 추가하면
				앱처럼 전체 화면에서 편하게 이용할 수 있습니다.
				별도의 앱스토어 설치가 필요 없으며, 항상 최신 버전이 자동 반영됩니다.
			</p>
			<p>
				더 궁금한 사항은 <a href="/faq">자주 묻는 질문</a> 페이지를 확인해주세요.
			</p>
		</section>
	</div>
</div>

<style>
	.about-page {
		min-height: 100vh;
		background: var(--bg-primary);
		color: var(--text-primary);
		padding: 24px 16px 60px;
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
		margin-bottom: 40px;
	}
	.hero h1 {
		font-size: 2.2rem;
		font-weight: 800;
		color: var(--text-primary);
		margin: 0 0 8px;
	}
	.subtitle {
		font-size: 1.1rem;
		color: var(--text-secondary);
		margin: 0;
		font-weight: 500;
	}

	section {
		margin-bottom: 40px;
	}
	h2 {
		font-size: 1.3rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0 0 16px;
	}
	p {
		font-size: 0.95rem;
		line-height: 1.7;
		color: var(--text-secondary);
		margin: 0 0 12px;
	}
	p a {
		color: var(--color-blue);
		text-decoration: none;
	}
	p a:hover {
		text-decoration: underline;
	}

	.game-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 16px;
		margin-top: 16px;
	}
	.game-card {
		display: block;
		background: var(--bg-secondary);
		border: 1px solid var(--border-light);
		border-radius: 16px;
		padding: 20px;
		text-decoration: none;
		color: inherit;
		transition: all 0.2s;
	}
	.game-card:hover {
		border-color: var(--border-default);
		transform: translateY(-2px);
	}
	.game-icon {
		font-size: 2rem;
		margin-bottom: 8px;
	}
	.game-card h3 {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0 0 8px;
	}
	.game-card p {
		font-size: 0.85rem;
		color: var(--text-muted);
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
		background: var(--bg-secondary);
		border: 1px solid var(--border-light);
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
		color: var(--text-primary);
		margin: 0 0 4px;
	}
	.feature p {
		font-size: 0.85rem;
		color: var(--text-muted);
		margin: 0;
	}
	.feature a {
		color: var(--color-blue);
		text-decoration: none;
	}
	.feature a:hover {
		text-decoration: underline;
	}
</style>
